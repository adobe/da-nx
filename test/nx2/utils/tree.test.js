import { expect } from '@esm-bundle/chai';
import { DA_ADMIN, HLX_ADMIN, AEM_API } from '../../../nx2/utils/utils.js';
import { Queue, crawl } from '../../../nx2/public/utils/tree.js';

// Dynamic-expression import (not a literal string) so @web/dev-server-import-maps
// does not rewrite this to ...?wds-import-map=0. The same mock URL is reached at
// runtime via the inline importmap when api.js's dynamic IIFE imports ims.js, so
// both this test and api.js receive the *same* mock module instance.
const imsPath = '../../../nx2/utils/ims.js';
const { resetMockIms } = await import(imsPath);

const STORAGE_KEY = 'hlx6-upgrade';
const ORG = 'testorg';
const SITE = 'testsite';
const BASE = `/${ORG}/${SITE}`;

// HLX6 tests use a distinct org/site so the isHlx6 in-memory cache
// (module-level, never cleared between tests) does not bleed across.
const HLX6_ORG = 'hlx6org';
const HLX6_SITE = 'hlx6site';
const HLX6_BASE = `/${HLX6_ORG}/${HLX6_SITE}`;

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

let origFetch;
let calls;

// Install a window.fetch mock. HLX_ADMIN ping (isHlx6 probe) is answered by
// `pingHlx6`. All other requests are dispatched to `handler(url, opts)`.
function installFetch(handler, { pingHlx6 = false } = {}) {
  calls = [];
  origFetch = window.fetch;
  window.fetch = async (url, opts = {}) => {
    const u = url.toString();
    calls.push({ url: u, opts });
    if (u.includes(`${HLX_ADMIN}/ping/`)) {
      const headers = pingHlx6 ? { 'x-api-upgrade-available': 'true' } : {};
      return new Response('', { status: 200, headers });
    }
    return handler(u, opts);
  };
}

function restoreFetch() {
  if (origFetch) window.fetch = origFetch;
  origFetch = null;
}

// Legacy-format list Response (raw DA array, no content-type on items).
function legacyResp(items, continuationToken = null) {
  const headers = {};
  if (continuationToken) headers['da-continuation-token'] = continuationToken;
  return new Response(JSON.stringify(items), { status: 200, headers });
}

// HLX6-format list Response (items carry content-type, folder names end with /).
function hlx6Resp(items, continuationToken = null) {
  const headers = {};
  if (continuationToken) headers['da-continuation-token'] = continuationToken;
  return new Response(JSON.stringify(items), { status: 200, headers });
}

function errorResp(status = 404) {
  return new Response('', { status });
}

// ---------------------------------------------------------------------------
// Mock item fixtures (legacy DA format — no content-type field)
// ---------------------------------------------------------------------------

const mixedItems = [
  { path: `${BASE}/tools/bulk.html`, name: 'bulk', ext: 'html', lastModified: 1753691701858 },
  { path: `${BASE}/tools/bulk-publish`, name: 'bulk-publish' },
  { path: `${BASE}/tools/landing-page.json`, name: 'landing-page', ext: 'json', lastModified: 1762282196814 },
  { path: `${BASE}/tools/`, name: '' }, // empty-name item
  { path: `${BASE}/tools/page-builder`, name: 'page-builder' },
];

const filesOnly = [
  { path: `${BASE}/docs/file1.html`, name: 'file1', ext: 'html', lastModified: 1753691701858 },
  { path: `${BASE}/docs/file2.json`, name: 'file2', ext: 'json', lastModified: 1762282196814 },
];

// HLX6-format fixtures (items carry content-type; folder names end with /).
const hlx6MixedItems = [
  { name: 'doc.html', 'content-type': 'text/html', 'last-modified': '2024-01-01T00:00:00Z' },
  { name: 'subfolder/', 'content-type': 'application/octet-stream' },
];

// ---------------------------------------------------------------------------
// Queue tests — no fetch involved
// ---------------------------------------------------------------------------

