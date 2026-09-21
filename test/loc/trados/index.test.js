import { expect } from '@esm-bundle/chai';
import { sendAllLanguages, saveItems } from '../../../nx/blocks/loc/connectors/trados/index.js';

const API_ENDPOINT = 'https://api.sdl.com';

let calls;
let origFetch;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function defaultHandler(url, opts) {
  if (url.includes('/integrations/trados/login')) {
    return jsonResponse({ access_token: 'trados-token', expires_in: 3600 });
  }
  if (url.includes('/custom-field-definitions')) {
    return jsonResponse({ items: [] });
  }
  if (url.endsWith('/projects') && opts.method === 'POST') {
    return jsonResponse({ id: 'proj-1' });
  }
  if (url.includes('/source-files')) {
    return jsonResponse({ id: 'sf-1' });
  }
  if (url.includes('/start')) {
    return new Response('', { status: 202 });
  }
  if (url.includes('/target-files/tf-1/versions/v1/download')) {
    return new Response('<html><body><main><div>Translated</div></main></body></html>', { status: 200 });
  }
  if (url.includes('/target-files')) {
    return jsonResponse({
      items: [{
        id: 'tf-1',
        latestVersion: { id: 'v1' },
        languageDirection: { targetLanguage: { languageCode: 'fr-FR' } },
        sourceFile: { id: 'sf-1' },
      }],
    });
  }
  return jsonResponse({});
}

function installFetch(handler = defaultHandler) {
  calls = [];
  origFetch = window.fetch;
  window.fetch = async (url, opts = {}) => {
    // corsFetch proxies through ?url=<encodeURIComponent(target)>, so
    // decode before substring-matching the real target path.
    const u = decodeURIComponent(url.toString());
    calls.push({ url: u, method: opts.method, headers: opts.headers, body: opts.body });
    return handler(u, opts);
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
    tenantId: 'tenant-1',
    apiEndpoint: API_ENDPOINT,
    ...overrides,
  };
}

