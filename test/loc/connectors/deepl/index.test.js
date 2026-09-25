import { expect } from '@esm-bundle/chai';
import {
  connect, isConnected, sendAllLanguages, getStatusAll, saveItems, cancelTranslation,
  toDeepLLanguageCode,
} from '../../../../nx/blocks/loc/connectors/deepl/index.js';
import { DA_TRANSLATE } from '../../../../nx2/utils/utils.js';

// Dynamic-expression import (not a literal string) so @web/dev-server-import-maps
// does not rewrite this to ...?wds-import-map=0.
const imsPath = '../../../../nx2/utils/ims.js';
const { setMockIms, resetMockIms } = await import(imsPath);

describe('deepl connector - toDeepLLanguageCode', () => {
  it('falls back to the static heuristic when no supported codes are provided', () => {
    expect(toDeepLLanguageCode('en', true)).to.equal('EN-US');
    expect(toDeepLLanguageCode('pt', true)).to.equal('PT-PT');
    expect(toDeepLLanguageCode('zh-CN', true)).to.equal('ZH-HANS');
    expect(toDeepLLanguageCode('fr-FR', false)).to.equal('FR');
  });

  it('resolves an exact match against the live supported set', () => {
    const supported = new Set(['EN-US', 'EN-GB', 'FR', 'DE']);
    expect(toDeepLLanguageCode('en-GB', true, supported)).to.equal('EN-GB');
    expect(toDeepLLanguageCode('de', true, supported)).to.equal('DE');
  });

  it('uses the variant hint table only when the live set confirms the variant exists', () => {
    const supported = new Set(['EN-US', 'EN-GB', 'PT-BR', 'PT-PT', 'ZH-HANS', 'ZH-HANT']);
    expect(toDeepLLanguageCode('en-UK', true, supported)).to.equal('EN-GB');
    expect(toDeepLLanguageCode('pt-PT', true, supported)).to.equal('PT-PT');
    expect(toDeepLLanguageCode('zh-TW', true, supported)).to.equal('ZH-HANT');
    expect(toDeepLLanguageCode('zh-CN', true, supported)).to.equal('ZH-HANS');
  });

  it('falls back to the bare base code when the live set has no matching variant', () => {
    const supported = new Set(['FR', 'DE', 'JA']);
    expect(toDeepLLanguageCode('fr-CA', true, supported)).to.equal('FR');
  });

  it('auto-selects a single live variant for a base with no hint entry', () => {
    const supported = new Set(['NB', 'ES-419']);
    expect(toDeepLLanguageCode('es-MX', true, supported)).to.equal('ES-419');
  });

  it('falls through to the static heuristic when the live set is empty', () => {
    expect(toDeepLLanguageCode('en', true, new Set())).to.equal('EN-US');
  });

  it('ignores supportedCodes for source-language resolution beyond exact/base match', () => {
    const supported = new Set(['EN', 'FR', 'DE']);
    expect(toDeepLLanguageCode('en-US', false, supported)).to.equal('EN');
  });
});

