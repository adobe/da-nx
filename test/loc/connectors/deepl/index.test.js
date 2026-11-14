import { expect } from '@esm-bundle/chai';
import {
  connect, isConnected, sendAllLanguages, getStatusAll, saveItems,
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

  it('distinguishes es-419 from es-ES in the static heuristic', () => {
    expect(toDeepLLanguageCode('es-419', true)).to.equal('ES-419');
    expect(toDeepLLanguageCode('es-LA', true)).to.equal('ES-419');
    expect(toDeepLLanguageCode('es-ES', true)).to.equal('ES');
    expect(toDeepLLanguageCode('es', true)).to.equal('ES');
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
    const supported = new Set(['NB', 'FR-CA']);
    expect(toDeepLLanguageCode('fr-BE', true, supported)).to.equal('FR-CA');
  });

  it('resolves Latin American Spanish country codes to ES-419 against a realistic live set', () => {
    // Mirrors DeepL's real list: bare ES, ES-419 and ES-ES all exist as valid targets, so
    // without the ES hint entry this would silently fall back to bare ES.
    const supported = new Set(['ES', 'ES-419', 'ES-ES']);
    expect(toDeepLLanguageCode('es-MX', true, supported)).to.equal('ES-419');
    expect(toDeepLLanguageCode('es-AR', true, supported)).to.equal('ES-419');
    expect(toDeepLLanguageCode('es-PR', true, supported)).to.equal('ES-419');
    expect(toDeepLLanguageCode('es-ES', true, supported)).to.equal('ES-ES');
    expect(toDeepLLanguageCode('es', true, supported)).to.equal('ES');
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
  const statusUrl = `https://da-etc.adobeaem.workers.dev/${org}/sites/${site}/integrations/deepl/status?env=prod`;

  let calls;
  let origFetch;

  function baseService(overrides = {}) {
    return { org, site, sourceLanguage: 'en', ...overrides };
  }

  function statusResponse(connected = true) {
    return new Response(JSON.stringify({ connected }), { status: 200 });
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
    if (u.includes('/integrations/deepl/status')) return statusResponse();
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
    it('resolves true when da-etc reports a working key and an IMS session exists', async () => {
      const connected = await isConnected(baseService());

      expect(connected).to.equal(true);
      expect(calls[0].url).to.equal(statusUrl);
      expect(calls[0].method).to.equal('GET');
    });

    it('resolves false when da-etc reports no working key', async () => {
      installFetch(() => statusResponse(false));

      expect(await isConnected(baseService())).to.equal(false);
    });

    it('resolves false when the status request fails', async () => {
      installFetch(() => new Response('', { status: 401 }));

      expect(await isConnected(baseService())).to.equal(false);
    });

    it('checks the stage env when the service env is stage', async () => {
      await isConnected(baseService({ env: 'stage' }));

      expect(calls[0].url).to.equal(statusUrl.replace('env=prod', 'env=stage'));
    });

    it('connect behaves identically to isConnected', async () => {
      expect(await connect(baseService())).to.equal(true);
    });

    it('resolves false without a status call when there is no IMS session', async () => {
      setMockIms({ anonymous: true });

      expect(await isConnected(baseService())).to.equal(false);
      expect(calls.some((c) => c.url.includes('/integrations/'))).to.equal(false);
    });

    it('resolves false without a status call when the org or site is missing', async () => {
      expect(await isConnected({ org, sourceLanguage: 'en' })).to.equal(false);
      expect(calls).to.have.length(0);
    });
  });

  describe('sendAllLanguages', () => {
    it('errors with a session message and makes no DeepL calls when the IMS session is missing', async () => {
      setMockIms({ anonymous: true });
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

      expect(messages).to.deep.equal([{
        text: 'Your Adobe session has expired. Sign in again to continue.',
        type: 'error',
      }]);
      expect(calls.some((c) => c.url.includes('/v2/') || c.url.includes('/v3/'))).to.equal(false);
      expect(langs[0].translation).to.equal(undefined);
    });

    it('errors when the org or site is missing', async () => {
      const messages = [];
      const langs = [{ code: 'fr-FR', name: 'French' }];

      await sendAllLanguages({
        title: 'Test',
        service: baseService({ site: undefined }),
        options: {},
        langs,
        urls: [{ daBasePath: '/page', content: '<html></html>' }],
        actions: { sendMessage: (m) => messages.push(m), saveState: async () => {} },
      });

      expect(messages[0]).to.deep.equal({
        text: 'DeepL is missing an org or site configuration.',
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
      expect(uploadBody.has('auth_key')).to.equal(false);
    });

    it('sends IMS auth and the env header, and no DeepL key, on the upload request', async () => {
      await sendAllLanguages({
        title: 'Test',
        service: baseService(),
        options: {},
        langs: [{ code: 'fr', name: 'French' }],
        urls: [{ daBasePath: '/page', content: '<html></html>' }],
        actions: { sendMessage: () => {}, saveState: async () => {} },
      });

      const upload = calls.find((c) => c.url === `${v2Origin}/document`);
      expect(upload.headers['x-translate-env']).to.equal('prod');
      expect(upload.headers['x-deepl-authorization']).to.equal(undefined);
      expect(upload.headers.Authorization).to.be.a('string');
    });

    it('sends the stage env header when the service env is stage', async () => {
      await sendAllLanguages({
        title: 'Test',
        service: baseService({ env: 'stage' }),
        options: {},
        langs: [{ code: 'fr', name: 'French' }],
        urls: [{ daBasePath: '/page', content: '<html></html>' }],
        actions: { sendMessage: () => {}, saveState: async () => {} },
      });

      const upload = calls.find((c) => c.url === `${v2Origin}/document`);
      expect(upload.headers['x-translate-env']).to.equal('stage');
    });

    describe('formality', () => {
      const uploadFormality = async ({ options = {}, service = baseService() }) => {
        let body;
        installFetch((u, opts) => {
          if (u.endsWith('/document') && opts.method === 'POST') {
            body = opts.body;
            return new Response(JSON.stringify({ document_id: 'doc-1', document_key: 'key-1' }), { status: 200 });
          }
          return defaultHandler(u);
        });
        await sendAllLanguages({
          title: 'Test',
          service,
          options,
          langs: [{ code: 'fr', name: 'French' }],
          urls: [{ daBasePath: '/page', content: '<html></html>' }],
          actions: { sendMessage: () => {}, saveState: async () => {} },
        });
        return body;
      };

      it('sends a supported formality value', async () => {
        const body = await uploadFormality({ options: { formality: 'more' } });
        expect(body.get('formality')).to.equal('more');
      });

      it('normalizes case and whitespace', async () => {
        const body = await uploadFormality({
          options: { 'translation.service.custom.option.formality': ' Prefer_Less ' },
        });
        expect(body.get('formality')).to.equal('prefer_less');
      });

      it('omits formality for default, unknown, or absent values', async () => {
        const defaults = await uploadFormality({ options: { formality: 'default' } });
        const unknown = await uploadFormality({ options: { formality: 'bogus' } });
        const absent = await uploadFormality({ options: {} });
        expect(defaults.has('formality')).to.equal(false);
        expect(unknown.has('formality')).to.equal(false);
        expect(absent.has('formality')).to.equal(false);
      });

      it('honors the service-level formality', async () => {
        const body = await uploadFormality({ options: { service: { formality: 'less' } } });
        expect(body.get('formality')).to.equal('less');
      });
    });

    it('derives collision-free upload file names that always end in .html', async () => {
      const names = [];
      installFetch((u, opts) => {
        if (u.endsWith('/document') && opts.method === 'POST') {
          names.push(opts.body.get('file')?.name);
        }
        return defaultHandler(u);
      });
      await sendAllLanguages({
        title: 'Test',
        service: baseService(),
        options: {},
        langs: [{ code: 'fr', name: 'French' }],
        urls: ['/a/b', '/a_b', '/en/page-v1.2', '/page.html']
          .map((daBasePath) => ({ daBasePath, content: '<html></html>' })),
        actions: { sendMessage: () => {}, saveState: async () => {} },
      });

      expect(names.sort()).to.deep.equal(
        ['a_b.html', 'a__b.html', 'en_page-v1.2.html', 'page.html'].sort(),
      );
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
      expect(errorMessage.text).to.equal('Failed to upload 1/2 documents for French: /page2 (HTTP 400).');
      expect(messages.at(-1)).to.equal(errorMessage);
    });

    it('names the failed path and the vendor reason in the error message', async () => {
      installFetch((u, opts) => {
        if (u.endsWith('/document') && opts.method === 'POST') {
          return new Response(JSON.stringify({ message: 'Quota exceeded' }), { status: 456 });
        }
        return defaultHandler(u);
      });
      const messages = [];

      await sendAllLanguages({
        title: 'Test',
        service: baseService(),
        options: {},
        langs: [{ code: 'de', name: 'German' }],
        urls: [{ daBasePath: '/page', content: '<html></html>' }],
        actions: { sendMessage: (m) => messages.push(m), saveState: async () => {} },
      });

      const errorMessage = messages.find((m) => m.type === 'error');
      expect(errorMessage.text).to.equal('Failed to upload 1/1 documents for German: /page (HTTP 456 Quota exceeded).');
    });

    it('skips already-uploaded documents when retried', async () => {
      let failPage2 = true;
      installFetch((u, opts) => {
        if (u.endsWith('/document') && opts.method === 'POST') {
          const file = opts.body.get('file');
          if (file?.name === 'page2.html' && failPage2) return new Response('', { status: 400 });
          return new Response(JSON.stringify({ document_id: `doc-${file.name}`, document_key: 'key' }), { status: 200 });
        }
        return defaultHandler(u);
      });
      const langs = [{ code: 'fr', name: 'French' }];
      const urls = [
        { daBasePath: '/page1', content: '<html></html>' },
        { daBasePath: '/page2', content: '<html></html>' },
      ];
      const run = () => sendAllLanguages({
        title: 'Test',
        service: baseService(),
        options: {},
        langs,
        urls,
        actions: { sendMessage: () => {}, saveState: async () => {} },
      });

      await run();
      expect(langs[0].translation.status).to.equal('error');

      failPage2 = false;
      const uploadsBefore = calls.filter((c) => c.url === `${v2Origin}/document`).length;
      await run();
      const uploadsAfter = calls.filter((c) => c.url === `${v2Origin}/document`).length;

      expect(uploadsAfter - uploadsBefore).to.equal(1);
      expect(langs[0].translation.status).to.equal('created');
      expect(langs[0].translation.sent).to.equal(2);
    });

    describe('language validation', () => {
      const send = ({ siteName, sourceLanguage = 'en', langs, messages = [] }) => sendAllLanguages({
        title: 'Test',
        service: baseService({ site: siteName, sourceLanguage }),
        options: {},
        langs,
        urls: [{ daBasePath: '/page', content: '<html></html>' }],
        actions: { sendMessage: (m) => messages.push(m), saveState: async () => {} },
      });
      const languageCalls = () => calls.filter((c) => c.url.includes('/v3/languages'));
      const uploadCalls = () => calls.filter((c) => c.url.endsWith('/document'));

      it('errors once naming unsupported target languages and uploads nothing', async () => {
        const langs = [{ code: 'xx', name: 'Klingon' }, { code: 'fr', name: 'French' }];
        const messages = [];

        await send({ siteName: 'val-target', langs, messages });

        const errors = messages.filter((m) => m.type === 'error');
        expect(errors).to.have.length(1);
        expect(errors[0].text).to.equal('DeepL does not support: Klingon (xx).');
        expect(uploadCalls()).to.have.length(0);
        expect(langs[0].translation).to.equal(undefined);
        expect(langs[1].translation).to.equal(undefined);
      });

      it('names an unsupported source language', async () => {
        const messages = [];

        await send({
          siteName: 'val-source',
          sourceLanguage: 'xx',
          langs: [{ code: 'fr', name: 'French' }],
          messages,
        });

        expect(messages.find((m) => m.type === 'error').text).to.equal('DeepL does not support: source xx.');
        expect(uploadCalls()).to.have.length(0);
      });

      it('skips validation and still uploads when the languages lookup fails', async () => {
        installFetch((u) => {
          if (u.includes('/v3/languages')) return new Response('', { status: 400 });
          return defaultHandler(u);
        });
        const messages = [];

        await send({ siteName: 'val-lookup-fail', langs: [{ code: 'fr', name: 'French' }], messages });

        expect(messages.some((m) => m?.type === 'error')).to.equal(false);
        expect(uploadCalls()).to.have.length(1);
      });

      it('retries a failed languages lookup on the next send', async () => {
        installFetch((u) => {
          if (u.includes('/v3/languages')) return new Response('', { status: 400 });
          return defaultHandler(u);
        });
        const langs = [{ code: 'fr', name: 'French' }];

        await send({ siteName: 'val-retry', langs });
        await send({ siteName: 'val-retry', langs });

        expect(languageCalls()).to.have.length(2);
      });

      it('caches a successful languages lookup per origin', async () => {
        const langs = [{ code: 'fr', name: 'French' }];

        await send({ siteName: 'val-cache', langs });
        await send({ siteName: 'val-cache', langs });
        expect(languageCalls()).to.have.length(1);
      });

      it('does not share the languages cache across sites', async () => {
        const langs = [{ code: 'fr', name: 'French' }];
        await send({ siteName: 'val-site-a', langs });
        await send({ siteName: 'val-site-b', langs });
        expect(languageCalls()).to.have.length(2);
      });
    });
  });

  describe('getStatusAll', () => {
    it('errors with a session message and fetches no statuses when the IMS session is missing', async () => {
      setMockIms({ anonymous: true });
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

      expect(messages).to.deep.equal([{
        text: 'Your Adobe session has expired. Sign in again to continue.',
        type: 'error',
      }]);
      expect(calls.some((c) => c.url.includes('/v2/'))).to.equal(false);
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

    it('resumes from persisted document ids after a reload', async () => {
      const saved = JSON.parse(JSON.stringify([{
        code: 'fr',
        translation: {
          translated: 0,
          documents: { '/page': { documentId: 'doc-1', documentKey: 'key-1', status: 'queued' } },
        },
      }]));
      const langs = JSON.parse(JSON.stringify(saved));

      await getStatusAll({
        service: baseService(),
        langs,
        urls: [{ daBasePath: '/page' }],
        actions: { sendMessage: () => {}, saveState: async () => {} },
      });

      expect(calls.some((c) => /\/document\/doc-1$/.test(c.url))).to.equal(true);
      expect(calls.some((c) => c.url.endsWith('/document') && c.method === 'POST')).to.equal(false);
      expect(langs[0].translation.documents['/page'].status).to.equal('done');
      expect(langs[0].translation.status).to.equal('translated');
    });

    it('leaves a document unchanged when its status check fails', async () => {
      installFetch((u) => {
        if (u.endsWith('/document/doc-1')) return new Response('nope', { status: 404 });
        return defaultHandler(u);
      });
      const messages = [];
      const langs = [{
        code: 'fr',
        translation: {
          translated: 0,
          documents: { '/page': { documentId: 'doc-1', documentKey: 'key-1', status: 'queued' } },
        },
      }];

      await getStatusAll({
        service: baseService(),
        langs,
        urls: [{ daBasePath: '/page' }],
        actions: { sendMessage: (m) => messages.push(m), saveState: async () => {} },
      });

      expect(langs[0].translation.documents['/page'].status).to.equal('queued');
      expect(langs[0].translation.translated).to.equal(0);
      expect(langs[0].translation.status).to.not.equal('translated');
      expect(messages.some((m) => m?.type === 'error')).to.equal(false);
    });

    describe('in-progress mapping', () => {
      const statusHandler = (statusByDoc) => (u) => {
        const match = u.match(/\/document\/([^/]+)$/);
        if (match && !u.endsWith('/result')) {
          return new Response(JSON.stringify({ status: statusByDoc[match[1]] }), { status: 200 });
        }
        return defaultHandler(u);
      };
      const makeLang = (status, docs) => ({
        code: 'fr',
        translation: { status, translated: 0, documents: docs },
      });
      const check = (langs, urls) => getStatusAll({
        service: baseService(),
        langs,
        urls,
        actions: { sendMessage: () => {}, saveState: async () => {} },
      });

      it('sets "in progress" when a document is translating', async () => {
        installFetch(statusHandler({ 'doc-1': 'translating' }));
        const langs = [makeLang('created', {
          '/page': { documentId: 'doc-1', documentKey: 'key-1', status: 'queued' },
        })];
        await check(langs, [{ daBasePath: '/page' }]);
        expect(langs[0].translation.status).to.equal('in progress');
      });

      it('sets "in progress" when only some documents are done', async () => {
        installFetch(statusHandler({ 'doc-1': 'done', 'doc-2': 'queued' }));
        const langs = [makeLang('created', {
          '/a': { documentId: 'doc-1', documentKey: 'key-1', status: 'queued' },
          '/b': { documentId: 'doc-2', documentKey: 'key-2', status: 'queued' },
        })];
        await check(langs, [{ daBasePath: '/a' }, { daBasePath: '/b' }]);
        expect(langs[0].translation.status).to.equal('in progress');
        expect(langs[0].translation.translated).to.equal(1);
      });

      it('keeps "created" while documents are only queued', async () => {
        installFetch(statusHandler({ 'doc-1': 'queued' }));
        const langs = [makeLang('created', {
          '/page': { documentId: 'doc-1', documentKey: 'key-1', status: 'queued' },
        })];
        await check(langs, [{ daBasePath: '/page' }]);
        expect(langs[0].translation.status).to.equal('created');
      });

      it('leaves the status unchanged for an unknown DeepL state', async () => {
        installFetch(statusHandler({ 'doc-1': 'weird' }));
        const langs = [makeLang('created', {
          '/page': { documentId: 'doc-1', documentKey: 'key-1', status: 'queued' },
        })];
        await check(langs, [{ daBasePath: '/page' }]);
        expect(langs[0].translation.status).to.equal('created');
      });

      it('does not flip an errored lang to "in progress"', async () => {
        installFetch(statusHandler({ 'doc-2': 'translating' }));
        const langs = [makeLang('error', {
          '/a': { status: 'error', error: 'upload failed' },
          '/b': { documentId: 'doc-2', documentKey: 'key-2', status: 'queued' },
        })];
        await check(langs, [{ daBasePath: '/a' }, { daBasePath: '/b' }]);
        expect(langs[0].translation.status).to.equal('error');
      });
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

    it('sends an error message naming the failed path and vendor reason', async () => {
      installFetch((u) => {
        if (/\/document\/[^/]+$/.test(u) && !u.endsWith('/result')) {
          return new Response(JSON.stringify({ status: 'error', error_message: 'Bad file' }), { status: 200 });
        }
        return defaultHandler(u);
      });
      const messages = [];
      const langs = [{
        code: 'fr',
        name: 'French',
        translation: {
          translated: 0,
          documents: { '/page': { documentId: 'doc-1', documentKey: 'key-1', status: 'queued' } },
        },
      }];

      await getStatusAll({
        service: baseService(),
        langs,
        urls: [{ daBasePath: '/page' }],
        actions: { sendMessage: (m) => messages.push(m), saveState: async () => {} },
      });

      expect(messages.at(-1)).to.deep.equal({
        text: 'DeepL failed to translate: French: /page (Bad file).',
        type: 'error',
      });
    });

    it('clears the message when no document failed', async () => {
      const messages = [];
      const langs = [{
        code: 'fr',
        translation: {
          translated: 0,
          documents: { '/page': { documentId: 'doc-1', documentKey: 'key-1', status: 'queued' } },
        },
      }];

      await getStatusAll({
        service: baseService(),
        langs,
        urls: [{ daBasePath: '/page' }],
        actions: { sendMessage: (m) => messages.push(m), saveState: async () => {} },
      });

      expect(messages).to.deep.equal([undefined]);
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

    it('skips langs whose status is already "complete"', async () => {
      const langs = [
        {
          code: 'fr',
          translation: { status: 'complete', documents: { '/page': { documentId: 'doc-1', documentKey: 'key-1', status: 'queued' } } },
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
      expect(langs[0].translation.status).to.equal('complete');
    });
  });

  describe('saveItems', () => {
    it('returns urls unchanged when not connected', async () => {
      installFetch(() => new Response('', { status: 401 }));
      const urls = [{ daBasePath: '/page', ext: 'html' }];
      const messages = [];

      const result = await saveItems({
        org,
        site,
        service: baseService(),
        lang: { name: 'French', translation: { documents: {} } },
        urls,
        saveFn: async (u) => { u.status = 'success'; },
        sendMessage: (m) => messages.push(m),
      });

      expect(result).to.equal(urls);
      expect(urls[0].status).to.equal('error');
      expect(messages.some((m) => m?.type === 'error')).to.equal(true);
    });

    const run404 = async (downloadedAt) => {
      installFetch((u) => {
        if (u.endsWith('/result')) return new Response('nope', { status: 404 });
        return defaultHandler(u);
      });
      const messages = [];
      const urls = [{ daBasePath: '/page', ext: 'html', destination: '/org/site/fr/page.html' }];
      const docRecord = { documentId: 'doc-1', documentKey: 'key-1', status: 'done', downloadedAt };
      const lang = { name: 'French', translation: { documents: { '/page': docRecord } } };
      const state = { saved: 0 };

      const result = await saveItems({
        org,
        site,
        service: baseService(),
        lang,
        urls,
        saveFn: async (u) => { state.saved += 1; u.status = 'success'; },
        sendMessage: (m) => messages.push(m),
      });
      return { result, messages, state };
    };

    it('treats a 404 on re-download as already downloaded when a save was recorded', async () => {
      const { result, messages, state } = await run404(1700000000000);

      expect(result[0].status).to.equal('success');
      expect(state.saved).to.equal(0);
      expect(messages.some((m) => m?.type === 'error')).to.equal(false);
    });

    it('fails a 404 on re-download when no save was recorded', async () => {
      const { result, messages, state } = await run404(undefined);

      expect(result[0].status).to.equal('error');
      expect(state.saved).to.equal(0);
      expect(messages.some((m) => m?.type === 'error')).to.equal(true);
    });

    it('records downloadedAt after a successful save only', async () => {
      installFetch(defaultHandler);
      const docRecord = { documentId: 'doc-1', documentKey: 'key-1', status: 'done' };
      const lang = { name: 'French', translation: { documents: { '/page': docRecord } } };
      const run = (saveFn) => saveItems({
        org,
        site,
        service: baseService(),
        lang,
        urls: [{ daBasePath: '/page', ext: 'html' }],
        saveFn,
        sendMessage: () => {},
      });

      await run(async () => {});
      expect(docRecord.downloadedAt).to.equal(undefined);

      await run(async (u) => { u.status = 'success'; });
      expect(docRecord.downloadedAt).to.be.a('number');
    });

    it('reports a failed download with the path and reason', async () => {
      installFetch((u) => {
        if (u.endsWith('/result')) return new Response('nope', { status: 403 });
        return defaultHandler(u);
      });
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
        saveFn: async (u) => { u.status = 'success'; },
        sendMessage: (m) => messages.push(m),
      });

      const errors = messages.filter((m) => m?.type === 'error');
      expect(result[0].status).to.equal('error');
      expect(errors).to.have.length(1);
      expect(errors[0].text).to.include('Failed to save 1/1 items for French');
      expect(errors[0].text).to.include('/page (download failed)');
    });

    it('reports a pending document as not finished', async () => {
      installFetch((u) => {
        if (u.endsWith('/document/doc-1')) {
          return new Response(JSON.stringify({ status: 'translating' }), { status: 200 });
        }
        return defaultHandler(u);
      });
      const messages = [];
      const urls = [{ daBasePath: '/page', ext: 'html' }];
      const lang = {
        name: 'French',
        translation: { documents: { '/page': { documentId: 'doc-1', documentKey: 'key-1', status: 'translating' } } },
      };

      await saveItems({
        org,
        site,
        service: baseService(),
        lang,
        urls,
        saveFn: async (u) => { u.status = 'success'; },
        sendMessage: (m) => messages.push(m),
      });

      const error = messages.find((m) => m?.type === 'error');
      expect(error.text).to.include('translation not finished');
    });

    it('reports the thrown message when saveFn throws, without hanging', async () => {
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
        saveFn: async () => { throw new Error('write denied'); },
        sendMessage: (m) => messages.push(m),
      });

      expect(result[0].status).to.equal('error');
      const error = messages.find((m) => m?.type === 'error');
      expect(error.text).to.include('write denied');
    });

    it('marks a url errored when there is no document record for it', async () => {
      const urls = [{ daBasePath: '/missing', ext: 'html' }];

      const result = await saveItems({
        org,
        site,
        service: baseService(),
        lang: { name: 'French', translation: { documents: {} } },
        urls,
        saveFn: async (u) => { u.status = 'success'; },
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
        saveFn: async (u) => { u.status = 'success'; saved.push(u); },
        sendMessage: (m) => messages.push(m),
      });

      expect(result[0].status).to.equal('success');
      expect(result[0].sourceContent).to.include('translated content');
      expect(saved).to.have.length(1);
      expect(calls.some((c) => c.url.endsWith('/document/doc-1'))).to.equal(false);
      expect(calls.some((c) => c.url.endsWith('/document/doc-1/result'))).to.equal(true);
      expect(messages[0].text).to.equal('0 items left to save for French.');
    });

    it('marks the url errored without polling when the document is still "translating"', async () => {
      let statusCalls = 0;
      installFetch((u) => {
        if (u.endsWith('/document/doc-1')) {
          statusCalls += 1;
          return new Response(JSON.stringify({ status: 'translating' }), { status: 200 });
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
        saveFn: async (u) => { u.status = 'success'; },
        sendMessage: () => {},
      });

      expect(statusCalls).to.equal(1);
      expect(result[0].status).to.equal('error');
      expect(calls.some((c) => c.url.endsWith('/result'))).to.equal(false);
    });

    it('checks status once, then downloads and saves', async () => {
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
        saveFn: async (u) => { u.status = 'success'; },
        sendMessage: () => {},
      });

      expect(statusCalls).to.equal(1);
      expect(result[0].status).to.equal('success');
    });

    it('authenticates status and result calls via header only, not the body', async () => {
      installFetch(defaultHandler);
      const lang = {
        name: 'French',
        translation: { documents: { '/page': { documentId: 'doc-1', documentKey: 'key-1', status: 'queued' } } },
      };

      await saveItems({
        org,
        site,
        service: baseService(),
        lang,
        urls: [{ daBasePath: '/page', ext: 'html' }],
        saveFn: async (u) => { u.status = 'success'; },
        sendMessage: () => {},
      });

      const status = calls.find((c) => c.url.endsWith('/document/doc-1'));
      const result = calls.find((c) => c.url.endsWith('/document/doc-1/result'));
      [status, result].forEach((call) => {
        expect(call.headers['x-translate-env']).to.equal('prod');
        expect(call.headers['x-deepl-authorization']).to.equal(undefined);
        expect(call.body.has('auth_key')).to.equal(false);
        expect(call.body.get('document_key')).to.equal('key-1');
      });
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
        saveFn: async (u) => { u.status = 'success'; },
        sendMessage: () => {},
      });

      expect(result[0].status).to.equal('error');
    });

    it('keeps the url errored and skips the progress message when saveFn fails without throwing', async () => {
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
        saveFn: async (u) => { u.status = 'error'; return null; },
        sendMessage: (m) => messages.push(m),
      });

      expect(result[0].status).to.equal('error');
      expect(messages).to.have.length(1);
      expect(messages[0].type).to.equal('error');
      expect(messages[0].text).to.contain('/page (save failed)');
    });

    it('downloads at most 5 documents at a time', async function limitConcurrency() {
      this.timeout(10000);
      const paths = Array.from({ length: 7 }, (_, i) => `/p${i}`);
      const documents = Object.fromEntries(paths.map((p, i) => [p, { documentId: `doc-${i}`, documentKey: `key-${i}`, status: 'done' }]));
      const urls = paths.map((daBasePath) => ({ daBasePath, ext: 'html' }));
      const state = { active: 0, maxActive: 0 };
      installFetch(async (u) => {
        if (!u.endsWith('/result')) return defaultHandler(u);
        state.active += 1;
        state.maxActive = Math.max(state.maxActive, state.active);
        await new Promise((resolve) => { setTimeout(resolve, 600); });
        state.active -= 1;
        return new Response('translated content', { status: 200 });
      });

      await saveItems({
        org,
        site,
        service: baseService(),
        lang: { name: 'French', translation: { documents } },
        urls,
        saveFn: async (u) => { u.status = 'success'; },
        sendMessage: () => {},
      });

      expect(state.maxActive).to.be.at.most(5);
      expect(state.maxActive).to.be.greaterThan(1);
      expect(urls.every((u) => u.status === 'success')).to.equal(true);
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