describe('Queue', () => {
  it('processes items with callback', async () => {
    const results = [];
    const queue = new Queue(async (item) => { results.push(item); }, 10);
    await queue.push('a');
    await queue.push('b');
    await queue.push('c');
    expect(results).to.deep.equal(['a', 'b', 'c']);
  });

  it('respects maxConcurrent limit', async () => {
    let active = 0;
    let maxActive = 0;
    const queue = new Queue(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => { setTimeout(r, 20); });
      active -= 1;
    }, 2);

    await Promise.all(['a', 'b', 'c', 'd'].map((i) => queue.push(i)));
    expect(maxActive).to.equal(2);
  });

  it('calls onError and continues on thrown callback', async () => {
    const errors = [];
    const queue = new Queue(
      async (item) => { if (item === 'bad') throw new Error('boom'); },
      10,
      (item, err) => errors.push({ item, err }),
    );
    await queue.push('ok');
    await queue.push('bad');
    await queue.push('ok2');
    expect(errors.length).to.equal(1);
    expect(errors[0].item).to.equal('bad');
  });

  it('applies throttle delay between items', async () => {
    const timestamps = [];
    const queue = new Queue(async () => { timestamps.push(Date.now()); }, 1, null, 80);
    await queue.push('a');
    await queue.push('b');
    expect(timestamps[1] - timestamps[0]).to.be.at.least(80);
  });

  it('processes items in FIFO order', async () => {
    const results = [];
    const queue = new Queue(async (item) => { results.push(item); }, 1);
    await queue.push('first');
    await queue.push('second');
    await queue.push('third');
    expect(results).to.deep.equal(['first', 'second', 'third']);
  });
});

// ---------------------------------------------------------------------------
// getChildren (exercised via crawl) — legacy DA (non-HLX6)
// ---------------------------------------------------------------------------

describe('getChildren via crawl (legacy DA)', () => {
  beforeEach(() => {
    resetMockIms();
    localStorage.removeItem(STORAGE_KEY);
  });

  afterEach(() => {
    restoreFetch();
  });

  it('separates files from folders and recurses into folders', async () => {
    installFetch((url) => {
      if (url.includes('/bulk-publish') || url.includes('/page-builder')) return legacyResp([]);
      if (url.includes('/tools')) return legacyResp(mixedItems);
      return legacyResp([]);
    });

    const { results } = crawl({ path: `${BASE}/tools`, callback: null, concurrent: 10, throttle: 10 });
    const files = await results;

    expect(files.length).to.equal(2);
    expect(files.every((f) => f.ext)).to.equal(true);
    expect(files.some((f) => f.name === 'bulk')).to.equal(true);
    expect(files.some((f) => f.name === 'landing-page')).to.equal(true);
  });

  it('skips items with empty name and logs them', async () => {
    const logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    installFetch((url) => {
      if (url.includes('/bulk-publish') || url.includes('/page-builder')) return legacyResp([]);
      return legacyResp(mixedItems);
    });

    const { results } = crawl({ path: `${BASE}/tools`, callback: null, concurrent: 10, throttle: 10 });
    await results;

    console.log = origLog;

    expect(logs.some((l) => l.includes('empty name'))).to.equal(true);
    expect(logs.some((l) => l.includes(`${BASE}/tools/`))).to.equal(true);
  });

  it('handles a failed fetch gracefully (returns empty files)', async () => {
    installFetch(() => errorResp(404));

    const { results } = crawl({ path: `${BASE}/missing`, callback: null, concurrent: 10, throttle: 10 });
    const files = await results;

    expect(files.length).to.equal(0);
  });

  it('paginates using da-continuation-token across multiple pages', async () => {
    let fetchCount = 0;
    installFetch((url, opts) => {
      fetchCount += 1;
      const hasToken = opts?.headers?.['da-continuation-token'];
      return hasToken
        ? legacyResp([{ path: `${BASE}/big/file2.json`, name: 'file2', ext: 'json' }])
        : legacyResp([{ path: `${BASE}/big/file1.html`, name: 'file1', ext: 'html' }], 'token-page2');
    });

    const { results } = crawl({ path: `${BASE}/big`, callback: null, concurrent: 10, throttle: 10 });
    const files = await results;

    // fetchCount counts handler calls only (ping is intercepted before handler).
    expect(fetchCount).to.equal(2); // 2 list pages
    expect(files.length).to.equal(2);
    expect(files.some((f) => f.name === 'file1')).to.equal(true);
    expect(files.some((f) => f.name === 'file2')).to.equal(true);
  });

  it('hits DA_ADMIN list endpoint (not AEM_API) for non-HLX6 sites', async () => {
    installFetch(() => legacyResp(filesOnly));

    const { results } = crawl({ path: `${BASE}/docs`, callback: null, concurrent: 10, throttle: 10 });
    await results;

    const listCalls = calls.filter((c) => c.url.startsWith(DA_ADMIN));
    expect(listCalls.length).to.be.greaterThan(0);
    const aemCalls = calls.filter((c) => c.url.startsWith(AEM_API));
    expect(aemCalls.length).to.equal(0);
  });
});

