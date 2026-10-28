import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setImsDetails } from '../../../../nx/utils/daFetch.js';
import '../../../../nx/blocks/loc/views/rollout/rollout.js';

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
