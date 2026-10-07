import { Queue } from '../../../../nx2/public/utils/tree.js';

const POLL_INTERVAL_MS = 250;

/**
 * Runs `callback` over `urls` with bounded concurrency, resolving once
 * every url has a truthy `status`. Every connector's `saveItems` used to
 * duplicate this exact throttle-and-poll shape (a `Queue` plus a
 * `setInterval` finding the next not-yet-started url); extracted here
 * since all four were identical apart from variable names.
 * @param {Object[]} urls - Items to process; mutated in place. This
 *  helper sets `inProgress` on each url right before queuing it;
 *  `callback` is responsible for setting `status` (any truthy value)
 *  once it's done with a url.
 * @param {(url: Object) => Promise<void>} callback - Per-url worker.
 * @param {number} [concurrency] - Max simultaneous `callback` calls.
 * @returns {Promise<Object[]>} The same `urls` array, once every item
 *  has a truthy `status`.
 */
export default function downloadQueue(urls, callback, concurrency = 5) {
  const queue = new Queue(callback, concurrency);

  return new Promise((resolve) => {
    const throttle = setInterval(() => {
      const nextUrl = urls.find((url) => !url.inProgress);
      if (nextUrl) {
        nextUrl.inProgress = true;
        queue.push(nextUrl);
      } else if (urls.every((url) => url.status)) {
        clearInterval(throttle);
        resolve(urls);
      }
    }, POLL_INTERVAL_MS);
  });
}
