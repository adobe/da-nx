import { expect } from '@esm-bundle/chai';
import createRateLimiter from '../../../nx/blocks/loc/utils/rateLimiter.js';
import { DA_RATE_LIMIT } from '../../../nx/blocks/loc/utils/utils.js';

function fakeClock() {
  const clock = { t: 0, waits: [] };
  clock.now = () => clock.t;
  clock.wait = async (ms) => {
    clock.waits.push(ms);
    clock.t += ms;
  };
  return clock;
}

describe('createRateLimiter', () => {
  it('allows a burst, then spaces requests at the rate', async () => {
    const clock = fakeClock();
    const limiter = createRateLimiter(() => ({ ratePerSec: 4, burst: 2 }), clock);
    const times = [];
    for (let i = 0; i < 4; i += 1) {
      await limiter.acquire();
      times.push(clock.t);
    }
    expect(times).to.deep.equal([0, 0, 250, 500]);
  });

  it('grants in FIFO order when called concurrently', async () => {
    const clock = fakeClock();
    const limiter = createRateLimiter(() => ({ ratePerSec: 10, burst: 1 }), clock);
    const order = [];
    await Promise.all([1, 2, 3].map((n) => limiter.acquire().then(() => order.push(n))));
    expect(order).to.deep.equal([1, 2, 3]);
    expect(clock.t).to.equal(200);
  });

  it('holds all requests during a cooldown and resumes from an empty bucket', async () => {
    const clock = fakeClock();
    const limiter = createRateLimiter(() => ({ ratePerSec: 10, burst: 5 }), clock);
    limiter.pause(1000);
    await limiter.acquire();
    expect(clock.t).to.equal(1100);
  });

  it('does not limit when the rate is not finite', async () => {
    const clock = fakeClock();
    const limiter = createRateLimiter(() => ({ ratePerSec: Infinity, burst: 1 }), clock);
    await Promise.all([1, 2, 3, 4].map(() => limiter.acquire()));
    expect(clock.t).to.equal(0);
  });

  it('keeps the DA write limit under 10 requests in any one-second window', async () => {
    const clock = fakeClock();
    const limiter = createRateLimiter(() => DA_RATE_LIMIT, clock);
    const times = [];
    for (let i = 0; i < 30; i += 1) {
      await limiter.acquire();
      times.push(clock.t);
    }
    const maxInWindow = Math.max(...times.map((start) => (
      times.filter((t) => t >= start && t < start + 1000).length
    )));
    expect(maxInWindow).to.be.at.most(10);
  });
});
