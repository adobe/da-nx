import { expect } from '@esm-bundle/chai';
import { createPacedFetch } from '../../../nx/blocks/media-library/core/rate-limit.js';

function recordingDelay() {
  const calls = [];
  const delay = (ms) => {
    calls.push(ms);
    return Promise.resolve();
  };
  return { calls, delay };
}

function response(status, headers = {}) {
  return new Response(status === 204 ? null : '{}', { status, headers });
}

describe('createPacedFetch', () => {
  it('keeps at most maxConcurrent requests in flight', async () => {
    const { delay } = recordingDelay();
    let active = 0;
    let maxActive = 0;
    const fetchFn = async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => { setTimeout(resolve, 5); });
      active -= 1;
      return response(200);
    };
    const pacedFetch = createPacedFetch({ fetchFn, maxConcurrent: 4, delay });

    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => pacedFetch(`/r/${i}`)));

    expect(results.every((r) => r.status === 200)).to.be.true;
    expect(maxActive).to.equal(4);
  });

  it('spaces request starts by 1000 / rate ms', async () => {
    const { calls, delay } = recordingDelay();
    const pacedFetch = createPacedFetch({ fetchFn: async () => response(200), rate: 8, delay });

    await Promise.all([pacedFetch('/a'), pacedFetch('/b'), pacedFetch('/c')]);

    expect(calls.filter((ms) => ms === 125).length).to.be.at.least(2);
  });

  it('retries a 429 after x-retry-after seconds', async () => {
    const { calls, delay } = recordingDelay();
    const statuses = [429, 200];
    let count = 0;
    const fetchFn = async () => {
      const status = statuses[count];
      count += 1;
      return response(status, status === 429 ? { 'x-retry-after': '3' } : {});
    };
    const pacedFetch = createPacedFetch({ fetchFn, delay });

    const resp = await pacedFetch('/a');

    expect(resp.status).to.equal(200);
    expect(count).to.equal(2);
    expect(calls).to.include(3000);
  });

  it('retries a network error, which is how a 429 without CORS headers shows up', async () => {
    const { calls, delay } = recordingDelay();
    let count = 0;
    const fetchFn = async () => {
      count += 1;
      if (count === 1) throw new TypeError('Failed to fetch');
      return response(200);
    };
    const pacedFetch = createPacedFetch({ fetchFn, retryDelaysMs: [1000, 2000], delay });

    const resp = await pacedFetch('/a');

    expect(resp.status).to.equal(200);
    expect(count).to.equal(2);
    expect(calls).to.include(1000);
  });

  it('retries a 503 with backoff', async () => {
    const { calls, delay } = recordingDelay();
    const statuses = [503, 503, 200];
    let count = 0;
    const fetchFn = async () => {
      const status = statuses[count];
      count += 1;
      return response(status);
    };
    const pacedFetch = createPacedFetch({ fetchFn, retryDelaysMs: [1000, 2000], delay });

    const resp = await pacedFetch('/a');

    expect(resp.status).to.equal(200);
    expect(count).to.equal(3);
    expect(calls).to.include.members([1000, 2000]);
  });

  it('returns the last 429 once the retries are used up', async () => {
    const { delay } = recordingDelay();
    let count = 0;
    const fetchFn = async () => {
      count += 1;
      return response(429);
    };
    const pacedFetch = createPacedFetch({ fetchFn, retryDelaysMs: [10, 20], delay });

    const resp = await pacedFetch('/a');

    expect(resp.status).to.equal(429);
    expect(count).to.equal(3);
  });

  it('rethrows a network error once the retries are used up', async () => {
    const { delay } = recordingDelay();
    const fetchFn = async () => { throw new TypeError('Failed to fetch'); };
    const pacedFetch = createPacedFetch({ fetchFn, retryDelaysMs: [10], delay });

    let error;
    try {
      await pacedFetch('/a');
    } catch (e) {
      error = e;
    }

    expect(error).to.be.instanceOf(TypeError);
  });

  it('does not retry other statuses', async () => {
    const { delay } = recordingDelay();
    let count = 0;
    const fetchFn = async () => {
      count += 1;
      return response(404);
    };
    const pacedFetch = createPacedFetch({ fetchFn, delay });

    const resp = await pacedFetch('/a');

    expect(resp.status).to.equal(404);
    expect(count).to.equal(1);
  });

  it('passes url and options through to fetchFn', async () => {
    const { delay } = recordingDelay();
    const seen = [];
    const fetchFn = async (url, opts) => {
      seen.push({ url, opts });
      return response(204);
    };
    const pacedFetch = createPacedFetch({ fetchFn, delay });
    const opts = { method: 'POST', body: '{}' };

    await pacedFetch('https://api.aem.live/o/sites/s/source/a.json', opts);

    expect(seen).to.deep.equal([{ url: 'https://api.aem.live/o/sites/s/source/a.json', opts }]);
  });
});
