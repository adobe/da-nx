import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setImsDetails } from '../../../nx/utils/daFetch.js';
import '../../../nx/blocks/loc/project/views/rollout.js';

const sheet = (rows) => ({ total: rows.length, offset: 0, limit: rows.length, data: rows });
const CONFIG = {
  ':names': ['en-nl', 'en-to'],
  ':type': 'multi-sheet',
  'en-nl': sheet([{ key: 'country', value: 'Netherlands' }]),
  'en-to': sheet([{ key: 'country', value: 'Tonga' }, { key: 'country', value: 'dup' }]),
};
const SOURCE = '<body><header></header><main><div><h1>Fedex {{country}}</h1></div></main><footer></footer></body>';

describe('legacy nx-loc-rollout with placeholder errors', () => {
  let originalFetch;
  let posts;

  beforeEach(() => {
    setImsDetails('test-token');
    originalFetch = globalThis.fetch;
    posts = [];
    globalThis.fetch = sinon.stub().callsFake(async (url, opts = {}) => {
      const headers = new Headers({ 'x-da-actions': 'read=true' });
      if (opts.method && opts.method !== 'GET') {
        posts.push(url);
        return { ok: true, status: 200, headers, text: async () => '' };
      }
      if (url.endsWith('/.da/rollout-placeholders.json')) return { ok: true, status: 200, headers, json: async () => CONFIG };
      if (url.includes('/langstore/en/')) return { ok: true, status: 200, headers, text: async () => SOURCE };
      return { ok: false, status: 404, headers, text: async () => '' };
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    sinon.restore();
  });

  it('finishes the rollout in a retryable state', async () => {
    const lang = {
      name: 'English',
      location: '/langstore/en',
      locales: [{ code: '/en-nl' }, { code: '/en-to' }],
      rollout: { status: 'ready' },
    };
    const el = document.createElement('nx-loc-rollout');
    el.sitePath = '/org/site';
    el.title = 'Proj';
    el.conflictBehavior = 'overwrite';
    el.urls = [{ basePath: '/page.html' }];
    el.langs = [lang];
    el.state = { urls: [], langs: [lang] };

    await el.handleRolloutLang(lang);

    expect(lang.rolledOut).to.equal(1);
    expect(lang.rollout.status).to.equal('ready');
    expect(lang.errors).to.have.length(1);
    expect(lang.errors[0].error).to.include('/org/site/en-to/page.html');
    expect(posts.some((url) => url.endsWith('/source/org/site/en-nl/page.html'))).to.be.true;
    expect(posts.some((url) => url.endsWith('/source/org/site/en-to/page.html'))).to.be.false;
    expect(el.canRollout(lang)).to.be.true;
  });
});
