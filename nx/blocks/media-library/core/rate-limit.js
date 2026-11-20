const defaultDelay = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// No timer when idle: chained timers in a hidden tab are throttled to ~1/min.
export function createRateLimiter(initialRate, { delay = defaultDelay, now = Date.now } = {}) {
  let intervalMs = Math.ceil(1000 / initialRate);
  let nextStart = 0;

  return {
    async acquire() {
      const t = now();
      const start = Math.max(t, nextStart);
      nextStart = start + intervalMs;
      if (start > t) await delay(start - t);
    },
    handleResponse(res) {
      const rate = parseFloat(res.headers.get('x-ratelimit-rate'));
      if (rate > 0) intervalMs = Math.ceil(1000 / rate);
    },
    backoff(seconds) {
      nextStart = Math.max(nextStart, now() + seconds * 1000);
    },
    reset() {
      nextStart = 0;
      intervalMs = Math.ceil(1000 / initialRate);
    },
  };
}

function getRetryAfterMs(resp) {
  const seconds = parseInt(resp.headers.get('x-retry-after') || resp.headers.get('retry-after'), 10);
  return seconds > 0 ? seconds * 1000 : 0;
}

// The AEM API allows 10 req/s per project and its 429 has no CORS headers,
// so in the browser a rate-limited request surfaces as a network error.
export function createPacedFetch({
  fetchFn,
  maxConcurrent = 4,
  rate = 8,
  retryDelaysMs = [1000, 2000, 4000],
  delay = defaultDelay,
  now = Date.now,
}) {
  const limiter = createRateLimiter(rate, { delay, now });
  const waiting = [];
  let active = 0;

  const acquireSlot = () => {
    if (active < maxConcurrent) {
      active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => { waiting.push(resolve); });
  };

  const releaseSlot = () => {
    const next = waiting.shift();
    if (next) next();
    else active -= 1;
  };

  return async (url, opts) => {
    await acquireSlot();
    try {
      for (let attempt = 0; ; attempt += 1) {
        await limiter.acquire();
        let resp;
        let error;
        try {
          resp = await fetchFn(url, opts);
        } catch (e) {
          error = e;
        }
        const retryable = !!error || resp.status === 429 || resp.status === 503;
        if (!retryable || attempt >= retryDelaysMs.length) {
          if (error) throw error;
          return resp;
        }
        const waitMs = (resp?.status === 429 && getRetryAfterMs(resp)) || retryDelaysMs[attempt];
        limiter.backoff(waitMs / 1000);
      }
    } finally {
      releaseSlot();
    }
  };
}
