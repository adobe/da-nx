import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setImsDetails } from '../../../nx/utils/daFetch.js';
import {
  startDisplayLoader,
  stopDisplayLoader,
} from '../../../nx/blocks/media-library/display/loader.js';

describe('display/loader', () => {
  let originalFetch;
  let fetchStub;
  let clock;

  beforeEach(() => {
    setImsDetails('test-token');
    originalFetch = globalThis.fetch;
    fetchStub = sinon.stub();
    globalThis.fetch = fetchStub;
    clock = sinon.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clock.restore();
    sinon.restore();
  });

  describe('startDisplayLoader', () => {
    it('should poll for index changes and load chunks', async () => {
      const sitePath = '/org/repo';
      const onDataLoaded = sinon.spy();

      // First poll: metadata with timestamp 1000
      fetchStub.onCall(0).resolves({
        ok: true,
        headers: new Headers(),
        json: sinon.stub().resolves({
          chunks: 2,
          totalEntries: 150,
          lastModified: 1000,
        }),
      });

      // Load chunk 0
      fetchStub.onCall(1).resolves({
        ok: true,
        headers: new Headers(),
        json: sinon.stub().resolves([{ url: '/media/a.png' }]),
      });

      // Load chunk 1
      fetchStub.onCall(2).resolves({
        ok: true,
        headers: new Headers(),
        json: sinon.stub().resolves([{ url: '/media/b.png' }]),
      });

      // Second poll: same timestamp (no change)
      fetchStub.onCall(3).resolves({
        ok: true,
        headers: new Headers(),
        json: sinon.stub().resolves({
          chunks: 2,
          totalEntries: 150,
          lastModified: 1000,
        }),
      });

      startDisplayLoader(sitePath, onDataLoaded);

      // Fast-forward to trigger first poll (should load data)
      await clock.tickAsync(100);

      expect(onDataLoaded.callCount).to.equal(1);
      const firstCall = onDataLoaded.firstCall.args[0];
      expect(firstCall.data).to.deep.equal([
        { url: '/media/a.png' },
        { url: '/media/b.png' },
      ]);
      expect(firstCall.error).to.be.null;

      // Fast-forward to second poll interval (60s default for <1000 items)
      await clock.tickAsync(60000);

      // Should not call onDataLoaded again (timestamp unchanged)
      expect(onDataLoaded.callCount).to.equal(1);

      stopDisplayLoader();
    });

    it('should handle errors gracefully', async () => {
      const sitePath = '/org/repo';
      const onDataLoaded = sinon.spy();

      fetchStub.rejects(new Error('Network error'));

      startDisplayLoader(sitePath, onDataLoaded);

      await clock.tickAsync(100);

      expect(onDataLoaded.callCount).to.equal(1);
      const firstCall = onDataLoaded.firstCall.args[0];
      expect(firstCall.data).to.be.null;
      expect(firstCall.error).to.be.instanceOf(Error);

      stopDisplayLoader();
    });

    it('should adapt polling interval based on data volume', async () => {
      const sitePath = '/org/repo';
      const onDataLoaded = sinon.spy();

      // First poll: 500 items -> 60s interval
      fetchStub.onCall(0).resolves({
        ok: true,
        headers: new Headers(),
        json: sinon.stub().resolves({
          chunks: 1,
          totalEntries: 500,
          lastModified: 1000,
        }),
      });

      fetchStub.onCall(1).resolves({
        ok: true,
        headers: new Headers(),
        json: sinon.stub().resolves([]),
      });

      // Second poll: 5000 items -> 90s interval
      fetchStub.onCall(2).resolves({
        ok: true,
        headers: new Headers(),
        json: sinon.stub().resolves({
          chunks: 1,
          totalEntries: 5000,
          lastModified: 2000,
        }),
      });

      fetchStub.onCall(3).resolves({
        ok: true,
        headers: new Headers(),
        json: sinon.stub().resolves([]),
      });

      // Third poll: 15000 items -> 120s interval
      fetchStub.onCall(4).resolves({
        ok: true,
        headers: new Headers(),
        json: sinon.stub().resolves({
          chunks: 1,
          totalEntries: 15000,
          lastModified: 3000,
        }),
      });

      fetchStub.onCall(5).resolves({
        ok: true,
        headers: new Headers(),
        json: sinon.stub().resolves([]),
      });

      startDisplayLoader(sitePath, onDataLoaded);

      // First poll (immediate)
      await clock.tickAsync(100);
      expect(onDataLoaded.callCount).to.equal(1);

      // Wait 60s for second poll (500 items = 60s interval)
      await clock.tickAsync(60000);
      expect(onDataLoaded.callCount).to.equal(2);

      // Wait 90s for third poll (5000 items = 90s interval)
      await clock.tickAsync(90000);
      expect(onDataLoaded.callCount).to.equal(3);

      stopDisplayLoader();
    });
  });
});
