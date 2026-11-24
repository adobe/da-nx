import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { DA_ADMIN } from '../../../nx/utils/utils.js';

let counter = 0;
const uniqueOrg = () => {
  counter += 1;
  return `locks${counter}${Date.now()}`;
};

const lockUrlFor = (org) => `${DA_ADMIN}/source/${org}/site/.da/media-insights/index-lock.json`;
const tick = () => new Promise((resolve) => { setTimeout(resolve, 5); });

function stubFetch(routes) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    const route = routes.find(([match]) => (typeof match === 'string' ? String(url) === match : match.test(String(url))));
    if (route) return route[1](String(url), opts);
    return new Response('', { status: 404 });
  };
  return calls;
}

describe('index lock heartbeat', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('waits for a running heartbeat when it stops, and sends no more', async () => {
    const org = uniqueOrg();
    const lockUrl = lockUrlFor(org);
    let release;
    const calls = stubFetch([[lockUrl, () => new Promise((resolve) => {
      release = () => resolve(new Response('', { status: 201 }));
    })]]);
    const { startIndexLockHeartbeat } = await import('../../../nx/blocks/media-library/indexing/locks.js');
    const stop = startIndexLockHeartbeat({ sitePath: `/${org}/site`, lockData: {}, intervalMs: 5 });
    while (!release) await tick();

    let stopped = false;
    const stopping = Promise.resolve(stop()).then(() => { stopped = true; });
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    const stoppedBeforeRelease = stopped;
    release();
    await stopping;
    await new Promise((resolve) => { setTimeout(resolve, 20); });

    expect(stoppedBeforeRelease).to.equal(false);
    expect(calls.filter((c) => c.url === lockUrl)).to.have.length(1);
  });

  const buildWithHeartbeatInFlight = async (workerReply) => {
    const org = uniqueOrg();
    const lockUrl = lockUrlFor(org);
    const events = [];
    let writes = 0;
    let releaseHeartbeat;
    stubFetch([
      [/\/worker\/worker\.js\?t=/, () => new Response('')],
      [lockUrl, (url, opts) => {
        if (opts.method === 'DELETE') {
          events.push('delete');
          return new Response(null, { status: 204 });
        }
        if (opts.method !== 'PUT') return new Response('', { status: 404 });
        writes += 1;
        if (writes === 1) return new Response('', { status: 201 });
        return new Promise((resolve) => {
          releaseHeartbeat = () => {
            events.push('heartbeat');
            resolve(new Response('', { status: 201 }));
          };
        });
      }],
    ]);
    let worker;
    const { Worker: OriginalWorker, adobeIMS } = window;
    window.Worker = class {
      constructor() { worker = this; }

      postMessage() {}

      terminate() {}
    };
    window.adobeIMS = { getAccessToken: () => ({ token: 'ims-token' }) };
    const clock = sinon.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const waitFor = async (check) => {
      while (!check()) await tick();
    };
    try {
      const { default: buildMediaIndex } = await import('../../../nx/blocks/media-library/indexing/build.js');
      const build = buildMediaIndex(`/${org}/site`, org, 'site', 'main').catch((e) => e);
      await waitFor(() => worker?.onmessage);
      clock.tick(60_000);
      await waitFor(() => releaseHeartbeat);
      worker.onmessage({ data: workerReply });
      await new Promise((resolve) => { setTimeout(resolve, 400); });
      releaseHeartbeat();
      return { result: await build, events };
    } finally {
      clock.restore();
      window.Worker = OriginalWorker;
      window.adobeIMS = adobeIMS;
    }
  };

  it('lets a running heartbeat finish before a finished build deletes the lock', async function test() {
    this.timeout(5000);
    const { result, events } = await buildWithHeartbeatInFlight({ type: 'success', data: [] });

    expect(result.hasChanges).to.equal(true);
    expect(events).to.deep.equal(['heartbeat', 'delete']);
  });

  it('lets a running heartbeat finish before a failed build deletes the lock', async function test() {
    this.timeout(5000);
    const { result, events } = await buildWithHeartbeatInFlight({ type: 'error', error: { message: 'worker failed' } });

    expect(result.message).to.equal('worker failed');
    expect(events).to.deep.equal(['heartbeat', 'delete']);
  });
});