// ---------------------------------------------------------------------------
// getChildren — HLX6 site
// ---------------------------------------------------------------------------

describe('getChildren via crawl (HLX6)', () => {
  beforeEach(() => {
    resetMockIms();
    localStorage.removeItem(STORAGE_KEY);
    // Pre-seed localStorage so isHlx6(HLX6_ORG, HLX6_SITE) returns true
    // without firing a ping (the in-memory cache will be populated on first call).
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ [HLX6_BASE]: true }));
  });

  afterEach(() => {
    restoreFetch();
    localStorage.removeItem(STORAGE_KEY);
  });

  it('hits AEM_API source endpoint for HLX6 sites', async () => {
    installFetch((url) => {
      // Subfolder crawl returns no children.
      if (url.includes('/subfolder/')) return hlx6Resp([]);
      return hlx6Resp(hlx6MixedItems);
    });

    const { results } = crawl({ path: `${HLX6_BASE}/content`, callback: null, concurrent: 10, throttle: 10 });
    await results;

    const aemCalls = calls.filter((c) => c.url.startsWith(AEM_API));
    expect(aemCalls.length).to.be.greaterThan(0);
  });

  it('normalises HLX6 items: strips extension from name, sets ext, follows folders', async () => {
    installFetch((url) => {
      if (url.includes('/subfolder/')) return hlx6Resp([]);
      return hlx6Resp(hlx6MixedItems);
    });

    const { results } = crawl({ path: `${HLX6_BASE}/content`, callback: null, concurrent: 10, throttle: 10 });
    const files = await results;

    // Only doc.html is a file (has ext after normalisation); subfolder is a folder.
    expect(files.length).to.equal(1);
    expect(files[0].name).to.equal('doc');
    expect(files[0].ext).to.equal('html');
  });
});

// ---------------------------------------------------------------------------
// crawl — higher-level behaviour
// ---------------------------------------------------------------------------

