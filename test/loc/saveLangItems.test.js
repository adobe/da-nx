import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setImsDetails } from '../../nx/utils/daFetch.js';
import { saveLangItems, MAX_CONCURRENT_WRITES } from '../../nx/blocks/loc/project/index.js';

// saveLangItems must rate-limit /source/ POSTs to MAX_CONCURRENT_WRITES
// to avoid thundering-herd 412 conflicts on da-admin's R2 audit entries.

const SITE_PATH = '/test/org/site';
const LANG = { location: '/fr' };

function makeItem(basePath, content = '<p>hello</p>') {
  return {
    basePath,
    blob: new Blob([content], { type: 'text/html' }),
  };
}

function makeFetchStub(delay = 0) {
  return sinon.stub().callsFake(() => new Promise((resolve) => {
    setTimeout(() => resolve({
      ok: true,
      status: 200,
      headers: new Headers({ 'x-da-actions': 'read=true' }),
      text: async () => '',
    }), delay);
  }));
}

const removeDnt = async (html) => html;

describe('saveLangItems', () => {
  let originalFetch;
  let fetchStub;

  beforeEach(() => {
    setImsDetails('test-token');
    originalFetch = globalThis.fetch;
    window.location.hash = '#/test/org/site';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    sinon.restore();
  });

  it('writes every item to /source/ exactly once', async () => {
    fetchStub = makeFetchStub();
    globalThis.fetch = fetchStub;

    const items = [
      makeItem('/page-a.html'),
      makeItem('/page-b.html'),
      makeItem('/page-c.html'),
    ];

    const results = await saveLangItems(SITE_PATH, items, LANG, removeDnt);

    const sourceCalls = fetchStub.args.filter(([url]) => url.includes('/source/'));
    expect(sourceCalls.length).to.equal(3);
    expect(results).to.have.length(3);
    results.forEach((r) => expect(r.success).to.equal(200));
  });

  it('returns results in the same order as the input items', async () => {
    fetchStub = makeFetchStub();
    globalThis.fetch = fetchStub;

    const items = ['a', 'b', 'c'].map((id) => makeItem(`/${id}.html`));
    const results = await saveLangItems(SITE_PATH, items, LANG, removeDnt);

    expect(results).to.have.length(3);
    results.forEach((r) => expect(r).to.deep.equal({ success: 200 }));
  });

  it('never exceeds MAX_CONCURRENT_WRITES simultaneous /source/ requests', async () => {
    let active = 0;
    let peakActive = 0;

    globalThis.fetch = sinon.stub().callsFake(() => {
      active += 1;
      peakActive = Math.max(peakActive, active);
      return new Promise((resolve) => {
        // Simulate async I/O so concurrent requests overlap
        setTimeout(() => {
          active -= 1;
          resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'x-da-actions': 'read=true' }),
            text: async () => '',
          });
        }, 5);
      });
    });

    const items = Array.from(
      { length: MAX_CONCURRENT_WRITES * 3 },
      (_, i) => makeItem(`/page-${i}.html`),
    );

    await saveLangItems(SITE_PATH, items, LANG, removeDnt);

    expect(peakActive).to.be.at.most(
      MAX_CONCURRENT_WRITES,
      `Peak concurrent writes (${peakActive}) exceeded MAX_CONCURRENT_WRITES (${MAX_CONCURRENT_WRITES})`,
    );
  });

  it('returns an error result when the underlying fetch fails with a network error', async () => {
    globalThis.fetch = sinon.stub().rejects(new Error('network failure'));

    const items = [makeItem('/fail.html')];
    const results = await saveLangItems(SITE_PATH, items, LANG, removeDnt);

    expect(results[0]).to.deep.equal({ error: 'network failure' });
  });

  it('returns an error result with status when the save response is not ok', async () => {
    globalThis.fetch = sinon.stub().resolves({
      ok: false,
      status: 403,
      headers: new Headers({ 'x-da-actions': 'read=true' }),
      text: async () => '',
    });

    const items = [makeItem('/forbidden.html')];
    const results = await saveLangItems(SITE_PATH, items, LANG, removeDnt);

    expect(results[0]).to.deep.equal({ error: 'Could not save item.', status: 403 });
  });

  it('handles JSON items with correct content-type', async () => {
    fetchStub = makeFetchStub();
    globalThis.fetch = fetchStub;

    const items = [makeItem('/data.json', '{"key":"value"}')];
    await saveLangItems(SITE_PATH, items, LANG, removeDnt);

    const [, opts] = fetchStub.args[0];
    const formData = opts.body;
    const blob = formData.get('data');
    expect(blob.type).to.equal('application/json');
  });
});
