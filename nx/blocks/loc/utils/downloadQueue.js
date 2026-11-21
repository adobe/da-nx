const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * Runs `callback` over `urls` with bounded concurrency. A callback that
 * throws, or returns without setting `status`, marks its url
 * `status = 'error'` (with `error`) so one bad item can't stall the rest.
 * @param {Object[]} urls - Items to process; mutated in place. `callback`
 *  sets `status` (any truthy value) once it's done with a url.
 * @param {(url: Object) => Promise<void>} callback - Per-url worker.
 * @param {number} [concurrency] - Max simultaneous `callback` calls.
 * @param {Object} [options]
 * @param {number} [options.minIntervalMs] - Minimum gap between callback
 *  starts, for vendors that rate-limit request bursts. 0 disables pacing.
 * @returns {Promise<Object[]>} The same `urls` array, once every item has
 *  a truthy `status`.
 */
export default async function downloadQueue(
  urls,
  callback,
  concurrency = 5,
  { minIntervalMs = 0 } = {},
) {
  let next = 0;
  let nextStartAt = 0;

  const waitForSlot = async () => {
    if (!minIntervalMs) return;
    const startAt = Math.max(Date.now(), nextStartAt);
    nextStartAt = startAt + minIntervalMs;
    const wait = startAt - Date.now();
    if (wait > 0) await sleep(wait);
  };

  const run = async (url) => {
    try {
      await callback(url);
      if (!url.status) {
        url.status = 'error';
        url.error ??= 'Download finished without a status.';
      }
    } catch (e) {
      url.status = 'error';
      url.error = e?.message || String(e);
    }
  };

  const worker = async () => {
    while (next < urls.length) {
      const url = urls[next];
      next += 1;
      await waitForSlot();
      await run(url);
    }
  };

  const workers = Math.max(1, Math.min(concurrency, urls.length));
  await Promise.all(Array.from({ length: workers }, worker));
  return urls;
}