describe('crawl', () => {
  beforeEach(() => {
    resetMockIms();
    localStorage.removeItem(STORAGE_KEY);
  });

  afterEach(() => {
    restoreFetch();
  });

  it('crawls a single folder containing only files', async () => {
    installFetch(() => legacyResp(filesOnly));

    const { results } = crawl({ path: `${BASE}/docs`, callback: null, concurrent: 10, throttle: 10 });
    const files = await results;

    expect(files.length).to.equal(2);
    expect(files[0].name).to.equal('file1');
    expect(files[1].name).to.equal('file2');
  });

  it('crawls nested folders recursively', async () => {
    const nestedItems = [
      { path: `${BASE}/a/sub`, name: 'sub' },
      { path: `${BASE}/a/file.html`, name: 'file', ext: 'html', lastModified: 1 },
    ];
    const deepItems = [
      { path: `${BASE}/a/sub/deep.json`, name: 'deep', ext: 'json', lastModified: 2 },
    ];

    installFetch((url) => {
      if (url.includes('/a/sub')) return legacyResp(deepItems);
      if (url.includes('/a')) return legacyResp(nestedItems);
      return legacyResp([]);
    });

    const { results } = crawl({ path: `${BASE}/a`, callback: null, concurrent: 10, throttle: 10 });
    const files = await results;

    expect(files.length).to.equal(2);
    expect(files.some((f) => f.name === 'file')).to.equal(true);
    expect(files.some((f) => f.name === 'deep')).to.equal(true);
  });

  it('executes callback for each discovered file', async () => {
    installFetch(() => legacyResp(filesOnly));

    const seen = [];
    const { results } = crawl({
      path: `${BASE}/docs`,
      callback: async (f) => { seen.push(f.name); },
      concurrent: 10,
      throttle: 10,
    });
    await results;

    expect(seen).to.deep.equal(['file1', 'file2']);
  });

  it('captures callback errors via getCallbackErrors', async () => {
    installFetch(() => legacyResp(filesOnly));

    const { results, getCallbackErrors } = crawl({
      path: `${BASE}/docs`,
      callback: async (f) => { if (f.name === 'file2') throw new Error('boom'); },
      concurrent: 10,
      throttle: 10,
    });
    await results;

    const errors = getCallbackErrors();
    expect(errors.length).to.equal(1);
    expect(errors[0].item.name).to.equal('file2');
  });

  it('accepts path as an array and crawls all roots', async () => {
    const path1Items = [{ path: `${BASE}/p1/a.html`, name: 'a', ext: 'html', lastModified: 1 }];
    const path2Items = [{ path: `${BASE}/p2/b.json`, name: 'b', ext: 'json', lastModified: 2 }];

    installFetch((url) => {
      if (url.includes('/p1')) return legacyResp(path1Items);
      if (url.includes('/p2')) return legacyResp(path2Items);
      return legacyResp([]);
    });

    const { results } = crawl({
      path: [`${BASE}/p1`, `${BASE}/p2`],
      callback: null,
      concurrent: 10,
      throttle: 10,
    });
    const files = await results;

    expect(files.length).to.equal(2);
    expect(files.some((f) => f.name === 'a')).to.equal(true);
    expect(files.some((f) => f.name === 'b')).to.equal(true);
  });

  it('includes pre-supplied initialFiles in results', async () => {
    installFetch(() => legacyResp([]));

    const initial = [
      { path: '/other/org/file.html', name: 'file', ext: 'html', lastModified: 1 },
    ];
    const { results } = crawl({
      path: `${BASE}/empty`,
      files: initial,
      callback: null,
      concurrent: 10,
      throttle: 10,
    });
    const files = await results;

    expect(files.length).to.equal(1);
    expect(files[0].name).to.equal('file');
  });

  it('merges initialFiles with crawled files', async () => {
    installFetch(() => legacyResp(filesOnly));

    const initial = [{ path: '/other/extra.html', name: 'extra', ext: 'html', lastModified: 0 }];
    const { results } = crawl({
      path: `${BASE}/docs`,
      files: initial,
      callback: null,
      concurrent: 10,
      throttle: 10,
    });
    const files = await results;

    expect(files.length).to.equal(3);
    expect(files.some((f) => f.name === 'extra')).to.equal(true);
  });

  it('executes callback for initialFiles', async () => {
    installFetch(() => legacyResp([]));

    const initial = [
      { path: '/other/f1.html', name: 'f1', ext: 'html' },
      { path: '/other/f2.json', name: 'f2', ext: 'json' },
    ];
    const seen = [];
    const { results } = crawl({
      path: `${BASE}/empty`,
      files: initial,
      callback: async (f) => { seen.push(f.name); },
      concurrent: 10,
      throttle: 10,
    });
    await results;

    expect(seen).to.include('f1');
    expect(seen).to.include('f2');
  });

  it('cancels crawl early when cancelCrawl is called', async () => {
    let fetchCount = 0;
    installFetch(async () => {
      fetchCount += 1;
      await new Promise((r) => { setTimeout(r, 30); });
      return legacyResp(mixedItems);
    });

    const { results, cancelCrawl } = crawl({
      path: `${BASE}/tools`,
      callback: null,
      concurrent: 10,
      throttle: 50,
    });
    setTimeout(() => cancelCrawl(), 15);
    await results;

    expect(fetchCount).to.be.lessThan(10);
  });

  it('getDuration returns a positive number before and after completion', async () => {
    installFetch(() => legacyResp(filesOnly));

    const { results, getDuration } = crawl({ path: `${BASE}/docs`, callback: null, concurrent: 10, throttle: 50 });
    expect(parseFloat(getDuration())).to.be.at.least(0);

    await results;
    expect(parseFloat(getDuration())).to.be.at.least(0);
  });

  it('works without a callback (returns all files)', async () => {
    installFetch(() => legacyResp(filesOnly));

    const { results } = crawl({ path: `${BASE}/docs`, callback: null, concurrent: 10, throttle: 10 });
    const files = await results;

    expect(files.length).to.equal(2);
  });
});
