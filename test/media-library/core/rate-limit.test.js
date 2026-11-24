import { expect } from '@esm-bundle/chai';
import { createPacedFetch } from '../../../nx/blocks/media-library/core/rate-limit.js';

function recordingDelay() {
  const calls = [];
  const clock = { t: 0 };
  const now = () => clock.t;
  const delay = (ms) => {
    calls.push(ms);
    clock.t += ms;
    return Promise.resolve();
  };
  return { calls, delay, now, clock };
}

function fakeTimers() {
  const clock = { t: 0 };
  let timers = [];
  const now = () => clock.t;
  const delay = (ms) => new Promise((resolve) => { timers.push({ at: clock.t + ms, resolve }); });
  const settle = () => new Promise((resolve) => { setTimeout(resolve, 0); });
  // Delivers every timer due at t, also the ones that should have fired earlier.
  const runUntil = async (t) => {
    clock.t = t;
    const due = timers.filter((timer) => timer.at <= t);
    timers = timers.filter((timer) => timer.at > t);
    due.forEach((timer) => timer.resolve());
    await settle();
  };
  const runAll = async () => {
    while (timers.length) {
      await runUntil(Math.max(clock.t, Math.min(...timers.map((timer) => timer.at))));
    }
  };
  return { now, delay, runUntil, runAll, settle };
}

function response(status, headers = {}) {
  return new Response(status === 204 ? null : '{}', { status, headers });
}

