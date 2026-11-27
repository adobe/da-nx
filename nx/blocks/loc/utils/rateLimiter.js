function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

/**
 * Creates a FIFO token-bucket rate limiter with a shared cooldown.
 * @param {() => {ratePerSec: number, burst: number}} getConfig - Read on
 *  every acquire, so callers can change the rate at runtime.
 * @param {Object} [deps]
 * @param {() => number} [deps.now] - Clock in milliseconds.
 * @param {(ms: number) => Promise<void>} [deps.wait] - Delay function.
 * @returns {{ acquire: () => Promise<void>, pause: (ms: number) => void }}
 */
export default function createRateLimiter(getConfig, { now = Date.now, wait = sleep } = {}) {
  let tokens = null;
  let last = now();
  let cooldownUntil = 0;
  let queue = Promise.resolve();

  async function take() {
    for (;;) {
      const { ratePerSec, burst } = getConfig();
      const t = now();
      if (t < cooldownUntil) {
        await wait(cooldownUntil - t);
      } else {
        if (!(ratePerSec > 0) || !Number.isFinite(ratePerSec)) return;
        tokens = Math.min(burst, (tokens ?? burst) + (Math.max(0, t - last) / 1000) * ratePerSec);
        last = Math.max(last, t);
        if (tokens >= 1) {
          tokens -= 1;
          return;
        }
        await wait(((1 - tokens) / ratePerSec) * 1000);
      }
    }
  }

  return {
    acquire() {
      const turn = queue.then(take);
      queue = turn.catch(() => {});
      return turn;
    },
    pause(ms) {
      cooldownUntil = Math.max(cooldownUntil, now() + ms);
      // Resume from an empty bucket so the queue doesn't burst after a 429.
      tokens = 0;
      last = cooldownUntil;
    },
  };
}
