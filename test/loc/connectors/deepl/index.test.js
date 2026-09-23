import { expect } from '@esm-bundle/chai';
import {
  isConnected,
  connect,
  sendAllLanguages,
  getStatusAll,
  saveItems,
  cancelTranslation,
  toDeepLLanguageCode,
} from '../../../../nx/blocks/loc/connectors/deepl/index.js';
import authReady, { getApiKey } from '../../../../nx/blocks/loc/connectors/deepl/auth.js';

let calls;
let origFetch;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function installFetch(customHandler) {
  calls = [];
  origFetch = window.fetch;
  window.fetch = async (url, opts = {}) => {
    const rawUrl = url.toString();
    const u = decodeURIComponent(rawUrl);
    calls.push({ url: rawUrl, decodedUrl: u, method: opts.method, headers: opts.headers, body: opts.body });

    if (customHandler) {
      const handled = customHandler(u, opts, rawUrl);
      if (handled) return handled;
    }

    if (u.includes('/integrations/deepl/login')) {
      return jsonResponse({ access_token: 'deepl-test-token', expires_in: 3600 });
    }
    if (u.includes('/document/') && u.includes('/result')) {
      return new Response('<p>Translated Document</p>', { status: 200 });
    }
    if (u.includes('/document/doc-err')) {
      return jsonResponse({ status: 'error', error_message: 'Translation failed' });
    }
    if (u.includes('/document/')) {
      return jsonResponse({ document_id: 'doc-1', status: 'done', billed_characters: 100 });
    }
    if (u.includes('/document')) {
      return jsonResponse({ document_id: 'doc-1', document_key: 'key-1' });
    }
    return jsonResponse({});
  };
}

function restoreFetch() {
  if (origFetch) window.fetch = origFetch;
  origFetch = null;
}

function baseService(overrides = {}) {
  return {
    org: 'acme',
    site: 'site1',
    env: 'prod',
    apiKey: 'test-api-key',
    ...overrides,
  };
}

