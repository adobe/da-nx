import { expect } from '@esm-bundle/chai';
import {
  connect, isConnected, sendAllLanguages, getStatusAll, saveItems, serviceOptions,
} from '../../../../nx/blocks/loc/connectors/lilt/index.js';
import { DA_TRANSLATE } from '../../../../nx2/utils/utils.js';
import { zipSync, strToU8 } from '../../../../nx2/deps/fflate/dist/index.js';

// Dynamic-expression import (not a literal string) so @web/dev-server-import-maps
// does not rewrite this to ...?wds-import-map=0. See test/nx2/utils/api.test.js.
const imsPath = '../../../../nx2/utils/ims.js';
const { setMockIms, resetMockIms } = await import(imsPath);

const org = 'acme';
const site = 'site1';
const proxyOrigin = `${DA_TRANSLATE}/translate/lilt/${org}/${site}`;
// DA_ETC resolves to undefined in this test env - auth.js falls back to this origin.
const loginUrl = `https://da-etc.adobeaem.workers.dev/${org}/sites/${site}/integrations/lilt/login?env=prod`;

let calls;
let origFetch;

function baseService(overrides = {}) {
  return { org, site, ...overrides };
}

// expires_in omitted so the cached token is always treated as expired (see auth.js's
// TOKEN_BUFFER subtraction) - forces a fresh login call on every test.
function loginResponse(accessToken = 'lilt-key') {
  return new Response(JSON.stringify({ access_token: accessToken }), { status: 200 });
}

const memories = [{ id: 11, srclang: 'en', trglang: 'fr' }];

function defaultHandler(u, opts) {
  if (u.includes('/integrations/lilt/login')) return loginResponse();
  if (u.includes('/v2/files') && opts.method === 'POST') {
    return new Response(JSON.stringify({ id: 1 }), { status: 200 });
  }
  if (u.includes('/v2/memories')) {
    return new Response(JSON.stringify(memories), { status: 200 });
  }
  if (u.includes('/v2/translate/file') && opts.method === 'POST') {
    return new Response(JSON.stringify([{ fileId: 1, id: 101 }]), { status: 200 });
  }
  if (u.includes('/v2/translate/file?translationIds=')) {
    return new Response(JSON.stringify([{ id: 101, status: 'Completed' }]), { status: 200 });
  }
  if (u.includes('/v2/translate/files?id=')) {
    return new Response('translated content', { status: 200 });
  }
  if (u.includes('/v2/jobs') && opts.method === 'POST') {
    return new Response(JSON.stringify({ id: 501 }), { status: 200 });
  }
  if (u.includes('/export?type=files')) {
    return new Response('{}', { status: 200 });
  }
  if (u.endsWith('/download')) {
    const zip = zipSync({ 'page.html': strToU8('translated content') });
    return new Response(zip, { status: 200 });
  }
  if (u.includes('/v2/jobs/')) {
    return new Response(JSON.stringify({
      isProcessing: 0,
      stats: { projects: [{ trgLang: 'fr', isComplete: true }] },
    }), { status: 200 });
  }
  return new Response('{}', { status: 200 });
}

function installFetch(handler = defaultHandler) {
  calls = [];
  origFetch = window.fetch;
  window.fetch = async (url, opts = {}) => {
    const u = url.toString();
    calls.push({
      url: u, method: opts.method, body: opts.body, headers: opts.headers,
    });
    return handler(u, opts);
  };
}

function restoreFetch() {
  if (origFetch) window.fetch = origFetch;
  origFetch = null;
}

