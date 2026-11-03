import { expect } from '@esm-bundle/chai';
import { clearConfigCache, fetchConfig } from '../../../nx/blocks/loc/utils/utils.js';

// Dynamic-expression import so the import-map plugin does not rewrite it.
const imsPath = '../../../nx2/utils/ims.js';
const { resetMockIms } = await import(imsPath);

let origFetch;

describe('loc config cache', () => {
  beforeEach(() => {
    resetMockIms();
    clearConfigCache();
    origFetch = window.fetch;
  });

  afterEach(() => {
    window.fetch = origFetch;
    clearConfigCache();
  });

  /**
   * Replaces window.fetch with a counter that serves a site config sheet.
   * @param {string} name - Marker stored in the returned config.
   * @returns {{ count: () => number }} Fetch call counter.
   */
  function stubConfig(name) {
    let calls = 0;
    window.fetch = async () => {
      calls += 1;
      return new Response(JSON.stringify({ name }), { status: 200 });
    };
    return { count: () => calls };
  }

  it('serves repeat calls from the cache', async () => {
    const stub = stubConfig('first');
    const a = await fetchConfig('acme', 'site1');
    const b = await fetchConfig('acme', 'site1');
    expect(a.name).to.equal('first');
    expect(b).to.equal(a);
    expect(stub.count()).to.equal(1);
  });

  it('refetches after clearConfigCache()', async () => {
    stubConfig('first');
    await fetchConfig('acme', 'site1');
    const stub = stubConfig('second');
    clearConfigCache();
    const result = await fetchConfig('acme', 'site1');
    expect(result.name).to.equal('second');
    expect(stub.count()).to.equal(1);
  });
});