describe('deepl connector', () => {
  beforeEach(() => {
    localStorage.clear();
    installFetch();
  });

  afterEach(() => {
    restoreFetch();
    localStorage.clear();
  });

  describe('toDeepLLanguageCode', () => {
    it('normalizes target language codes', () => {
      expect(toDeepLLanguageCode('en', true)).to.equal('EN-US');
      expect(toDeepLLanguageCode('en-US', true)).to.equal('EN-US');
      expect(toDeepLLanguageCode('en-GB', true)).to.equal('EN-GB');
      expect(toDeepLLanguageCode('pt', true)).to.equal('PT-PT');
      expect(toDeepLLanguageCode('pt-BR', true)).to.equal('PT-BR');
      expect(toDeepLLanguageCode('zh-Hans', true)).to.equal('ZH-HANS');
      expect(toDeepLLanguageCode('zh-Hant', true)).to.equal('ZH-HANT');
      expect(toDeepLLanguageCode('de', true)).to.equal('DE');
      expect(toDeepLLanguageCode('it', true)).to.equal('IT');
      expect(toDeepLLanguageCode('', true)).to.equal('EN-US');
      expect(toDeepLLanguageCode(null, true)).to.equal('EN-US');
    });

    it('normalizes source language codes', () => {
      expect(toDeepLLanguageCode('en-US', false)).to.equal('EN');
      expect(toDeepLLanguageCode('de-DE', false)).to.equal('DE');
      expect(toDeepLLanguageCode('it', false)).to.equal('IT');
      expect(toDeepLLanguageCode('', false)).to.equal('EN');
      expect(toDeepLLanguageCode(null, false)).to.equal('EN');
    });
  });

  describe('auth (getApiKey / authReady / isConnected / connect)', () => {
    it('reads explicit apiKey from service config', async () => {
      const key = await getApiKey({ apiKey: 'explicit-key-123' });
      expect(key).to.equal('explicit-key-123');
      expect(await isConnected({ apiKey: 'explicit-key-123' })).to.equal(true);
      expect(await connect({ apiKey: 'explicit-key-123' })).to.equal(true);
    });

    it('reads alternate explicit key properties', async () => {
      expect(await getApiKey({ authKey: 'auth-key' })).to.equal('auth-key');
      expect(await getApiKey({ key: 'simple-key' })).to.equal('simple-key');
      expect(await getApiKey({ token: 'token-key' })).to.equal('token-key');
      expect(await getApiKey({ 'api.key': 'dotted-key' })).to.equal('dotted-key');
    });

    it('fetches token from da-etc login when org and site are configured', async () => {
      const key = await getApiKey({ org: 'acme', site: 'site1', env: 'prod' });
      expect(key).to.equal('deepl-test-token');
      expect(await authReady({ org: 'acme', site: 'site1', env: 'prod' })).to.equal(true);
    });

    it('returns null / false when authentication fails', async () => {
      restoreFetch();
      installFetch((u) => {
        if (u.includes('/integrations/deepl/login')) {
          return new Response('', { status: 401 });
        }
        return null;
      });

      const key = await getApiKey({ org: 'acme', site: 'site-fail', env: 'prod' });
      expect(key).to.equal(null);
      expect(await isConnected({ org: 'acme', site: 'site-fail', env: 'prod' })).to.equal(false);
    });
  });

  describe('sendAllLanguages', () => {
    it('uploads documents and polls status until done', async () => {
      const service = baseService();
      const langs = [{ name: 'Italian', code: 'it' }];
      const urls = [{ daBasePath: '/doc1', content: '<p>Hello</p>' }];
      const messages = [];
      const actions = {
        sendMessage: (msg) => messages.push(msg),
        saveState: async () => {},
      };

      await sendAllLanguages({
        title: 'Project 1',
        service,
        options: { 'source.language': { code: 'en' } },
        langs,
        urls,
        actions,
      });

      expect(langs[0].translation.status).to.equal('translated');
      expect(langs[0].translation.sent).to.equal(1);
      expect(langs[0].translation.translated).to.equal(1);
      expect(langs[0].translation.documents['/doc1'].documentId).to.equal('doc-1');
      expect(langs[0].translation.documents['/doc1'].status).to.equal('done');

      const uploadCall = calls.find((c) => c.decodedUrl.includes('/document') && !c.decodedUrl.includes('/document/') && c.method === 'POST');
      expect(uploadCall).to.exist;
    });

    it('passes custom formality and glossaryId options during upload', async () => {
      const service = baseService();
      const langs = [{ name: 'German', code: 'de' }];
      const urls = [{ daBasePath: '/doc-opt', content: '<p>Text</p>' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await sendAllLanguages({
        title: 'Project Options',
        service,
        options: {
          'source.language': { code: 'en' },
          formality: 'prefer_more',
          glossary_id: 'glossary-123',
        },
        langs,
        urls,
        actions,
      });

      expect(langs[0].translation.status).to.equal('translated');
      expect(langs[0].translation.documents['/doc-opt'].documentId).to.equal('doc-1');
    });

    it('handles authentication failure gracefully', async () => {
      restoreFetch();
      installFetch((u) => {
        if (u.includes('/integrations/deepl/login')) return new Response('', { status: 401 });
        return null;
      });

      const langs = [{ name: 'Italian', code: 'it' }];
      const urls = [{ daBasePath: '/doc1', content: '<p>Hello</p>' }];
      const messages = [];
      const actions = { sendMessage: (msg) => messages.push(msg), saveState: async () => {} };

      await sendAllLanguages({
        title: 'Auth Fail',
        service: { org: 'acme', site: 'site1', env: 'prod' },
        langs,
        urls,
        actions,
      });

      expect(langs[0].translation.status).to.equal('error');
      expect(messages.some((m) => m.type === 'error')).to.equal(true);
    });

    it('sets status to error if document upload fails', async () => {
      restoreFetch();
      installFetch((u) => {
        if (u.includes('/document') && !u.includes('/document/')) {
          return new Response('', { status: 500 });
        }
        return null;
      });

      const langs = [{ name: 'French', code: 'fr' }];
      const urls = [{ daBasePath: '/doc-fail', content: '<p>Hello</p>' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await sendAllLanguages({
        title: 'Upload Fail',
        service: baseService(),
        langs,
        urls,
        actions,
      });

      expect(langs[0].translation.status).to.equal('error');
      expect(langs[0].translation.documents['/doc-fail'].status).to.equal('error');
    });

    it('sets status to error if polling returns error status', async () => {
      restoreFetch();
      installFetch((u) => {
        if (u.includes('/document') && !u.includes('/document/')) {
          return jsonResponse({ document_id: 'doc-err', document_key: 'key-err' });
        }
        if (u.includes('/document/doc-err')) {
          return jsonResponse({ status: 'error', error_message: 'Quota exceeded' });
        }
        return null;
      });

      const langs = [{ name: 'Spanish', code: 'es' }];
      const urls = [{ daBasePath: '/doc-err', content: '<p>Content</p>' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await sendAllLanguages({
        title: 'Poll Error',
        service: baseService(),
        langs,
        urls,
        actions,
      });

      expect(langs[0].translation.status).to.equal('error');
      expect(langs[0].translation.documents['/doc-err'].status).to.equal('error');
      expect(langs[0].translation.documents['/doc-err'].errorMessage).to.equal('Quota exceeded');
    });
  });

  describe('getStatusAll', () => {
    it('polls status for in-progress documents and updates state', async () => {
      const service = baseService();
      const langs = [{
        name: 'Italian',
        code: 'it',
        translation: {
          status: 'queued',
          documents: {
            '/doc1': { documentId: 'doc-1', documentKey: 'key-1', status: 'queued' },
          },
        },
      }];
      const urls = [{ daBasePath: '/doc1' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await getStatusAll({ service, langs, urls, actions });

      expect(langs[0].translation.status).to.equal('translated');
      expect(langs[0].translation.translated).to.equal(1);
      expect(langs[0].translation.documents['/doc1'].status).to.equal('done');
    });

    it('handles translation errors during getStatusAll', async () => {
      const service = baseService();
      const langs = [{
        name: 'Italian',
        code: 'it',
        translation: {
          status: 'queued',
          documents: {
            '/doc-err': { documentId: 'doc-err', documentKey: 'key-err', status: 'queued' },
          },
        },
      }];
      const urls = [{ daBasePath: '/doc-err' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await getStatusAll({ service, langs, urls, actions });

      expect(langs[0].translation.status).to.equal('error');
      expect(langs[0].translation.documents['/doc-err'].status).to.equal('error');
    });
  });

  describe('saveItems', () => {
    it('downloads translated document from /result endpoint and saves via saveFn', async () => {
      const service = baseService();
      const lang = {
        name: 'Italian',
        code: 'it',
        translation: {
          status: 'translated',
          documents: {
            '/doc1': { documentId: 'doc-1', documentKey: 'key-1', status: 'done' },
          },
        },
      };
      const urls = [{ daBasePath: '/doc1', ext: 'html' }];
      const savedUrls = [];
      const saveFn = async (url) => {
        savedUrls.push(url);
      };

      const result = await saveItems({
        org: 'acme',
        site: 'site1',
        service,
        lang,
        urls,
        saveFn,
        sendMessage: () => {},
      });

      expect(result[0].status).to.equal('success');
      expect(savedUrls.length).to.equal(1);
      expect(savedUrls[0].sourceContent).to.include('Translated Document');

      const resultCall = calls.find((c) => c.decodedUrl.includes('/document/doc-1/result'));
      expect(resultCall).to.exist;
      expect(resultCall.method).to.equal('POST');
    });

    it('polls status if not yet done before downloading', async () => {
      const service = baseService();
      const lang = {
        name: 'Italian',
        code: 'it',
        translation: {
          documents: {
            '/doc1': { documentId: 'doc-1', documentKey: 'key-1', status: 'queued' },
          },
        },
      };
      const urls = [{ daBasePath: '/doc1', ext: 'html' }];
      const savedUrls = [];

      await saveItems({
        org: 'acme',
        site: 'site1',
        service,
        lang,
        urls,
        saveFn: async (url) => savedUrls.push(url),
      });

      expect(savedUrls.length).to.equal(1);
      expect(savedUrls[0].status).to.equal('success');
    });

    it('marks url status as error when document record is missing or download fails', async () => {
      restoreFetch();
      installFetch((u) => {
        if (u.includes('/result')) return new Response('', { status: 500 });
        if (u.includes('/document/')) return jsonResponse({ status: 'done' });
        return null;
      });

      const service = baseService();
      const lang = {
        name: 'Italian',
        code: 'it',
        translation: {
          documents: {
            '/doc1': { documentId: 'doc-1', documentKey: 'key-1', status: 'done' },
          },
        },
      };
      const urls = [{ daBasePath: '/doc1', ext: 'html' }, { daBasePath: '/doc-missing', ext: 'html' }];

      const result = await saveItems({
        org: 'acme',
        site: 'site1',
        service,
        lang,
        urls,
        saveFn: async () => {},
      });

      expect(result[0].status).to.equal('error');
      expect(result[1].status).to.equal('error');
    });
  });

  describe('cancelTranslation', () => {
    it('sets translation status to cancelled and sends message', async () => {
      const lang = {
        name: 'Italian',
        translation: { status: 'in-progress' },
      };
      const messages = [];
      const res = await cancelTranslation({
        lang,
        sendMessage: (msg) => messages.push(msg),
      });

      expect(res.ok).to.equal(true);
      expect(lang.translation.status).to.equal('cancelled');
      expect(messages[0].text).to.include('Resetting DeepL translation state');
    });
  });
});