describe('deepl connector', () => {
  const org = 'acme';
  const site = 'site1';
  const v2Origin = `${DA_TRANSLATE}/translate/deepl/${org}/${site}/v2`;
  const loginUrl = `https://da-etc.adobeaem.workers.dev/${org}/sites/${site}/integrations/deepl/login?env=prod`;

  let calls;
  let origFetch;

  function baseService(overrides = {}) {
    return { org, site, sourceLanguage: 'en', ...overrides };
  }

  // expires_in omitted so the cached token is always treated as expired - forces a
  // fresh login call on every test.
  function loginResponse(accessToken = 'deepl-key') {
    return new Response(JSON.stringify({ access_token: accessToken }), { status: 200 });
  }

  // Covers EN (source-only), EN-US/EN-GB (target-only variants) and FR/DE (both) - enough
  // for toDeepLLanguageCode to resolve every code these tests use against the live set.
  function languagesResponse() {
    return new Response(JSON.stringify([
      { lang: 'EN', usable_as_source: true, usable_as_target: false },
      { lang: 'EN-US', usable_as_source: false, usable_as_target: true },
      { lang: 'EN-GB', usable_as_source: false, usable_as_target: true },
      { lang: 'FR', usable_as_source: true, usable_as_target: true },
      { lang: 'DE', usable_as_source: true, usable_as_target: true },
    ]), { status: 200 });
  }

  function defaultHandler(u) {
    if (u.includes('/integrations/deepl/login')) return loginResponse();
    if (u.includes('/v3/languages')) return languagesResponse();
    if (u.endsWith('/result')) return new Response('translated content', { status: 200 });
    if (u.endsWith('/document')) {
      return new Response(JSON.stringify({ document_id: 'doc-1', document_key: 'key-1' }), { status: 200 });
    }
    if (/\/document\/[^/]+$/.test(u)) {
      return new Response(JSON.stringify({ status: 'done' }), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  }

  function installFetch(handler = defaultHandler) {
    calls = [];
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = url.toString();
      calls.push({ url: u, method: opts.method, body: opts.body, headers: opts.headers });
      return handler(u, opts);
    };
  }

  function restoreFetch() {
    if (origFetch) window.fetch = origFetch;
    origFetch = null;
  }

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
    it('resolves true when the da-etc login succeeds and an IMS session exists', async () => {
      const connected = await isConnected(baseService());

      expect(connected).to.equal(true);
      expect(calls[0].url).to.equal(loginUrl);
      expect(calls[0].method).to.equal('POST');
    });

    it('resolves false when the da-etc login fails', async () => {
      installFetch(() => new Response('', { status: 401 }));

      expect(await isConnected(baseService())).to.equal(false);
    });

    it('connect behaves identically to isConnected', async () => {
      expect(await connect(baseService())).to.equal(true);
    });

    it('resolves false when there is no IMS session, even with a valid DeepL key', async () => {
      setMockIms({ anonymous: true });

      expect(await isConnected(baseService())).to.equal(false);
    });
  });

  describe('sendAllLanguages', () => {
    it('errors and never touches langs when not connected', async () => {
      installFetch(() => new Response('', { status: 401 }));
      const messages = [];
      const langs = [{ code: 'fr-FR', name: 'French' }];

      await sendAllLanguages({
        title: 'Test',
        service: baseService(),
        options: {},
        langs,
        urls: [{ daBasePath: '/page', content: '<html></html>' }],
        actions: { sendMessage: (m) => messages.push(m), saveState: async () => {} },
      });

      expect(messages[0]).to.deep.equal({
        text: 'Not connected to DeepL. Check API key configuration.',
        type: 'error',
      });
      expect(langs[0].translation).to.equal(undefined);
    });

    it('uploads documents, marks the lang created, and records each document', async () => {
      const langs = [{ code: 'fr-FR', name: 'French' }];
      const urls = [{ daBasePath: '/page', content: '<html>hi</html>' }];
      const saveStateCalls = [];

      await sendAllLanguages({
        title: 'Test',
        service: baseService(),
        options: {},
        langs,
        urls,
        actions: { sendMessage: () => {}, saveState: async (s) => saveStateCalls.push(s) },
      });

      expect(langs[0].translation.status).to.equal('created');
      expect(langs[0].translation.sent).to.equal(1);
      expect(langs[0].translation.documents['/page']).to.deep.equal({
        documentId: 'doc-1', documentKey: 'key-1', status: 'queued',
      });
      expect(saveStateCalls).to.deep.equal([{ options: {} }]);
    });

    it('resolves source/target language codes against the live supported-language list', async () => {
      let uploadBody;
      installFetch((u, opts) => {
        if (u.endsWith('/document') && opts.method === 'POST') {
          uploadBody = opts.body;
          return new Response(JSON.stringify({ document_id: 'doc-1', document_key: 'key-1' }), { status: 200 });
        }
        return defaultHandler(u);
      });
      const langs = [{ code: 'fr-FR', name: 'French' }];
      const urls = [{ daBasePath: '/page', content: '<html></html>' }];

      await sendAllLanguages({
        title: 'Test',
        service: baseService(),
        options: {},
        langs,
        urls,
        actions: { sendMessage: () => {}, saveState: async () => {} },
      });

      expect(uploadBody.get('target_lang')).to.equal('FR');
      expect(uploadBody.get('source_lang')).to.equal('EN');
      expect(uploadBody.get('auth_key')).to.equal('deepl-key');
    });

    it('sends the DeepL credential and IMS auth headers on the upload request', async () => {
      await sendAllLanguages({
        title: 'Test',
        service: baseService(),
        options: {},
        langs: [{ code: 'fr', name: 'French' }],
        urls: [{ daBasePath: '/page', content: '<html></html>' }],
        actions: { sendMessage: () => {}, saveState: async () => {} },
      });

      const upload = calls.find((c) => c.url === `${v2Origin}/document`);
      expect(upload.headers['x-deepl-authorization']).to.equal('DeepL-Auth-Key deepl-key');
      expect(upload.headers.Authorization).to.be.a('string');
    });

    it('marks the lang "error" and reports the count when some documents fail to upload', async () => {
      installFetch((u, opts) => {
        if (u.endsWith('/document') && opts.method === 'POST') {
          const file = opts.body.get('file');
          if (file?.name === 'page2.html') return new Response('', { status: 400 });
          return new Response(JSON.stringify({ document_id: 'doc-1', document_key: 'key-1' }), { status: 200 });
        }
        return defaultHandler(u);
      });
      const langs = [{ code: 'fr', name: 'French' }];
      const urls = [
        { daBasePath: '/page1', content: '<html></html>' },
        { daBasePath: '/page2', content: '<html></html>' },
      ];
      const messages = [];

      await sendAllLanguages({
        title: 'Test',
        service: baseService(),
        options: {},
        langs,
        urls,
        actions: { sendMessage: (m) => messages.push(m), saveState: async () => {} },
      });

      expect(langs[0].translation.status).to.equal('error');
      expect(langs[0].translation.sent).to.equal(1);
      const errorMessage = messages.find((m) => m.type === 'error');
      expect(errorMessage.text).to.equal('Uploaded 1/2 documents for French.');
    });
  });

  describe('getStatusAll', () => {
    it('errors when not connected', async () => {
      installFetch(() => new Response('', { status: 401 }));
      const messages = [];
      const langs = [{
        code: 'fr',
        translation: { documents: { '/page': { documentId: 'doc-1', documentKey: 'key-1' } } },
      }];

      await getStatusAll({
        service: baseService(),
        langs,
        urls: [{ daBasePath: '/page' }],
        actions: { sendMessage: (m) => messages.push(m), saveState: async () => {} },
      });

      expect(messages[0]).to.deep.equal({ text: 'Not connected to DeepL.', type: 'error' });
    });

    it('marks the lang translated once every document reports "done"', async () => {
      const langs = [{
        code: 'fr',
        translation: {
          translated: 0,
          documents: { '/page': { documentId: 'doc-1', documentKey: 'key-1', status: 'queued' } },
        },
      }];
      const urls = [{ daBasePath: '/page' }];

      await getStatusAll({
        service: baseService(),
        langs,
        urls,
        actions: { sendMessage: () => {}, saveState: async () => {} },
      });

      expect(langs[0].translation.status).to.equal('translated');
      expect(langs[0].translation.translated).to.equal(1);
      expect(langs[0].translation.documents['/page'].status).to.equal('done');
    });

    it('sets the lang "error" and captures the message when a document errors', async () => {
      installFetch((u) => {
        if (/\/document\/[^/]+$/.test(u) && !u.endsWith('/result')) {
          return new Response(JSON.stringify({ status: 'error', error_message: 'Bad file' }), { status: 200 });
        }
        return defaultHandler(u);
      });
      const langs = [{
        code: 'fr',
        translation: {
          translated: 0,
          documents: { '/page': { documentId: 'doc-1', documentKey: 'key-1', status: 'queued' } },
        },
      }];
      const urls = [{ daBasePath: '/page' }];

      await getStatusAll({
        service: baseService(),
        langs,
        urls,
        actions: { sendMessage: () => {}, saveState: async () => {} },
      });

      expect(langs[0].translation.status).to.equal('error');
      expect(langs[0].translation.documents['/page'].errorMessage).to.equal('Bad file');
    });

    it('never re-checks a document already marked "done"', async () => {
      const langs = [{
        code: 'fr',
        translation: {
          translated: 1,
          status: 'translated',
          documents: { '/page': { documentId: 'doc-1', documentKey: 'key-1', status: 'done' } },
        },
      }];
      const urls = [{ daBasePath: '/page' }];

      await getStatusAll({
        service: baseService(),
        langs,
        urls,
        actions: { sendMessage: () => {}, saveState: async () => {} },
      });

      expect(calls.some((c) => c.url.endsWith('/document/doc-1'))).to.equal(false);
      expect(langs[0].translation.status).to.equal('translated');
    });

    it('skips langs whose status is already terminal ("complete" or "cancelled")', async () => {
      const langs = [
        {
          code: 'fr',
          translation: { status: 'complete', documents: { '/page': { documentId: 'doc-1', documentKey: 'key-1', status: 'queued' } } },
        },
        {
          code: 'de',
          translation: { status: 'cancelled', documents: { '/page': { documentId: 'doc-2', documentKey: 'key-2', status: 'queued' } } },
        },
      ];
      const urls = [{ daBasePath: '/page' }];

      await getStatusAll({
        service: baseService(),
        langs,
        urls,
        actions: { sendMessage: () => {}, saveState: async () => {} },
      });

      expect(calls.some((c) => c.url.includes('/document/doc-1'))).to.equal(false);
      expect(calls.some((c) => c.url.includes('/document/doc-2'))).to.equal(false);
      expect(langs[0].translation.status).to.equal('complete');
      expect(langs[1].translation.status).to.equal('cancelled');
    });
  });

  describe('saveItems', () => {
    it('returns urls unchanged when not connected', async () => {
      installFetch(() => new Response('', { status: 401 }));
      const urls = [{ daBasePath: '/page', ext: 'html' }];

      const result = await saveItems({
        org,
        site,
        service: baseService(),
        lang: { name: 'French', translation: { documents: {} } },
        urls,
        saveFn: async () => {},
        sendMessage: () => {},
      });

      expect(result).to.equal(urls);
    });

    it('marks a url errored when there is no document record for it', async () => {
      const urls = [{ daBasePath: '/missing', ext: 'html' }];

      const result = await saveItems({
        org,
        site,
        service: baseService(),
        lang: { name: 'French', translation: { documents: {} } },
        urls,
        saveFn: async () => {},
        sendMessage: () => {},
      });

      expect(result[0].status).to.equal('error');
    });

    it('downloads, cleans DNT, saves, and marks the url successful once already "done"', async () => {
      const saved = [];
      const messages = [];
      const urls = [{ daBasePath: '/page', ext: 'html' }];
      const lang = {
        name: 'French',
        translation: { documents: { '/page': { documentId: 'doc-1', documentKey: 'key-1', status: 'done' } } },
      };

      const result = await saveItems({
        org,
        site,
        service: baseService(),
        lang,
        urls,
        saveFn: async (u) => saved.push(u),
        sendMessage: (m) => messages.push(m),
      });

      expect(result[0].status).to.equal('success');
      expect(result[0].sourceContent).to.include('translated content');
      expect(saved).to.have.length(1);
      expect(calls.some((c) => c.url.endsWith('/document/doc-1'))).to.equal(false);
      expect(calls.some((c) => c.url.endsWith('/document/doc-1/result'))).to.equal(true);
      expect(messages[0].text).to.equal('0 items left to save for French.');
    });

    it('polls status until "done", then downloads and saves', async () => {
      let statusCalls = 0;
      installFetch((u) => {
        if (u.endsWith('/document/doc-1')) {
          statusCalls += 1;
          return new Response(JSON.stringify({ status: 'done' }), { status: 200 });
        }
        return defaultHandler(u);
      });
      const urls = [{ daBasePath: '/page', ext: 'html' }];
      const lang = {
        name: 'French',
        translation: { documents: { '/page': { documentId: 'doc-1', documentKey: 'key-1', status: 'queued' } } },
      };

      const result = await saveItems({
        org,
        site,
        service: baseService(),
        lang,
        urls,
        saveFn: async () => {},
        sendMessage: () => {},
      });

      expect(statusCalls).to.equal(1);
      expect(result[0].status).to.equal('success');
    });

    it('marks the url errored immediately when the document reports "error"', async () => {
      installFetch((u) => {
        if (u.endsWith('/document/doc-1')) return new Response(JSON.stringify({ status: 'error' }), { status: 200 });
        return defaultHandler(u);
      });
      const urls = [{ daBasePath: '/page', ext: 'html' }];
      const lang = {
        name: 'French',
        translation: { documents: { '/page': { documentId: 'doc-1', documentKey: 'key-1', status: 'queued' } } },
      };

      const result = await saveItems({
        org,
        site,
        service: baseService(),
        lang,
        urls,
        saveFn: async () => {},
        sendMessage: () => {},
      });

      expect(result[0].status).to.equal('error');
    });
  });

  describe('cancelTranslation', () => {
    it('marks translation cancelled and clears the documents map', async () => {
      const lang = { name: 'French', translation: { status: 'created', documents: { '/page': { documentId: 'doc-1' } } } };
      const messages = [];

      const result = await cancelTranslation({ lang, sendMessage: (m) => messages.push(m) });

      expect(result).to.deep.equal({ ok: true });
      expect(lang.translation.status).to.equal('cancelled');
      expect(lang.translation.documents).to.equal(undefined);
      expect(messages[0].text).to.equal('Resetting DeepL translation state for French.');
    });

    it('is a no-op when the lang has no translation state yet', async () => {
      const lang = { name: 'French' };

      const result = await cancelTranslation({ lang, sendMessage: () => {} });

      expect(result).to.deep.equal({ ok: true });
      expect(lang.translation).to.equal(undefined);
    });

    it('works without a sendMessage callback', async () => {
      const lang = { name: 'French', translation: { status: 'created' } };

      const result = await cancelTranslation({ lang });

      expect(result).to.deep.equal({ ok: true });
      expect(lang.translation.status).to.equal('cancelled');
    });
  });

  describe('fetchWithRetry integration', () => {
    it('recovers from a transient 500 before uploading a document', async function retryTest() {
      this.timeout(4000);
      let attempts = 0;
      installFetch((u, opts) => {
        if (u.endsWith('/document') && opts.method === 'POST') {
          attempts += 1;
          if (attempts === 1) return new Response('', { status: 500 });
          return new Response(JSON.stringify({ document_id: 'doc-1', document_key: 'key-1' }), { status: 200 });
        }
        return defaultHandler(u);
      });
      const langs = [{ code: 'fr', name: 'French' }];
      const urls = [{ daBasePath: '/page', content: '<html></html>' }];

      await sendAllLanguages({
        title: 'Test',
        service: baseService(),
        options: {},
        langs,
        urls,
        actions: { sendMessage: () => {}, saveState: async () => {} },
      });

      expect(attempts).to.equal(2);
      expect(langs[0].translation.status).to.equal('created');
    });

    it("never retries a 401 - DeepL's key is static, so nothing can be recovered", async () => {
      let attempts = 0;
      installFetch((u, opts) => {
        if (u.endsWith('/document') && opts.method === 'POST') {
          attempts += 1;
          return new Response('', { status: 401 });
        }
        return defaultHandler(u);
      });
      const langs = [{ code: 'fr', name: 'French' }];
      const urls = [{ daBasePath: '/page', content: '<html></html>' }];

      await sendAllLanguages({
        title: 'Test',
        service: baseService(),
        options: {},
        langs,
        urls,
        actions: { sendMessage: () => {}, saveState: async () => {} },
      });

      expect(attempts).to.equal(1);
      expect(langs[0].translation.status).to.equal('error');
    });
  });
});
