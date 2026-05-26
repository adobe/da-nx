import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setImsDetails } from '../../nx/utils/daFetch.js';
import { overwriteCopy } from '../../nx/blocks/loc/project/index.js';

// Regression tests for the parallel-saveVersion bug that caused R2 412 audit
// conflicts in da-admin. When N items share the same destination path (e.g.
// a resync rolling multiple locales to the same langstore path), saveVersion
// must fire at most once per in-flight path even if overwriteCopy is called
// concurrently for that path.

const DEST = '/test/org/repo/langstore/ar/page.html';

function makeFetchStub() {
  const stub = sinon.stub();
  stub.callsFake(() => Promise.resolve({
    ok: true,
    status: 200,
    headers: new Headers({ 'x-da-actions': 'read=true' }),
    text: async () => '',
  }));
  return stub;
}

describe('saveVersion dedup - parallel copies to the same destination', () => {
  let originalFetch;
  let fetchStub;

  beforeEach(() => {
    setImsDetails('test-token');
    originalFetch = globalThis.fetch;
    fetchStub = makeFetchStub();
    globalThis.fetch = fetchStub;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    sinon.restore();
  });

  it('fires saveVersion exactly once when 6 overwriteCopy calls share the same destination', async () => {
    const calls = Array.from(
      { length: 6 },
      () => overwriteCopy({ source: '/src', destination: DEST, sourceContent: '<p>hi</p>' }, 'resync'),
    );
    await Promise.all(calls);

    const versionCalls = fetchStub.args.filter(([url]) => url.includes('/versionsource/'));
    expect(versionCalls.length).to.equal(
      1,
      `Got ${versionCalls.length} saveVersion calls — parallel writes cause R2 412 audit conflicts`,
    );
  });

  it('allows one saveVersion per unique destination in parallel', async () => {
    const dests = [
      '/test/org/repo/ar/page.html',
      '/test/org/repo/de/page.html',
      '/test/org/repo/fr/page.html',
    ];
    const calls = dests.map(
      (destination) => overwriteCopy({ source: '/src', destination, sourceContent: '<p>hi</p>' }, 'resync'),
    );
    await Promise.all(calls);

    const versionCalls = fetchStub.args.filter(([url]) => url.includes('/versionsource/'));
    expect(versionCalls.length).to.equal(
      3,
      'Each unique destination should produce exactly one version save',
    );
  });
});
