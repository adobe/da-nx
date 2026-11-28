import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { DA_ADMIN } from '../../../nx/utils/utils.js';
import { startIndexLockHeartbeat } from '../../../nx/blocks/media-library/indexing/locks.js';
import buildMediaIndex from '../../../nx/blocks/media-library/indexing/build.js';

const lockUrl = `${DA_ADMIN}/source/org/site/.da/media-insights/index-lock.json`;
const tick = () => new Promise((resolve) => { setTimeout(resolve, 5); });
const waitFor = async (check) => {
  while (!check()) await tick();
};

describe('index lock heartbeat', () => {
  let clock;
  let events;
  let heartbeats;
  let releaseHeartbeat;

  const stubLock = ({ createdFirst }) => {
    sinon.stub(globalThis, 'fetch').callsFake(async (url, opts = {}) => {
      if (/\/worker\/worker\.js\?t=/.test(url)) return new Response('');
      if (url !== lockUrl) return new Response('', { status: 404 });
      if (opts.method === 'DELETE') {
        events.push('delete');
        return new Response(null, { status: 204 });
      }
      if (opts.method !== 'PUT') return new Response('', { status: 404 });
      if (createdFirst && !events.includes('create')) {
        events.push('create');
        return new Response('', { status: 201 });
      }
      heartbeats += 1;
      return new Promise((resolve) => {
        releaseHeartbeat = () => {
          events.push('heartbeat');
          resolve(new Response('', { status: 201 }));
        };
      });
    });
  };

  beforeEach(() => {
    events = [];
    heartbeats = 0;
    releaseHeartbeat = undefined;
    clock = sinon.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  });

  afterEach(() => {
    clock.restore();
    sinon.restore();
  });

  it('waits for a running heartbeat when it stops, and sends no more', async () => {
    stubLock({ createdFirst: false });
    const stop = startIndexLockHeartbeat({ sitePath: '/org/site', lockData: {} });
    clock.tick(60_000);
    await waitFor(() => releaseHeartbeat);
    clock.tick(60_000);

    let stopped = false;
    const stopping = stop().then(() => { stopped = true; });
    clock.tick(60_000);
    await tick();
    const stoppedBeforeRelease = stopped;
    releaseHeartbeat();
    await stopping;

    expect(stoppedBeforeRelease).to.equal(false);
    expect(heartbeats).to.equal(1);
  });

  const buildWithHeartbeatInFlight = async (workerReply) => {
    stubLock({ createdFirst: true });
    let worker;
    const { Worker: OriginalWorker, adobeIMS } = window;
    window.Worker = class {
      constructor() { worker = this; }

      postMessage() {}

      terminate() {}
    };
    window.adobeIMS = { getAccessToken: () => ({ token: 'ims-token' }) };
    try {
      const build = buildMediaIndex('/org/site', 'org', 'site', 'main').catch((e) => e);
      await waitFor(() => worker?.onmessage);
      clock.tick(60_000);
      await waitFor(() => releaseHeartbeat);
      worker.onmessage({ data: workerReply });
      await new Promise((resolve) => { setTimeout(resolve, 50); });
      releaseHeartbeat();
      return await build;
    } finally {
      window.Worker = OriginalWorker;
      window.adobeIMS = adobeIMS;
    }
  };

  it('lets a running heartbeat finish before a finished build deletes the lock', async () => {
    const result = await buildWithHeartbeatInFlight({ type: 'success', data: [] });

    expect(result.hasChanges).to.equal(true);
    expect(events).to.deep.equal(['create', 'heartbeat', 'delete']);
  });

  it('lets a running heartbeat finish before a failed build deletes the lock', async () => {
    const result = await buildWithHeartbeatInFlight({ type: 'error', error: { message: 'worker failed' } });

    expect(result.message).to.equal('worker failed');
    expect(events).to.deep.equal(['create', 'heartbeat', 'delete']);
  });
});
