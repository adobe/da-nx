import { expect } from '@esm-bundle/chai';
import { createLimiter, withRetry } from '../../../nx/blocks/loc/utils/source.js';

function fakeClock() {
  let time = 0;
  return {
    now: () => time,
    wait: async (ms) => { time += ms; },
  };
}

const tick = () => new Promise((resolve) => { setTimeout(resolve, 5); });

describe('loc source pacing', () => {
  describe('createLimiter', () => {
    it('never runs more than maxInFlight tasks at once', async () => {
      const limit = createLimiter({ maxInFlight: 2, minIntervalMs: 0 });
      let active = 0;
      let peak = 0;
      const task = async () => {
        active += 1;
        peak = Math.max(peak, active);
        await tick();
        active -= 1;
        return 'done';
      };
      const results = await Promise.all(Array.from({ length: 6 }, () => limit(task)));
      expect(results).to.deep.equal(Array(6).fill('done'));
      expect(peak).to.equal(2);
    });

    it('spaces task starts by minIntervalMs', async () => {
      const waits = [];
      const limit = createLimiter({
        maxInFlight: 4,
        minIntervalMs: 125,
        now: () => 0,
        wait: async (ms) => { waits.push(ms); },
      });
      await Promise.all(Array.from({ length: 4 }, () => limit(async () => {})));
      expect(waits).to.deep.equal([125, 250, 375]);
    });

    it('holds new starts while paused', async () => {
      const clock = fakeClock();
      const limit = createLimiter({ maxInFlight: 4, minIntervalMs: 0, ...clock });
      limit.pause(1000);
      let start;
      await limit(async () => { start = clock.now(); });
      expect(start).to.equal(1000);
    });
  });

  describe('withRetry', () => {
    const delays = [5000, 20000, 60000];

    it('retries a network error (how a CORS-less 429 surfaces) after the first delay', async () => {
      const clock = fakeClock();
      const limiter = createLimiter({ maxInFlight: 4, minIntervalMs: 0, ...clock });
      const starts = [];
      const task = async () => {
        starts.push(clock.now());
        if (starts.length === 1) throw new TypeError('Failed to fetch');
        return new Response('ok', { status: 200 });
      };
      const resp = await withRetry(task, { limiter, delays });
      expect(resp.status).to.equal(200);
      expect(starts).to.deep.equal([0, 5000]);
    });

    it('honours x-retry-after on a readable 429', async () => {
      const clock = fakeClock();
      const limiter = createLimiter({ maxInFlight: 4, minIntervalMs: 0, ...clock });
      const starts = [];
      const task = async () => {
        starts.push(clock.now());
        if (starts.length === 1) {
          return new Response('', { status: 429, headers: { 'retry-after': '0', 'x-retry-after': '30' } });
        }
        return new Response('ok', { status: 200 });
      };
      const resp = await withRetry(task, { limiter, delays });
      expect(resp.status).to.equal(200);
      expect(starts).to.deep.equal([0, 30000]);
    });

    it('retries a 503 and a list result with status 429', async () => {
      const clock = fakeClock();
      const limiter = createLimiter({ maxInFlight: 4, minIntervalMs: 0, ...clock });
      const results = [
        new Response('', { status: 503 }),
        { ok: false, items: [], status: 429 },
        { ok: true, items: [{ name: 'a' }], status: 200 },
      ];
      let count = 0;
      const result = await withRetry(async () => {
        count += 1;
        return results.shift();
      }, { limiter, delays });
      expect(count).to.equal(3);
      expect(result.ok).to.equal(true);
    });

    it('gives up after the configured delays', async () => {
      const clock = fakeClock();
      const limiter = createLimiter({ maxInFlight: 4, minIntervalMs: 0, ...clock });
      let count = 0;
      const failing = async () => {
        count += 1;
        throw new TypeError('Failed to fetch');
      };
      let error;
      try {
        await withRetry(failing, { limiter, delays });
      } catch (e) {
        error = e;
      }
      expect(error).to.be.instanceOf(TypeError);
      expect(count).to.equal(delays.length + 1);

      count = 0;
      const throttled = async () => {
        count += 1;
        return new Response('', { status: 429 });
      };
      const resp = await withRetry(throttled, { limiter, delays });
      expect(resp.status).to.equal(429);
      expect(count).to.equal(delays.length + 1);
    });

    it('does not retry other failures', async () => {
      const clock = fakeClock();
      const limiter = createLimiter({ maxInFlight: 4, minIntervalMs: 0, ...clock });
      let count = 0;
      const resp = await withRetry(async () => {
        count += 1;
        return new Response('', { status: 404 });
      }, { limiter, delays });
      expect(resp.status).to.equal(404);
      expect(count).to.equal(1);
    });
  });
});
