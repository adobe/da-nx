import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { render } from 'da-lit';
import { setImsDetails } from '../../../../nx/utils/daFetch.js';
import '../../../../nx/blocks/loc/views/rollout/rollout.js';
import { getBlockHashes } from '../../../../nx/public/loc/regional-diff.js';

const sheet = (rows) => ({ total: rows.length, offset: 0, limit: rows.length, data: rows });
const CONFIG = {
  ':names': ['en-nl', 'en-to'],
  ':type': 'multi-sheet',
  'en-nl': sheet([{ key: 'country', value: 'Netherlands' }]),
  'en-to': sheet([{ key: 'country', value: 'Tonga' }, { key: 'country', value: 'dup' }]),
};
const SMART_SITE = { config: { data: [{ key: 'rollout.conflict.behavior', value: 'smart-overwrite' }] } };
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
  let sourcePage;
  let siteConfig;

  beforeEach(() => {
    setImsDetails('test-token');
    destPages = { '/en-nl/page.html': DEST_PAGE };
    sourcePage = SOURCE;
    siteConfig = undefined;
    originalFetch = globalThis.fetch;
    globalThis.fetch = sinon.stub().callsFake(async (url, opts = {}) => {
      const headers = new Headers({ 'x-da-actions': 'read=true' });
      if (opts.method && opts.method !== 'GET') return { ok: true, status: 200, headers, json: async () => ({}), text: async () => '' };
      if (url.endsWith('/.da/rollout-placeholders.json')) return { ok: true, status: 200, headers, json: async () => CONFIG };
      if (url.endsWith('/source/org/smart/.da/translate.json')) {
        return { ok: true, status: 200, headers, json: async () => SMART_SITE };
      }
      if (siteConfig && url.endsWith('/source/org/optin/.da/translate.json')) {
        return { ok: true, status: 200, headers, json: async () => siteConfig };
      }
      if (url.includes('/langstore/en/')) return { ok: true, status: 200, headers, text: async () => sourcePage };
      const dest = Object.keys(destPages).find((path) => url.endsWith(path));
      if (dest) return { ok: true, status: 200, headers, text: async () => destPages[dest] };
      return { ok: false, status: 404, headers, text: async () => '' };
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    sinon.restore();
  });

  it('merges like today on the first smart rollout and records the baseline', async () => {
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
      site: 'smart',
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
      .filter(({ args }) => args[1]?.method === 'POST' && args[0].includes('/source/org/smart/en-nl/page.html'));
    const body = await posts[0].args[1].body.get('data').text();
    expect(body).to.include('rolloutbase');
    expect(body).to.include('da-diff');
  });

  // The Loc app's engine caches site config, so opted-in tests use their own site.
  const OPTED_IN = { config: { data: [{ key: 'rollout.conflict.behavior', value: 'merge, smart-overwrite' }] } };
  const newLang = () => ({
    code: 'en',
    name: 'English',
    location: '/langstore/en',
    locales: [{ code: '/en-nl' }],
    rollout: { status: 'not started' },
  });
  const newRollout = (behavior, lang) => {
    const el = document.createElement('nx-loc-rollout');
    el.project = {
      org: 'org',
      site: 'optin',
      title: 'Proj',
      options: { 'source.language': { location: '/' }, 'rollout.conflict.behavior': behavior },
      urls: [{ suppliedPath: '/page' }],
    };
    el._langs = [lang];
    return el;
  };
  const posts = (path) => globalThis.fetch.getCalls()
    .filter(({ args }) => args[1]?.method === 'POST' && args[0].includes(path));
  const postedPage = (call) => call.args[1].body.get('data').text();

  it('marks locale pages in sync after a dry run, with placeholders filled for the locale', async () => {
    siteConfig = OPTED_IN;
    const lang = newLang();
    const el = newRollout('smart-overwrite', lang);
    expect(el.canMarkInSync).to.be.true;

    await el.handleMarkInSync(lang, true);
    expect(lang.sync).to.include({ status: 'checked', 'to-mark': 1, differences: 1 });
    expect(lang.sync.locales['/en-nl']).to.include({ 'to-mark': 1 });
    expect(lang.locales[0]).to.not.have.property('sync');
    expect(posts('/source/org/optin/en-nl/page.html')).to.have.length(0);

    await el.handleMarkInSync(lang, false);
    expect(lang.sync).to.include({ status: 'marked', marked: 1 });
    const body = await postedPage(posts('/source/org/optin/en-nl/page.html')[0]);
    expect(body).to.include('<h1>Fedex Netherlands</h1><p>Local</p>');
    const filled = document.implementation.createHTMLDocument();
    filled.body.innerHTML = '<main><div><h1>Fedex Netherlands</h1></div></main>';
    const hashes = await getBlockHashes({ doc: filled, site: 'site', config: {} });
    expect(body).to.include(`/org/optin/en-nl/page.html|${hashes.join(',')}`);
    const versions = posts('/versionsource/org/optin/en-nl/page.html');
    expect(JSON.parse(versions[0].args[1].body).label).to.equal('Marked in sync');
  });

  it('does not start a rollout while marking in sync', async () => {
    const lang = { ...newLang(), sync: { status: 'marking' } };
    const el = newRollout('smart-overwrite', lang);
    el._sortedLangs = [lang];
    const reads = globalThis.fetch.callCount;
    await el.handleRolloutLang(lang);
    await el.handleMarkInSync(lang, true);
    expect(globalThis.fetch.callCount).to.equal(reads);
    expect(lang.rollout.status).to.equal('not started');
  });

  it('keeps rolling out a group after one language fails validation', async () => {
    siteConfig = OPTED_IN;
    const bad = { ...newLang(), code: 'xx', name: 'Broken', location: '/langstore/xx' };
    const good = newLang();
    const el = newRollout('merge', good);
    el._langs = [bad, good];
    el._sortedLangs = [bad, good];
    await el.handleRolloutGroup({ langs: [bad, good] });
    expect(good.rollout.status).to.equal('complete');
  });

  it('recovers when reading the language pages fails', async () => {
    siteConfig = OPTED_IN;
    sourcePage = undefined;
    const fetchStub = globalThis.fetch;
    globalThis.fetch = sinon.stub().callsFake((url, opts) => (url.includes('/langstore/en/')
      ? Promise.reject(new Error('network')) : fetchStub(url, opts)));
    const lang = newLang();
    const el = newRollout('smart-overwrite', lang);
    await el.handleMarkInSync(lang, true);
    expect(lang).to.not.have.property('sync');
    expect(el._message.type).to.equal('error');
  });

  it('clears mark in sync counts when the language is rolled out', async () => {
    siteConfig = OPTED_IN;
    const lang = newLang();
    const el = newRollout('smart-overwrite', lang);
    await el.handleMarkInSync(lang, true);
    expect(lang.sync.status).to.equal('checked');
    await el.handleRolloutLang(lang);
    expect(lang).to.not.have.property('sync');
  });

  it('confirms the source content the dry run checked', async () => {
    siteConfig = OPTED_IN;
    const lang = newLang();
    const el = newRollout('smart-overwrite', lang);
    await el.handleMarkInSync(lang, true);
    sourcePage = '<body><header></header><main><div><h1>Changed {{country}}</h1></div></main><footer></footer></body>';
    await el.handleMarkInSync(lang, false);
    const body = await postedPage(posts('/source/org/optin/en-nl/page.html')[0]);
    const checked = document.implementation.createHTMLDocument();
    checked.body.innerHTML = '<main><div><h1>Fedex Netherlands</h1></div></main>';
    const hashes = await getBlockHashes({ doc: checked, site: 'site', config: {} });
    expect(body).to.include(`/org/optin/en-nl/page.html|${hashes.join(',')}`);
  });

  it('does not save mark in sync state with the project', async () => {
    siteConfig = OPTED_IN;
    const checked = newLang();
    const other = { ...newLang(), code: 'de', name: 'German', rollout: { status: 'not started' } };
    const el = newRollout('smart-overwrite', checked);
    el._langs = [checked, other];
    await el.handleMarkInSync(checked, true);
    let saved;
    el.addEventListener('action', (e) => { saved = e.detail.data.langs; });
    await el.handleRolloutLang(other);
    expect(saved.every((lang) => !('sync' in lang))).to.be.true;
    expect(checked.sync.status).to.equal('checked');
  });

  it('marks pages even when a sheet in the project cannot be read', async () => {
    siteConfig = OPTED_IN;
    const lang = newLang();
    const el = newRollout('smart-overwrite', lang);
    el.project.urls = [{ suppliedPath: '/page' }, { suppliedPath: '/missing.json' }];
    const fetchStub = globalThis.fetch;
    globalThis.fetch = sinon.stub().callsFake((url, opts) => (url.endsWith('/missing.json')
      ? Promise.resolve({ ok: false, status: 404, headers: new Headers(), text: async () => '' })
      : fetchStub(url, opts)));
    await el.handleMarkInSync(lang, true);
    expect(el._errors).to.be.undefined;
    expect(lang.sync).to.include({ status: 'checked', 'to-mark': 1, sheet: 1 });
  });

  it('only offers mark in sync for smart-overwrite projects', () => {
    expect(newRollout('merge', newLang()).canMarkInSync).to.be.false;
  });

  it('records the baseline on a plain merge rollout on an opted-in site', async () => {
    siteConfig = OPTED_IN;
    const lang = newLang();
    await newRollout('merge', lang).handleRolloutLang(lang);
    const body = await postedPage(posts('/source/org/optin/en-nl/page.html')[0]);
    expect(body).to.include('da-diff');
    const filled = document.implementation.createHTMLDocument();
    filled.body.innerHTML = '<main><div><h1>Fedex Netherlands</h1></div></main>';
    const hashes = await getBlockHashes({ doc: filled, site: 'site', config: {} });
    expect(body).to.include(`<div>rolloutbase</div><div>/org/optin/en-nl/page.html|${hashes.join(',')}</div>`);
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
    const base = await getBlockHashes({ doc: baseDoc, site: 'site', config: {} });
    const metadata = `<div class="da-metadata"><div><div>rolloutbase</div><div>/org/smart/en-nl/page.html|${base}</div></div></div>`;
    const pages = {
      '/en-nl/page.html': `<body><header></header><main><div><h1>Local</h1></div></main>${metadata}<footer></footer></body>`,
    };
    globalThis.fetch = sinon.stub().callsFake(async (url, opts = {}) => {
      const headers = new Headers({ 'x-da-actions': 'read=true' });
      if (opts.method && opts.method !== 'GET') return { ok: true, status: 200, headers, json: async () => ({}), text: async () => '' };
      if (url.endsWith('/source/org/smart/.da/translate.json')) {
        return { ok: true, status: 200, headers, json: async () => SMART_SITE };
      }
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
      site: 'smart',
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
    expect(container.querySelector('.skipped-count').textContent).to.include('1 skipped (localized)');
  });
});