describe('lilt connector', () => {
  beforeEach(() => {
    resetMockIms();
    sessionStorage.clear();
    installFetch();
  });
  afterEach(() => {
    restoreFetch();
    sessionStorage.clear();
  });

  describe('isConnected / connect', () => {
    it('resolves true when the da-etc login succeeds and an IMS session is present', async () => {
      const connected = await isConnected(baseService());

      expect(connected).to.equal(true);
      expect(calls.some((c) => c.url === loginUrl && c.method === 'POST')).to.equal(true);
    });

    it('resolves false when the da-etc login fails', async () => {
      installFetch(() => new Response('', { status: 401 }));

      expect(await isConnected(baseService())).to.equal(false);
    });

    it('connect behaves identically to isConnected', async () => {
      expect(await connect(baseService())).to.equal(true);
    });

    it('resolves false when there is no IMS session, even with a valid Lilt login', async () => {
      setMockIms({ anonymous: true });

      expect(await isConnected(baseService())).to.equal(false);
    });
  });

  describe('serviceOptions', () => {
    it('offers AI Translation and Verified Translation modes', async () => {
      const translationMode = serviceOptions.find((opt) => opt.key === 'translationMode');
      const choices = await translationMode.fetch();

      expect(choices).to.deep.equal([
        { value: 'ai', label: 'AI Translation' },
        { value: 'verified', label: 'Verified Translation' },
      ]);
    });
  });

  describe('sendAllLanguages - AI Translation (default mode)', () => {
    it('uploads files, resolves a memory, starts translation and persists translation ids', async () => {
      const service = baseService();
      const options = { service };
      const langs = [{ code: 'fr-FR', name: 'French' }];
      const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
      const savedOptions = [];
      const actions = {
        sendMessage: () => {},
        saveState: async ({ options: opts }) => { savedOptions.push(opts); },
      };

      await sendAllLanguages({
        title: 'My Project', service, options, langs, urls, actions,
      });

      expect(calls.some((c) => c.url.startsWith(`${proxyOrigin}/v2/files`))).to.equal(true);
      expect(calls.some((c) => c.url.includes('/v2/translate/file?fileId=1&memoryId=11'))).to.equal(true);
      expect(langs[0].translation.status).to.equal('created');
      expect(langs[0].translation.sent).to.equal(1);
      expect(savedOptions).to.have.length(1);
      const translationIds = JSON.parse(options.service.translationIds.value);
      expect(translationIds['fr-FR']['/page']).to.equal(101);
    });

    it('marks a language as error when no memory matches its language pair', async () => {
      installFetch((u, opts) => {
        if (u.includes('/v2/memories')) return new Response(JSON.stringify([]), { status: 200 });
        return defaultHandler(u, opts);
      });
      const service = baseService();
      const options = { service };
      const langs = [{ code: 'fr-FR', name: 'French' }];
      const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
      const messages = [];
      const actions = { sendMessage: (m) => messages.push(m), saveState: async () => {} };

      await sendAllLanguages({
        title: 'My Project', service, options, langs, urls, actions,
      });

      expect(langs[0].translation.status).to.equal('error');
      expect(messages.some((m) => m?.type === 'error')).to.equal(true);
    });

    it('aborts and marks every language as error when not every url uploads successfully', async () => {
      installFetch((u, opts) => {
        if (u.includes('/v2/files') && opts.method === 'POST') return new Response('', { status: 400 });
        return defaultHandler(u, opts);
      });
      const service = baseService();
      const options = { service };
      const langs = [{ code: 'fr-FR', name: 'French' }];
      const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await sendAllLanguages({
        title: 'My Project', service, options, langs, urls, actions,
      });

      expect(langs[0].translation.status).to.equal('error');
    });

    it('does not call Lilt when there is no IMS session', async () => {
      setMockIms({ anonymous: true });
      const service = baseService();
      const options = { service };
      const langs = [{ code: 'fr-FR', name: 'French' }];
      const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await sendAllLanguages({
        title: 'My Project', service, options, langs, urls, actions,
      });

      expect(calls).to.have.lengthOf(0);
    });
  });

  describe('sendAllLanguages - Verified Translation', () => {
    it('uploads files, creates a job and persists the job id', async () => {
      const service = baseService({ translationMode: 'verified' });
      const options = { service };
      const langs = [{ code: 'fr-FR', name: 'French' }];
      const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await sendAllLanguages({
        title: 'My Project', service, options, langs, urls, actions,
      });

      const jobCall = calls.find((c) => c.url.endsWith('/v2/jobs') && c.method === 'POST');
      expect(jobCall).to.exist;
      const body = JSON.parse(jobCall.body);
      expect(body.name).to.equal('My Project');
      expect(body.languagePairs).to.deep.equal([{ trgLang: 'fr', trgLocale: 'FR', memoryId: 11 }]);
      expect(langs[0].translation.status).to.equal('created');
      expect(options.service.jobId.value).to.equal('501');
    });

    it('reports an error and does not create a job when no languages have a matching memory', async () => {
      installFetch((u, opts) => {
        if (u.includes('/v2/memories')) return new Response(JSON.stringify([]), { status: 200 });
        return defaultHandler(u, opts);
      });
      const service = baseService({ translationMode: 'verified' });
      const options = { service };
      const langs = [{ code: 'fr-FR', name: 'French' }];
      const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
      const messages = [];
      const actions = { sendMessage: (m) => messages.push(m), saveState: async () => {} };

      await sendAllLanguages({
        title: 'My Project', service, options, langs, urls, actions,
      });

      expect(calls.some((c) => c.url.endsWith('/v2/jobs') && c.method === 'POST')).to.equal(false);
      expect(messages.some((m) => m?.type === 'error')).to.equal(true);
    });
  });

  describe('getStatusAll - AI Translation', () => {
    it('marks a language translated once every file is done', async () => {
      const service = baseService({
        translationIds: JSON.stringify({ 'fr-FR': { '/page': 101 } }),
      });
      const langs = [{ code: 'fr-FR', translation: { status: 'created' } }];
      const urls = [{ daBasePath: '/page' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await getStatusAll({
        service, langs, urls, actions,
      });

      expect(langs[0].translation.status).to.equal('translated');
      expect(langs[0].translation.translated).to.equal(1);
    });

    it('marks a language error when Lilt reports a failed translation', async () => {
      installFetch((u, opts) => {
        if (u.includes('/v2/translate/file?translationIds=')) {
          return new Response(JSON.stringify([{ id: 101, status: 'Failed' }]), { status: 200 });
        }
        return defaultHandler(u, opts);
      });
      const service = baseService({
        translationIds: JSON.stringify({ 'fr-FR': { '/page': 101 } }),
      });
      const langs = [{ code: 'fr-FR', translation: { status: 'created' } }];
      const urls = [{ daBasePath: '/page' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await getStatusAll({
        service, langs, urls, actions,
      });

      expect(langs[0].translation.status).to.equal('error');
    });

    it('skips languages already in a terminal status', async () => {
      const service = baseService();
      const langs = [{ code: 'fr-FR', translation: { status: 'complete' } }];
      const urls = [{ daBasePath: '/page' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await getStatusAll({
        service, langs, urls, actions,
      });

      expect(calls).to.have.lengthOf(0);
    });
  });

  describe('getStatusAll - Verified Translation', () => {
    it('marks a language translated once its job project is complete', async () => {
      const service = baseService({ translationMode: 'verified', jobId: 501 });
      const langs = [{ code: 'fr-FR', translation: { status: 'created' } }];
      const urls = [{ daBasePath: '/page' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await getStatusAll({
        service, langs, urls, actions,
      });

      expect(langs[0].translation.status).to.equal('translated');
      expect(langs[0].translation.translated).to.equal(1);
    });
  });

  describe('saveItems - AI Translation', () => {
    it('downloads translated content per url and saves it', async () => {
      const service = baseService({
        translationIds: JSON.stringify({ 'fr-FR': { '/page': 101 } }),
      });
      const urls = [{ daBasePath: '/page', ext: 'html' }];
      const saveFn = async (url) => { url.status = 'success'; };

      const result = await saveItems({
        org, site, service, lang: { code: 'fr-FR', name: 'French' }, urls, saveFn, sendMessage: () => {},
      });

      expect(result[0].status).to.equal('success');
      expect(result[0].sourceContent).to.be.a('string');
    });

    it('marks a url as errored when there is no translation id for it', async () => {
      const service = baseService({ translationIds: JSON.stringify({ 'fr-FR': {} }) });
      const urls = [{ daBasePath: '/page', ext: 'html' }];
      const saveFn = async (url) => { url.status = 'success'; };

      const result = await saveItems({
        org, site, service, lang: { code: 'fr-FR', name: 'French' }, urls, saveFn, sendMessage: () => {},
      });

      expect(result[0].status).to.equal('error');
    });
  });

  describe('saveItems - Verified Translation', () => {
    it('exports, waits for readiness, downloads the zip and saves each matched url', async () => {
      const service = baseService({ translationMode: 'verified', jobId: 501 });
      const urls = [{ daBasePath: '/page', ext: 'html' }];
      const saveFn = async (url) => { url.status = 'success'; };

      const result = await saveItems({
        org, site, service, lang: { code: 'fr-FR', name: 'French' }, urls, saveFn, sendMessage: () => {},
      });

      expect(result[0].status).to.equal('success');
      expect(result[0].sourceContent).to.be.a('string');
      expect(calls.some((c) => c.url.includes('/export?type=files'))).to.equal(true);
      expect(calls.some((c) => c.url.endsWith('/download'))).to.equal(true);
    });

    it('marks urls as errored when the export never becomes ready', async () => {
      installFetch((u, opts) => {
        if (u.includes('/v2/jobs/') && !u.includes('export') && !u.includes('download')) {
          return new Response(JSON.stringify({ isProcessing: -2 }), { status: 200 });
        }
        return defaultHandler(u, opts);
      });
      const service = baseService({ translationMode: 'verified', jobId: 501 });
      const urls = [{ daBasePath: '/page', ext: 'html' }];
      const saveFn = async (url) => { url.status = 'success'; };

      const result = await saveItems({
        org, site, service, lang: { code: 'fr-FR', name: 'French' }, urls, saveFn, sendMessage: () => {},
      });

      expect(result[0].status).to.equal('error');
    });

    it('returns urls unchanged when there is no jobId', async () => {
      const service = baseService({ translationMode: 'verified' });
      const urls = [{ daBasePath: '/page', ext: 'html' }];
      const saveFn = async () => {};

      const result = await saveItems({
        org, site, service, lang: { code: 'fr-FR', name: 'French' }, urls, saveFn, sendMessage: () => {},
      });

      expect(result).to.equal(urls);
      expect(calls.some((c) => c.url.includes('/v2/jobs'))).to.equal(false);
    });
  });
});
