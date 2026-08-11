const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 30000;

/**
 * Default retry predicate: rate-limited or server-error responses.
 * @param {number} status - The response's HTTP status code.
 * @returns {boolean} Whether the status should trigger a retry.
 */
function isDefaultRetryable(status) {
  return status === 429 || status >= 500;
}

/**
 * Resolves after the given delay.
 * @param {number} ms - Milliseconds to wait.
 * @returns {Promise<void>}
 */
function wait(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

/**
 * Fetches, retrying on rate-limit/transient-failure responses with
 * exponential backoff and jitter, honoring a Retry-After header when the
 * service provides one. Shared across loc connectors (Smartling,
 * Lionbridge, ...) whose translation APIs enforce request-rate and/or
 * concurrent-request limits.
 * @param {string|URL} url - The request URL.
 * @param {Object} opts - Fetch options.
 * @param {Object} [config]
 * @param {number} [config.maxRetries] - Max retry attempts after the
 *  initial request.
 * @param {number} [config.baseDelayMs] - Base delay before the first
 *  retry; doubles each subsequent attempt.
 * @param {number} [config.maxDelayMs] - Delay cap, before jitter.
 * @param {(status: number) => boolean} [config.isRetryable] - Whether a
 *  response status should trigger a retry. Defaults to 429 and 5xx.
 * @returns {Promise<Response>} The final response (ok or not).
 */
export default async function fetchWithRetry(url, opts, config = {}) {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
    isRetryable = isDefaultRetryable,
  } = config;

  /**
   * Makes one fetch attempt, retrying itself (with a delay) if the
   * response is retryable and attempts remain.
   * @param {number} attemptNum - Zero-based attempt count so far.
   * @returns {Promise<Response>} The final response (ok or not).
   */
  async function attempt(attemptNum) {
    const resp = await fetch(url, opts);
    if (!isRetryable(resp.status) || attemptNum >= maxRetries) return resp;

    const retryAfterSecs = Number(resp.headers.get('retry-after'));
    const backoff = Math.min(baseDelayMs * (2 ** attemptNum), maxDelayMs);
    const jitter = Math.random() * backoff * 0.3;
    const delayMs = Number.isFinite(retryAfterSecs) && retryAfterSecs > 0
      ? retryAfterSecs * 1000
      : backoff + jitter;

    await wait(delayMs);
    return attempt(attemptNum + 1);
  }

  return attempt(0);
}
