import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { render } from 'da-lit';
import { setImsDetails } from '../../../../nx/utils/daFetch.js';
import '../../../../nx/blocks/loc/views/rollout/rollout.js';
import { getBlockHashes } from '../../../../nx/blocks/loc/regional-diff/regional-diff.js';

const sheet = (rows) => ({ total: rows.length, offset: 0, limit: rows.length, data: rows });
const CONFIG = {
  ':names': ['en-nl', 'en-to'],
  ':type': 'multi-sheet',
  'en-nl': sheet([{ key: 'country', value: 'Netherlands' }]),
  'en-to': sheet([{ key: 'country', value: 'Tonga' }, { key: 'country', value: 'dup' }]),
};
const SOURCE = '<body><header></header><main><div><h1>Fedex {{country}}</h1></div></main><footer></footer></body>';

describe('nx-loc-rollout partial rollout', () => {
  let originalFetch;

  beforeEach(() => {
    setImsDetails('test-token');
    originalFetch = globalThis.fetch;
    globalThis.fetch = sinon.stub().callsFake(async (url, opts = {}) => {
      const headers = new Headers({ 'x-da-actions': 'read=true' });
      if (opts.method && opts.method !== 'GET') return { ok: true, status: 200, headers, text: async () => '' };
      if (url.endsWith('/.da/rollout-placeholders.json')) return { ok: true, status: 200, headers, json: async () => CONFIG };
      if (url.includes('/langstore/en/')) return { ok: true, status: 200, headers, text: async () => SOURCE };
      return { ok: false, status: 404, headers, text: async () => '' };
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    sinon.restore();
  });

  it('persists successful destinations and leaves the language retryable', async () => {
    const lang = {
      code: 'en',
      name: 'English',
      location: '/langstore/en',
      locales: [{ code: '/en-nl' }, { code: '/en-to' }],
      rollout: { status: 'not started' },
    };
    const el = document.createElement('nx-loc-rollout');
    el.project = {
      org: 'org',
      site: 'site',
      title: 'Proj',
      options: { 'source.language': { location: '/' }, 'rollout.conflict.behavior': 'overwrite' },
      urls: [{ suppliedPath: '/page' }],
    };
    el._langs = [lang];
    const actions = [];
    el.addEventListener('action', (e) => actions.push(e.detail.data));

    await el.handleRolloutLang(lang);

    expect(el._errors).to.have.length(1);
    expect(el._errors[0].error).to.include('/org/site/en-to/page.html');
    expect(lang.rollout).to.deep.equal({ status: 'not started', saved: 1 });
    expect(actions).to.have.length(1);
    expect(actions[0].langs[0].locales.map((locale) => locale.saved)).to.deep.equal([1, 0]);
  });
});

describe('nx-loc-rollout smart overwrite', () => {
  let originalFetch;
  const DEST_PAGE = '<body><header></header><main><div><h1>Fedex Netherlands</h1><p>Local</p></div></main><footer></footer></body>';
  let destPages;

  beforeEach(() => {
    setImsDetails('test-token');
    destPages = { '/en-nl/page.html': DEST_PAGE };
    originalFetch = globalThis.fetch;
    globalThis.fetch = sinon.stub().callsFake(async (url, opts = {}) => {
      const headers = new Headers({ 'x-da-actions': 'read=true' });
      if (opts.method && opts.method !== 'GET') return { ok: true, status: 200, headers, json: async () => ({}), text: async () => '' };
      if (url.endsWith('/.da/rollout-placeholders.json')) return { ok: true, status: 200, headers, json: async () => CONFIG };
      if (url.includes('/langstore/en/')) return { ok: true, status: 200, headers, text: async () => SOURCE };
      const dest = Object.keys(destPages).find((path) => url.endsWith(path));
      if (dest) return { ok: true, status: 200, headers, text: async () => destPages[dest] };
      return { ok: false, status: 404, headers, text: async () => '' };
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    sinon.restore();
  });

  it('rolls out with smartOverwriteCopy without adding a skipped count on the first run', async () => {
    const lang = {
      code: 'en',
      name: 'English',
      location: '/langstore/en',
      locales: [{ code: '/en-nl' }],
      rollout: { status: 'not started' },
    };
    const el = document.createElement('nx-loc-rollout');
    el.project = {
      org: 'org',
      site: 'site',
      title: 'Proj',
      options: { 'source.language': { location: '/' }, 'rollout.conflict.behavior': 'smart-overwrite' },
      urls: [{ suppliedPath: '/page' }],
    };
    el._langs = [lang];

    await el.handleRolloutLang(lang);

    expect(el._errors).to.be.undefined;
    expect(lang.rollout).to.deep.equal({ status: 'complete', saved: 1 });
    expect(lang.locales[0]).to.not.have.property('skipped');
    const posts = globalThis.fetch.getCalls()
      .filter(({ args }) => args[1]?.method === 'POST' && args[0].includes('/source/org/site/en-nl/page.html'));
    const body = await posts[0].args[1].body.get('data').text();
    expect(body).to.include('rolloutbase');
  });
});

describe('nx-loc-rollout smart overwrite skipped pages', () => {
  let originalFetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    sinon.restore();
  });

  it('reports skipped global changes per locale', async () => {
    setImsDetails('test-token');
    originalFetch = globalThis.fetch;
    globalThis.fetch = sinon.stub().callsFake(async () => ({ ok: false, status: 404, text: async () => '' }));
    const baseDoc = document.implementation.createHTMLDocument();
    baseDoc.body.innerHTML = '<main><div><h1>Old</h1></div></main>';
    const base = await getBlockHashes(baseDoc);
    const metadata = `<div class="da-metadata"><div><div>rolloutbase</div><div>/org/site/en-nl/page.html|${base}</div></div></div>`;
    const pages = {
      '/en-nl/page.html': `<body><header></header><main><div><h1>Local</h1></div></main>${metadata}<footer></footer></body>`,
    };
    globalThis.fetch = sinon.stub().callsFake(async (url, opts = {}) => {
      const headers = new Headers({ 'x-da-actions': 'read=true' });
      if (opts.method && opts.method !== 'GET') return { ok: true, status: 200, headers, json: async () => ({}), text: async () => '' };
      if (url.endsWith('/.da/rollout-placeholders.json')) return { ok: true, status: 200, headers, json: async () => CONFIG };
      if (url.includes('/langstore/en/')) return { ok: true, status: 200, headers, text: async () => SOURCE };
      const dest = Object.keys(pages).find((path) => url.endsWith(path));
      if (dest) return { ok: true, status: 200, headers, text: async () => pages[dest] };
      return { ok: false, status: 404, headers, text: async () => '' };
    });

    const lang = {
      code: 'en',
      name: 'English',
      location: '/langstore/en',
      locales: [{ code: '/en-nl' }],
      rollout: { status: 'not started' },
    };
    const el = document.createElement('nx-loc-rollout');
    el.project = {
      org: 'org',
      site: 'site',
      title: 'Proj',
      options: { 'source.language': { location: '/' }, 'rollout.conflict.behavior': 'smart-overwrite' },
      urls: [{ suppliedPath: '/page' }, { suppliedPath: '/other' }],
    };
    el._langs = [lang];

    await el.handleRolloutLang(lang);

    expect(lang.rollout.saved).to.equal(2);
    expect(lang.locales[0].skipped).to.equal(1);

    el._urls = el.project.urls;
    const container = document.createElement('div');
    render(el.renderLocales(lang.rollout, lang.locales), container);
    expect(container.querySelector('.skipped-count').textContent).to.include('1 global change skipped');
  });
});