describe('trados connector', () => {
  beforeEach(() => {
    sessionStorage.clear();
    installFetch();
  });

  afterEach(() => {
    restoreFetch();
    sessionStorage.clear();
  });

  describe('sendAllLanguages', () => {
    it('creates a project, uploads all urls, and starts it', async () => {
      const service = baseService({ site: 'send-ok' });
      const langs = [{ code: 'fr-FR', 'trados location': 'loc-1', 'trados project template': 'tmpl-1' }];
      const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
      const messages = [];
      const saved = [];
      const actions = {
        sendMessage: (m) => messages.push(m),
        saveState: async (s) => saved.push(s),
      };

      await sendAllLanguages({
        title: 'My Project', service, options: {}, langs, urls, actions,
      });

      expect(langs[0].translation.status).to.equal('created');
      expect(langs[0].translation.projectId).to.equal('proj-1');
      expect(langs[0].translation.sent).to.equal(1);
      expect(saved).to.have.length(1);
      expect(messages[messages.length - 1]).to.equal(undefined);
    });

    it('marks the language as error and surfaces a message when a file fails to upload', async () => {
      installFetch((url, opts) => {
        if (url.includes('/source-files')) return new Response('', { status: 404 });
        return defaultHandler(url, opts);
      });

      const service = baseService({ site: 'send-upload-fail' });
      const langs = [{ code: 'fr-FR', 'trados location': 'loc-1', 'trados project template': 'tmpl-1' }];
      const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
      const messages = [];
      const actions = { sendMessage: (m) => messages.push(m), saveState: async () => {} };

      await sendAllLanguages({
        title: 'My Project', service, options: {}, langs, urls, actions,
      });

      expect(langs[0].translation.status).to.equal('error');
      expect(langs[0].translation.sent).to.equal(0);
      const errorMessage = messages.find((m) => m.type === 'error' && m.text.includes('/page'));
      expect(errorMessage, 'upload error message').to.exist;
    });

    it('recovers from a 401 on project creation by forcing a fresh login and retrying', async () => {
      let loginCalls = 0;
      let projectPostCalls = 0;
      installFetch((url, opts) => {
        if (url.includes('/integrations/trados/login')) {
          loginCalls += 1;
          return jsonResponse({ access_token: `trados-token-${loginCalls}`, expires_in: 3600 });
        }
        if (url.endsWith('/projects') && opts.method === 'POST') {
          projectPostCalls += 1;
          if (opts.headers.Authorization !== 'Bearer trados-token-2') return new Response('', { status: 401 });
          return jsonResponse({ id: 'proj-1' });
        }
        return defaultHandler(url, opts);
      });

      const service = baseService({ site: 'send-401-recover' });
      const langs = [{ code: 'fr-FR', 'trados location': 'loc-1', 'trados project template': 'tmpl-1' }];
      const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await sendAllLanguages({
        title: 'My Project', service, options: {}, langs, urls, actions,
      });

      expect(projectPostCalls).to.equal(2);
      expect(loginCalls).to.equal(2); // initial login + forced re-login on 401
      expect(langs[0].translation.projectId).to.equal('proj-1');
    });
  });

  describe('saveItems', () => {
    it('downloads and saves translated content', async () => {
      const saved = [];
      const url = { daBasePath: '/page', sourceFileId: 'sf-1' };
      const lang = { code: 'fr-FR', translation: { projectId: 'proj-1' } };

      await saveItems({
        org: 'acme',
        site: 'site1',
        service: baseService(),
        lang,
        urls: [url],
        saveFn: async (u) => { saved.push(u); u.status = 'success'; },
        sendMessage: () => {},
      });

      expect(saved).to.have.length(1);
      expect(url.sourceContent).to.include('Translated');
    });

    it('paginates the target-files fetch instead of only reading the first page', async () => {
      // The real target-file for sf-1 deliberately lands past the first
      // page's limit, so this only passes if saveItems actually fetches
      // subsequent pages instead of only reading the first.
      const fillerFiles = Array.from({ length: 100 }, (_, i) => ({
        id: `filler-${i}`,
        latestVersion: { id: 'v-filler' },
        languageDirection: { targetLanguage: { languageCode: 'fr-FR' } },
        sourceFile: { id: `filler-source-${i}` },
      }));
      const realTargetFile = {
        id: 'tf-1',
        latestVersion: { id: 'v1' },
        languageDirection: { targetLanguage: { languageCode: 'fr-FR' } },
        sourceFile: { id: 'sf-1' },
      };
      const allTargetFiles = [...fillerFiles, realTargetFile];

      installFetch((url) => {
        if (url.includes('/integrations/trados/login')) {
          return jsonResponse({ access_token: 'trados-token', expires_in: 3600 });
        }
        if (url.includes('/target-files/tf-1/versions/v1/download')) {
          return new Response('<html><body><main><div>Translated</div></main></body></html>', { status: 200 });
        }
        if (url.includes('/target-files')) {
          const skip = Number(url.match(/skip=(\d+)/)?.[1] ?? 0);
          const top = Number(url.match(/top=(\d+)/)?.[1] ?? 100);
          const page = allTargetFiles.slice(skip, skip + top);
          return jsonResponse({ items: page, itemCount: allTargetFiles.length });
        }
        return jsonResponse({});
      });

      const saved = [];
      const url = { daBasePath: '/page', sourceFileId: 'sf-1' };
      const lang = { code: 'fr-FR', translation: { projectId: 'proj-1' } };

      await saveItems({
        org: 'acme',
        site: 'site1',
        service: baseService(),
        lang,
        urls: [url],
        saveFn: async (u) => { saved.push(u); u.status = 'success'; },
        sendMessage: () => {},
      });

      expect(saved).to.have.length(1);
      expect(url.sourceContent).to.include('Translated');
    });

    it('surfaces an error and returns urls unchanged when the target-files fetch fails', async () => {
      installFetch((url, opts) => {
        if (url.includes('/target-files') && !url.includes('/versions/')) return new Response('', { status: 404 });
        return defaultHandler(url, opts);
      });

      const urls = [{ daBasePath: '/page', sourceFileId: 'sf-1' }];
      const lang = { code: 'fr-FR', translation: { projectId: 'proj-1' } };
      const messages = [];

      const result = await saveItems({
        org: 'acme',
        site: 'site1',
        service: baseService(),
        lang,
        urls,
        saveFn: async () => {},
        sendMessage: (m) => messages.push(m),
      });

      expect(result).to.equal(urls);
      const errorMessage = messages.find((m) => m.type === 'error');
      expect(errorMessage.text).to.equal('Fetching Trados target files failed.');
    });

    it('surfaces an error and marks the url as error when no target file is found', async () => {
      const url = { daBasePath: '/page', sourceFileId: 'unknown-source-id' };
      const lang = { code: 'fr-FR', translation: { projectId: 'proj-1' } };
      const messages = [];

      const result = await saveItems({
        org: 'acme',
        site: 'site1',
        service: baseService(),
        lang,
        urls: [url],
        saveFn: async () => {},
        sendMessage: (m) => messages.push(m),
      });

      expect(result[0].status).to.equal('error');
      const errorMessage = messages.find((m) => m.type === 'error');
      expect(errorMessage.text).to.equal('No Trados target file found for /page.');
    });

    it('surfaces an error and marks the url as error when the download fails', async () => {
      installFetch((url, opts) => {
        if (url.includes('/target-files/tf-1/versions/v1/download')) return new Response('', { status: 404 });
        return defaultHandler(url, opts);
      });

      const url = { daBasePath: '/page', sourceFileId: 'sf-1' };
      const lang = { code: 'fr-FR', translation: { projectId: 'proj-1' } };
      const messages = [];

      const result = await saveItems({
        org: 'acme',
        site: 'site1',
        service: baseService(),
        lang,
        urls: [url],
        saveFn: async (u) => { u.status = 'success'; },
        sendMessage: (m) => messages.push(m),
      });

      expect(result[0].status).to.equal('error');
      const errorMessage = messages.find((m) => m.type === 'error');
      expect(errorMessage.text).to.include('Download failed for /page');
    });

    it('recovers from a 401 on download by forcing a fresh login and retrying', async () => {
      let loginCalls = 0;
      installFetch((url, opts) => {
        if (url.includes('/integrations/trados/login')) {
          loginCalls += 1;
          return jsonResponse({ access_token: `trados-token-${loginCalls}`, expires_in: 3600 });
        }
        if (url.includes('/target-files/tf-1/versions/v1/download')) {
          if (opts.headers.Authorization !== 'Bearer trados-token-2') return new Response('', { status: 401 });
          return new Response('<html><body><main><div>Translated</div></main></body></html>', { status: 200 });
        }
        return defaultHandler(url, opts);
      });

      const url = { daBasePath: '/page', sourceFileId: 'sf-1' };
      const lang = { code: 'fr-FR', translation: { projectId: 'proj-1' } };

      const result = await saveItems({
        org: 'acme',
        site: 'site1',
        service: baseService(),
        lang,
        urls: [url],
        saveFn: async (u) => { u.status = 'success'; },
        sendMessage: () => {},
      });

      expect(loginCalls).to.equal(2); // initial login + forced re-login on 401
      expect(result[0].status).to.equal('success');
    });

    it('returns the urls unchanged when the lang has no projectId', async () => {
      const urls = [{ daBasePath: '/page' }];
      const lang = { code: 'fr-FR' };

      const result = await saveItems({
        org: 'acme', site: 'site1', service: baseService(), lang, urls, saveFn: async () => {},
      });

      expect(result).to.equal(urls);
    });
  });
});