describe('createPacedFetch', () => {
  it('keeps at most maxConcurrent requests in flight', async () => {
    const { delay, now } = recordingDelay();
    let active = 0;
    let maxActive = 0;
    const fetchFn = async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => { setTimeout(resolve, 5); });
      active -= 1;
      return response(200);
    };
    const pacedFetch = createPacedFetch({ fetchFn, maxConcurrent: 4, delay, now });

    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => pacedFetch(`/r/${i}`)));

    expect(results.every((r) => r.status === 200)).to.be.true;
    expect(maxActive).to.equal(4);
  });

  it('spaces request starts by 1000 / rate ms', async () => {
    const { calls, delay, now } = recordingDelay();
    const fetchFn = async () => response(200);
    const pacedFetch = createPacedFetch({ fetchFn, rate: 8, delay, now });

    await Promise.all([pacedFetch('/a'), pacedFetch('/b'), pacedFetch('/c')]);

    expect(calls.filter((ms) => ms === 125).length).to.be.at.least(2);
  });

  it('starts a request without a timer when the last start is older than the interval', async () => {
    const { calls, delay, now, clock } = recordingDelay();
    const fetchFn = async () => response(200);
    const pacedFetch = createPacedFetch({ fetchFn, rate: 8, delay, now });

    await pacedFetch('/a');
    clock.t += 1000;
    await pacedFetch('/b');
    clock.t += 5000;
    await pacedFetch('/c');

    expect(calls).to.deep.equal([]);
  });

  it('keeps starts apart when timers fire late', async () => {
    const { now, delay, runUntil, runAll, settle } = fakeTimers();
    const starts = [];
    const fetchFn = async (url) => {
      starts.push([url, now()]);
      return response(200);
    };
    const pacedFetch = createPacedFetch({ fetchFn, rate: 8, delay, now });

    const all = Promise.all(['/a', '/b', '/c', '/d'].map((url) => pacedFetch(url)));
    await settle();
    await runUntil(1000);
    await runAll();
    await all;

    expect(starts).to.deep.equal([['/a', 0], ['/b', 1000], ['/c', 1125], ['/d', 1250]]);
  });

  it('holds queued requests back until x-retry-after has passed', async () => {
    const { now, delay, runAll, settle } = fakeTimers();
    const starts = [];
    let count = 0;
    const fetchFn = async (url) => {
      starts.push([url, now()]);
      count += 1;
      return count === 1 ? response(429, { 'x-retry-after': '3' }) : response(200);
    };
    const pacedFetch = createPacedFetch({ fetchFn, rate: 8, delay, now });

    const all = Promise.all([pacedFetch('/a'), pacedFetch('/b')]);
    await settle();
    await runAll();
    await all;

    expect(starts).to.deep.equal([['/a', 0], ['/a', 3000], ['/b', 3125]]);
  });

  it('retries a 429 after x-retry-after seconds', async () => {
    const { calls, delay, now } = recordingDelay();
    const statuses = [429, 200];
    let count = 0;
    const fetchFn = async () => {
      const status = statuses[count];
      count += 1;
      return response(status, status === 429 ? { 'x-retry-after': '3' } : {});
    };
    const pacedFetch = createPacedFetch({ fetchFn, delay, now });

    const resp = await pacedFetch('/a');

    expect(resp.status).to.equal(200);
    expect(count).to.equal(2);
    expect(calls).to.include(3000);
  });

  it('retries a network error, which is how a 429 without CORS headers shows up', async () => {
    const { calls, delay, now } = recordingDelay();
    let count = 0;
    const fetchFn = async () => {
      count += 1;
      if (count === 1) throw new TypeError('Failed to fetch');
      return response(200);
    };
    const pacedFetch = createPacedFetch({ fetchFn, retryDelaysMs: [1000, 2000], delay, now });

    const resp = await pacedFetch('/a');

    expect(resp.status).to.equal(200);
    expect(count).to.equal(2);
    expect(calls).to.include(1000);
  });

  it('retries a 503 with backoff', async () => {
    const { calls, delay, now } = recordingDelay();
    const statuses = [503, 503, 200];
    let count = 0;
    const fetchFn = async () => {
      const status = statuses[count];
      count += 1;
      return response(status);
    };
    const pacedFetch = createPacedFetch({ fetchFn, retryDelaysMs: [1000, 2000], delay, now });

    const resp = await pacedFetch('/a');

    expect(resp.status).to.equal(200);
    expect(count).to.equal(3);
    expect(calls).to.include.members([1000, 2000]);
  });

  it('returns the last 429 once the retries are used up', async () => {
    const { delay, now } = recordingDelay();
    let count = 0;
    const fetchFn = async () => {
      count += 1;
      return response(429);
    };
    const pacedFetch = createPacedFetch({ fetchFn, retryDelaysMs: [10, 20], delay, now });

    const resp = await pacedFetch('/a');

    expect(resp.status).to.equal(429);
    expect(count).to.equal(3);
  });

  it('rethrows a network error once the retries are used up', async () => {
    const { delay, now } = recordingDelay();
    const fetchFn = async () => { throw new TypeError('Failed to fetch'); };
    const pacedFetch = createPacedFetch({ fetchFn, retryDelaysMs: [10], delay, now });

    let error;
    try {
      await pacedFetch('/a');
    } catch (e) {
      error = e;
    }

    expect(error).to.be.instanceOf(TypeError);
  });

  it('does not retry a write that may have happened when asked not to', async () => {
    const { delay, now } = recordingDelay();
    let count = 0;
    const fetchFn = async () => {
      count += 1;
      if (count === 1) throw new TypeError('Failed to fetch');
      return response(503);
    };
    const pacedFetch = createPacedFetch({ fetchFn, delay, now });

    const error = await pacedFetch('/a', { method: 'DELETE' }, { retry: false }).catch((e) => e);
    const resp = await pacedFetch('/b', { method: 'DELETE' }, { retry: false });

    expect(error instanceof TypeError).to.equal(true);
    expect(resp.status).to.equal(503);
    expect(count).to.equal(2);
  });

  it('still retries a 429 when asked not to retry, since the server did not run it', async () => {
    const { delay, now } = recordingDelay();
    const statuses = [429, 201];
    let count = 0;
    const fetchFn = async () => {
      const status = statuses[count];
      count += 1;
      return response(status);
    };
    const pacedFetch = createPacedFetch({ fetchFn, delay, now });

    const resp = await pacedFetch('/a', { method: 'POST' }, { retry: false });

    expect(resp.status).to.equal(201);
    expect(count).to.equal(2);
  });

  it('does not retry other statuses', async () => {
    const { delay, now } = recordingDelay();
    let count = 0;
    const fetchFn = async () => {
      count += 1;
      return response(404);
    };
    const pacedFetch = createPacedFetch({ fetchFn, delay, now });

    const resp = await pacedFetch('/a');

    expect(resp.status).to.equal(404);
    expect(count).to.equal(1);
  });

  it('passes url and options through to fetchFn', async () => {
    const { delay, now } = recordingDelay();
    const seen = [];
    const fetchFn = async (url, opts) => {
      seen.push({ url, opts });
      return response(204);
    };
    const pacedFetch = createPacedFetch({ fetchFn, delay, now });
    const opts = { method: 'POST', body: '{}' };

    await pacedFetch('https://api.aem.live/o/sites/s/source/a.json', opts);

    expect(seen).to.deep.equal([{ url: 'https://api.aem.live/o/sites/s/source/a.json', opts }]);
  });
});
