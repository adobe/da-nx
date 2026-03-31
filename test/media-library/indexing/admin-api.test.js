import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setImsDetails } from '../../../nx/utils/daFetch.js';

describe('admin-api streamLog', () => {
  let originalFetch;
  let fetchStub;

  beforeEach(() => {
    // Mock IMS authentication
    setImsDetails('test-token');

    originalFetch = globalThis.fetch;
    fetchStub = sinon.stub();
    globalThis.fetch = fetchStub;

    // Default response for all tests unless overridden
    fetchStub.resolves({
      ok: true,
      json: async () => ({ entries: [] }),
      headers: new Headers(),
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    sinon.restore();
  });

  it('uses from=2015-01-01 and to=now for fullHistory mode', async () => {
    const { streamLog } = await import('../../../nx/blocks/media-library/indexing/admin-api.js');

    await streamLog(
      'medialog',
      'testorg',
      'testrepo',
      'main',
      null,
      100,
      () => {},
      { fullHistory: true },
    );

    expect(fetchStub.called).to.be.true;
    const callUrl = fetchStub.firstCall.args[0];
    expect(callUrl).to.include('from=2015-01-01T00%3A00%3A00.000Z');
    expect(callUrl).to.include('to=');
    expect(callUrl).to.not.include('since=');
  });

  it('uses from/to with timestamp for incremental mode', async () => {
    const { streamLog } = await import('../../../nx/blocks/media-library/indexing/admin-api.js');
    const timestamp = new Date('2024-01-15T10:30:00.000Z').getTime();

    await streamLog(
      'medialog',
      'testorg',
      'testrepo',
      'main',
      timestamp,
      100,
      () => {},
    );

    expect(fetchStub.called).to.be.true;
    const callUrl = fetchStub.firstCall.args[0];
    expect(callUrl).to.include('from=2024-01-15');
    expect(callUrl).to.include('to=');
    expect(callUrl).to.not.include('since=');
  });

  it('uses since=3650d when since is null without fullHistory', async () => {
    const { streamLog } = await import('../../../nx/blocks/media-library/indexing/admin-api.js');

    await streamLog(
      'medialog',
      'testorg',
      'testrepo',
      'main',
      null,
      100,
      () => {},
    );

    expect(fetchStub.called).to.be.true;
    const callUrl = fetchStub.firstCall.args[0];
    expect(callUrl).to.include('since=3650d');
    expect(callUrl).to.not.include('from=');
    expect(callUrl).to.not.include('to=');
  });

  it('calls onChunk with entries from API response', async () => {
    const mockEntries = [
      { resourcePath: '/media/image1.png', timestamp: 1234567890 },
      { resourcePath: '/media/image2.png', timestamp: 1234567891 },
    ];

    fetchStub.resolves({
      ok: true,
      json: async () => ({ entries: mockEntries }),
      headers: new Headers(),
    });

    const { streamLog } = await import('../../../nx/blocks/media-library/indexing/admin-api.js');
    const onChunkSpy = sinon.spy();

    await streamLog(
      'medialog',
      'testorg',
      'testrepo',
      'main',
      null,
      100,
      onChunkSpy,
      { fullHistory: true },
    );

    expect(onChunkSpy.calledOnce).to.be.true;
    expect(onChunkSpy.firstCall.args[0]).to.deep.equal(mockEntries);
  });

  it('follows pagination with nextToken', async () => {
    let callCount = 0;
    fetchStub.callsFake(() => {
      callCount += 1;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            entries: [{ resourcePath: '/page1.png' }],
            nextToken: 'abc123',
          }),
          headers: new Headers(),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          entries: [{ resourcePath: '/page2.png' }],
        }),
        headers: new Headers(),
      });
    });

    const { streamLog } = await import('../../../nx/blocks/media-library/indexing/admin-api.js');
    const onChunkSpy = sinon.spy();

    await streamLog(
      'medialog',
      'testorg',
      'testrepo',
      'main',
      null,
      100,
      onChunkSpy,
      { fullHistory: true },
    );

    expect(fetchStub.calledTwice).to.be.true;
    expect(onChunkSpy.calledTwice).to.be.true;

    const secondCallUrl = fetchStub.secondCall.args[0];
    expect(secondCallUrl).to.include('nextToken=abc123');
  });
});
