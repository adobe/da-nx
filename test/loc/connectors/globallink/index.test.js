import { expect } from '@esm-bundle/chai';
import {
  connect, isConnected, sendAllLanguages, getStatusAll, saveItems, cancelTranslation,
} from '../../../../nx/blocks/loc/connectors/globallink/index.js';
import { DA_TRANSLATE } from '../../../../nx2/utils/utils.js';
import { unzipSync } from '../../../../nx2/deps/fflate/dist/index.js';

const org = 'acme';
const site = 'site1';
const proxyOrigin = `${DA_TRANSLATE}/translate/globallink/${org}/${site}`;
// DA_ETC resolves to undefined in this test env - auth.js falls back to this origin.
const loginUrl = `https://da-etc.adobeaem.workers.dev/${org}/sites/${site}/integrations/globallink/login?env=prod`;

let calls;
let origFetch;

function baseService(overrides = {}) {
  return {
    org,
    site,
    projectId: 'proj-1',
    fileFormatName: 'HTML',
    endpoint: 'https://real-globallink.example.com',
    ...overrides,
  };
}

// expires_in omitted so the cached token is always treated as expired (see auth.js's
// TOKEN_BUFFER_MS subtraction) - forces a fresh login call on every test.
function loginResponse(accessToken = 'gl-token') {
  return new Response(JSON.stringify({ access_token: accessToken }), { status: 200 });
}

function defaultHandler(u) {
  if (u.includes('/integrations/globallink/login')) return loginResponse();
  if (u.includes('/rest/v0/submissions/create')) {
    return new Response(JSON.stringify({ submissionId: 'sub-1' }), { status: 200 });
  }
  if (u.includes('/upload/source')) {
    return new Response(JSON.stringify({
      documentIds: [{ name: 'page.html', documentId: 'doc-1', submissionId: 'sub-1' }],
    }), { status: 200 });
  }
  if (u.endsWith('/status')) {
    return new Response(JSON.stringify({ status: 'READY' }), { status: 200 });
  }
  if (u.endsWith('/save')) {
    return new Response(JSON.stringify({ startedSubmissionIds: ['sub-1'] }), { status: 200 });
  }
  if (u.includes('/download/deliverable')) {
    return new Response('translated content', { status: 200 });
  }
  if (u.includes('/download')) {
    return new Response(JSON.stringify({ downloadId: 'dl-1', processingFinished: true }), { status: 200 });
  }
  if (u.includes('/rest/v0/targets')) {
    return new Response(JSON.stringify({ targets: [] }), { status: 200 });
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

describe('globallink connector', () => {
  beforeEach(() => {
    localStorage.clear();
    installFetch();
  });
  afterEach(() => {
    restoreFetch();
    localStorage.clear();
  });

  describe('isConnected / connect', () => {
    it('resolves true when the da-etc login succeeds', async () => {
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
  });

  describe('401 recovery', () => {
    it('recovers from a stale cached token by forcing a fresh login and retrying once', async () => {
      let loginCalls = 0;
      installFetch((u, opts) => {
        if (u.includes('/integrations/globallink/login')) {
          loginCalls += 1;
          const accessToken = loginCalls === 1 ? 'stale-token' : 'fresh-token';
          const body = JSON.stringify({ access_token: accessToken, expires_in: 3600 });
          return new Response(body, { status: 200 });
        }
        if (u.includes('/rest/v0/submissions/create')) {
          if (opts.headers.Authorization !== 'Bearer fresh-token') return new Response('', { status: 401 });
          return new Response(JSON.stringify({ submissionId: 'sub-1' }), { status: 200 });
        }
        return defaultHandler(u);
      });

      const service = baseService();
      const options = { service };
      const langs = [{ name: 'French', code: 'fr-FR' }];
      const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await sendAllLanguages({
        title: 't', service, options, langs, urls, actions,
      });

      expect(loginCalls).to.equal(2);
      expect(langs[0].translation.status).to.equal('created');
      const createCalls = calls.filter((c) => c.url.includes('/rest/v0/submissions/create'));
      expect(createCalls).to.have.length(2);
    });

    it('gives up without looping when the retried request also 401s', async () => {
      installFetch((u) => {
        if (u.includes('/integrations/globallink/login')) {
          return new Response(JSON.stringify({ access_token: 'still-bad-token', expires_in: 3600 }), { status: 200 });
        }
        if (u.includes('/rest/v0/submissions/create')) return new Response('', { status: 401 });
        return defaultHandler(u);
      });

      const service = baseService();
      const options = { service };
      const langs = [{ name: 'French', code: 'fr-FR' }];
      const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await sendAllLanguages({
        title: 't', service, options, langs, urls, actions,
      });

      const createCalls = calls.filter((c) => c.url.includes('/rest/v0/submissions/create'));
      expect(createCalls).to.have.length(2);
      expect(langs[0].translation.status).to.equal('error');
    });
  });

  describe('sendAllLanguages', () => {
    it('creates a submission, uploads sources, and marks langs created', async () => {
      const service = baseService();
      const options = { service };
      const langs = [{ name: 'French', code: 'fr-FR' }];
      const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await sendAllLanguages({
        title: 'My Project', service, options, langs, urls, actions,
      });

      expect(calls.some((c) => c.url === `${proxyOrigin}/rest/v0/submissions/create`)).to.equal(true);
      expect(calls.some((c) => c.url === `${proxyOrigin}/rest/v0/submissions/sub-1/upload/source`)).to.equal(true);
      expect(langs[0].translation.status).to.equal('created');
      expect(langs[0].translation.sent).to.equal(1);
      expect(service.submissionId.value).to.equal('sub-1');
      expect(JSON.parse(service.documentIds.value)).to.deep.equal({ '/page': 'doc-1' });
    });

    it('marks every lang error and makes no submission calls when not connected', async () => {
      installFetch(() => new Response('', { status: 401 }));
      const service = baseService();
      const options = { service };
      const langs = [{ name: 'French', code: 'fr-FR' }];
      const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
      const messages = [];
      const actions = { sendMessage: (m) => messages.push(m), saveState: async () => {} };

      await sendAllLanguages({
        title: 't', service, options, langs, urls, actions,
      });

      expect(langs[0].translation.status).to.equal('error');
      const errorMessage = messages.find((m) => m.type === 'error');
      expect(errorMessage.text).to.equal('Not connected to GlobalLink.');
      expect(calls.some((c) => c.url.includes('/rest/v0/submissions/create'))).to.equal(false);
    });

    it('errors when projectId or fileFormatName is missing', async () => {
      const service = baseService({ fileFormatName: undefined });
      const options = { service };
      const langs = [{ name: 'French', code: 'fr-FR' }];
      const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
      const messages = [];
      const actions = { sendMessage: (m) => messages.push(m), saveState: async () => {} };

      await sendAllLanguages({
        title: 't', service, options, langs, urls, actions,
      });

      const errorMessage = messages.find((m) => m.type === 'error');
      expect(errorMessage.text).to.include('projectId and fileFormatName are required');
      expect(langs[0].translation.status).to.equal('error');
      expect(calls.some((c) => c.url.includes('/rest/v0/submissions/create'))).to.equal(false);
    });

    it('errors and stops when submission creation fails', async () => {
      installFetch((u) => {
        if (u.includes('/rest/v0/submissions/create')) return new Response('{}', { status: 400 });
        return defaultHandler(u);
      });
      const service = baseService();
      const options = { service };
      const langs = [{ name: 'French', code: 'fr-FR' }];
      const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
      const messages = [];
      const actions = { sendMessage: (m) => messages.push(m), saveState: async () => {} };

      await sendAllLanguages({
        title: 't', service, options, langs, urls, actions,
      });

      const errorMessage = messages.find((m) => m.type === 'error');
      expect(errorMessage.text).to.equal('Failed to create GlobalLink submission.');
      expect(calls.some((c) => c.url.includes('/upload/source'))).to.equal(false);
    });

    it('aborts and reports partial upload when not all files are accepted', async () => {
      installFetch((u) => {
        if (u.includes('/upload/source')) {
          return new Response(JSON.stringify({
            documentIds: [{ name: 'page-1.html', documentId: 'doc-1', submissionId: 'sub-1' }],
          }), { status: 200 });
        }
        return defaultHandler(u);
      });
      const service = baseService();
      const options = { service };
      const langs = [{ name: 'French', code: 'fr-FR' }];
      const urls = [
        { daBasePath: '/page-1', content: '<p>1</p>' },
        { daBasePath: '/page-2', content: '<p>2</p>' },
      ];
      const messages = [];
      let saveStateCalled = false;
      const actions = {
        sendMessage: (m) => messages.push(m),
        saveState: async () => { saveStateCalled = true; },
      };

      await sendAllLanguages({
        title: 't', service, options, langs, urls, actions,
      });

      const errorMessage = messages.find((m) => m.type === 'error' && m.text.includes('aborting save'));
      expect(errorMessage.text).to.equal('Uploaded 1/2 items — aborting save.');
      expect(langs[0].translation.status).to.equal('error');
      expect(langs[0].translation.sent).to.equal(1);
      expect(saveStateCalled).to.equal(true);
      expect(calls.some((c) => c.url.endsWith('/save'))).to.equal(false);
    });

    it('warns when GlobalLink splits the upload into an overflow submission', async () => {
      installFetch((u) => {
        if (u.includes('/upload/source')) {
          return new Response(JSON.stringify({
            documentIds: [
              { name: 'page-1.html', documentId: 'doc-1', submissionId: 'sub-1' },
              { name: 'page-2.html', documentId: 'doc-2', submissionId: 'sub-2' },
            ],
          }), { status: 200 });
        }
        return defaultHandler(u);
      });
      const service = baseService();
      const options = { service };
      const langs = [{ name: 'French', code: 'fr-FR' }];
      const urls = [
        { daBasePath: '/page-1', content: '<p>1</p>' },
        { daBasePath: '/page-2', content: '<p>2</p>' },
      ];
      const messages = [];
      const actions = { sendMessage: (m) => messages.push(m), saveState: async () => {} };

      await sendAllLanguages({
        title: 't', service, options, langs, urls, actions,
      });

      const errorMessage = messages.find((m) => m.type === 'error' && m.text.includes('split'));
      expect(errorMessage.text).to.include('sub-2');
      expect(langs[0].translation.status).to.equal('created');
    });

    it('errors with GlobalLink\'s detail when save/autostart does not report the submission started', async () => {
      installFetch((u) => {
        if (u.endsWith('/save')) {
          return new Response(JSON.stringify({
            startedSubmissionIds: [],
            messages: ['Missing mandatory field Custom_Mandatory'],
          }), { status: 200 });
        }
        return defaultHandler(u);
      });
      const service = baseService();
      const options = { service };
      const langs = [{ name: 'French', code: 'fr-FR' }];
      const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
      const messages = [];
      const actions = { sendMessage: (m) => messages.push(m), saveState: async () => {} };

      await sendAllLanguages({
        title: 't', service, options, langs, urls, actions,
      });

      const errorMessage = messages.find((m) => m.type === 'error');
      expect(errorMessage.text).to.equal(
        'Failed to save/start GlobalLink submission. Missing mandatory field Custom_Mandatory',
      );
      expect(langs[0].translation.status).to.equal('error');
    });

    it('does not let two DA paths collide into the same uploaded file name', async () => {
      let uploadedFiles;
      installFetch(async (u, opts) => {
        if (u.includes('/upload/source')) {
          const zipBlob = opts.body.get('file');
          const buf = new Uint8Array(await zipBlob.arrayBuffer());
          uploadedFiles = unzipSync(buf);
          const documentIds = Object.keys(uploadedFiles).map((name, i) => (
            { name, documentId: `doc-${i}`, submissionId: 'sub-1' }
          ));
          return new Response(JSON.stringify({ documentIds }), { status: 200 });
        }
        return defaultHandler(u);
      });
      const service = baseService();
      const options = { service };
      const langs = [{ name: 'French', code: 'fr-FR' }];
      const urls = [
        { daBasePath: '/blog/post-1', content: '<p>a</p>' },
        { daBasePath: '/blog_post-1', content: '<p>b</p>' },
      ];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await sendAllLanguages({
        title: 't', service, options, langs, urls, actions,
      });

      expect(Object.keys(uploadedFiles)).to.have.length(2);
      expect(langs[0].translation.sent).to.equal(2);
    });
  });

  describe('getStatusAll', () => {
    it('errors when no submissionId has been persisted yet', async () => {
      const service = baseService();
      const messages = [];
      const actions = { sendMessage: (m) => messages.push(m), saveState: async () => {} };

      await getStatusAll({
        service, langs: [], urls: [], actions,
      });

      expect(messages[0].text).to.equal('No GlobalLink submissionId found for this project.');
      expect(calls.length).to.equal(0);
    });

    it('errors when not connected', async () => {
      installFetch(() => new Response('', { status: 401 }));
      const service = baseService({ submissionId: { value: 'sub-1' } });
      const messages = [];
      const actions = { sendMessage: (m) => messages.push(m), saveState: async () => {} };

      await getStatusAll({
        service, langs: [], urls: [], actions,
      });

      const errorMessage = messages.find((m) => m.type === 'error');
      expect(errorMessage.text).to.equal('Not connected to GlobalLink.');
    });

    it('marks a lang translated once every matched target is processed', async () => {
      installFetch((u) => {
        if (u.includes('/rest/v0/targets')) {
          return new Response(JSON.stringify({
            targets: [{ documentId: 'doc-1', targetLanguage: 'fr-FR', targetStatus: 'PROCESSED' }],
          }), { status: 200 });
        }
        return defaultHandler(u);
      });
      const service = baseService({
        submissionId: { value: 'sub-1' },
        documentIds: { value: JSON.stringify({ '/page': 'doc-1' }) },
      });
      const langs = [{ code: 'fr-FR', translation: { translated: 0 } }];
      const urls = [{ daBasePath: '/page' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await getStatusAll({
        service, langs, urls, actions,
      });

      expect(langs[0].translation.status).to.equal('translated');
      expect(langs[0].translation.translated).to.equal(1);
    });

    it('marks a lang cancelled when every matched target was cancelled', async () => {
      installFetch((u) => {
        if (u.includes('/rest/v0/targets')) {
          return new Response(JSON.stringify({
            targets: [{ documentId: 'doc-1', targetLanguage: 'fr-FR', targetStatus: 'CANCELLED' }],
          }), { status: 200 });
        }
        return defaultHandler(u);
      });
      const service = baseService({
        submissionId: { value: 'sub-1' },
        documentIds: { value: JSON.stringify({ '/page': 'doc-1' }) },
      });
      const langs = [{ code: 'fr-FR', translation: { translated: 0 } }];
      const urls = [{ daBasePath: '/page' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await getStatusAll({
        service, langs, urls, actions,
      });

      expect(langs[0].translation.status).to.equal('cancelled');
    });

    it('ignores a target whose documentId is not in the persisted map', async () => {
      installFetch((u) => {
        if (u.includes('/rest/v0/targets')) {
          return new Response(JSON.stringify({
            targets: [{ documentId: 'doc-999', targetLanguage: 'fr-FR', targetStatus: 'PROCESSED' }],
          }), { status: 200 });
        }
        return defaultHandler(u);
      });
      const service = baseService({
        submissionId: { value: 'sub-1' },
        documentIds: { value: JSON.stringify({ '/page': 'doc-1' }) },
      });
      const langs = [{ code: 'fr-FR', translation: { translated: 0 } }];
      const urls = [{ daBasePath: '/page' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await getStatusAll({
        service, langs, urls, actions,
      });

      expect(langs[0].translation.translated).to.equal(0);
      expect(langs[0].translation.status).to.equal(undefined);
    });

    it('pages through more than one page of targets', async () => {
      const totalTargets = 201;
      const documentIdsByPath = {};
      const urls = [];
      for (let i = 0; i < totalTargets; i += 1) {
        documentIdsByPath[`/page-${i}`] = `doc-${i}`;
        urls.push({ daBasePath: `/page-${i}` });
      }

      const pageRequests = [];
      installFetch((u) => {
        if (u.includes('/rest/v0/targets')) {
          const pageNumber = Number(new URL(u).searchParams.get('pageNumber'));
          pageRequests.push(pageNumber);
          const start = pageNumber * 200;
          const end = Math.min(start + 200, totalTargets);
          const targets = [];
          for (let i = start; i < end; i += 1) {
            targets.push({ documentId: `doc-${i}`, targetLanguage: 'fr-FR', targetStatus: 'PROCESSED' });
          }
          return new Response(JSON.stringify({ targets }), { status: 200 });
        }
        return defaultHandler(u);
      });

      const service = baseService({
        submissionId: { value: 'sub-1' },
        documentIds: { value: JSON.stringify(documentIdsByPath) },
      });
      const langs = [{ code: 'fr-FR', translation: { translated: 0 } }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await getStatusAll({
        service, langs, urls, actions,
      });

      expect(pageRequests).to.deep.equal([0, 1]);
      expect(langs[0].translation.translated).to.equal(totalTargets);
      expect(langs[0].translation.status).to.equal('translated');
    });
  });

  describe('saveItems', () => {
    it('returns urls unchanged when there is no submissionId', async () => {
      const service = baseService();
      const urls = [{ daBasePath: '/page', ext: 'html' }];

      const result = await saveItems({
        org, site, service, lang: { code: 'fr-FR', name: 'French' }, urls, saveFn: async () => {}, sendMessage: () => {},
      });

      expect(result).to.equal(urls);
      expect(calls.length).to.equal(0);
    });

    it('returns urls unchanged when not connected', async () => {
      installFetch(() => new Response('', { status: 401 }));
      const service = baseService({ submissionId: { value: 'sub-1' } });
      const urls = [{ daBasePath: '/page', ext: 'html' }];

      const result = await saveItems({
        org, site, service, lang: { code: 'fr-FR', name: 'French' }, urls, saveFn: async () => {}, sendMessage: () => {},
      });

      expect(result).to.equal(urls);
    });

    it('errors and returns urls when deliverables are not yet ready', async () => {
      installFetch((u) => {
        if (u.includes('/download') && !u.includes('/download/deliverable')) {
          return new Response(
            JSON.stringify({ downloadId: null, processingFinished: false }),
            { status: 200 },
          );
        }
        return defaultHandler(u);
      });
      const service = baseService({ submissionId: { value: 'sub-1' } });
      const urls = [{ daBasePath: '/page', ext: 'html' }];
      const messages = [];

      const result = await saveItems({
        org,
        site,
        service,
        lang: { code: 'fr-FR', name: 'French' },
        urls,
        saveFn: async () => {},
        sendMessage: (m) => messages.push(m),
      });

      expect(result).to.equal(urls);
      const errorMessage = messages.find((m) => m.type === 'error');
      expect(errorMessage.text).to.include('are not ready yet');
    });

    it('downloads processed deliverables, saves them, and marks targets delivered', async () => {
      let deliveredBody;
      installFetch((u, opts) => {
        if (u.includes('/rest/v0/targets')) {
          return new Response(JSON.stringify({
            targets: [{
              targetId: 'target-1', documentId: 'doc-1', targetLanguage: 'fr-FR', targetStatus: 'PROCESSED',
            }],
          }), { status: 200 });
        }
        if (u.includes('/targets/delivered')) {
          deliveredBody = JSON.parse(opts.body);
          return new Response('{}', { status: 200 });
        }
        return defaultHandler(u);
      });
      const service = baseService({
        submissionId: { value: 'sub-1' },
        documentIds: { value: JSON.stringify({ '/page': 'doc-1' }) },
      });
      const urls = [{ daBasePath: '/page', ext: 'html' }];
      const saveFn = async (url) => { url.status = 'success'; };

      const result = await saveItems({
        org, site, service, lang: { code: 'fr-FR', name: 'French' }, urls, saveFn, sendMessage: () => {},
      });

      expect(result[0].status).to.equal('success');
      expect(result[0].sourceContent).to.be.a('string');
      expect(deliveredBody.targetIds).to.deep.equal(['target-1']);
    });

    it('marks a url errored when it cannot be matched to any target', async () => {
      installFetch((u) => {
        if (u.includes('/rest/v0/targets')) {
          return new Response(JSON.stringify({
            targets: [{
              targetId: 'target-1', documentId: 'doc-1', targetLanguage: 'fr-FR', targetStatus: 'PROCESSED',
            }],
          }), { status: 200 });
        }
        return defaultHandler(u);
      });
      // No documentIds map persisted on the service, so matchUrl can't resolve anything.
      const service = baseService({ submissionId: { value: 'sub-1' } });
      const urls = [{ daBasePath: '/page', ext: 'html' }];
      const saveFn = async (url) => { url.status = 'success'; };

      const result = await saveItems({
        org, site, service, lang: { code: 'fr-FR', name: 'French' }, urls, saveFn, sendMessage: () => {},
      });

      expect(result[0].status).to.equal('error');
    });

    it('marks a url errored when the deliverable download fails', async () => {
      installFetch((u) => {
        if (u.includes('/rest/v0/targets')) {
          return new Response(JSON.stringify({
            targets: [{
              targetId: 'target-1', documentId: 'doc-1', targetLanguage: 'fr-FR', targetStatus: 'PROCESSED',
            }],
          }), { status: 200 });
        }
        if (u.includes('/download/deliverable')) return new Response('', { status: 404 });
        return defaultHandler(u);
      });
      const service = baseService({
        submissionId: { value: 'sub-1' },
        documentIds: { value: JSON.stringify({ '/page': 'doc-1' }) },
      });
      const urls = [{ daBasePath: '/page', ext: 'html' }];
      const saveFn = async (url) => { url.status = 'success'; };

      const result = await saveItems({
        org, site, service, lang: { code: 'fr-FR', name: 'French' }, urls, saveFn, sendMessage: () => {},
      });

      expect(result[0].status).to.equal('error');
    });
  });

  describe('cancelTranslation', () => {
    it('skips when there is no submission to cancel', async () => {
      const service = baseService();
      const messages = [];

      const result = await cancelTranslation({
        service, lang: { code: 'fr-FR', name: 'French' }, sendMessage: (m) => messages.push(m),
      });

      expect(result).to.deep.equal({ ok: true, skipped: true });
      expect(messages[0].text).to.include('No GlobalLink submission to cancel');
    });

    it('fails when not connected', async () => {
      installFetch(() => new Response('', { status: 401 }));
      const service = baseService({ submissionId: { value: 'sub-1' } });
      const messages = [];

      const result = await cancelTranslation({
        service, lang: { code: 'fr-FR', name: 'French' }, sendMessage: (m) => messages.push(m),
      });

      expect(result).to.deep.equal({ ok: false });
    });

    it('skips when there are no targets to cancel for the language', async () => {
      installFetch((u) => {
        if (u.includes('/rest/v0/targets')) {
          return new Response(JSON.stringify({
            targets: [{ targetId: 'target-1', targetLanguage: 'de-DE' }],
          }), { status: 200 });
        }
        return defaultHandler(u);
      });
      const service = baseService({ submissionId: { value: 'sub-1' } });
      const messages = [];

      const result = await cancelTranslation({
        service, lang: { code: 'fr-FR', name: 'French' }, sendMessage: (m) => messages.push(m),
      });

      expect(result).to.deep.equal({ ok: true, skipped: true });
      expect(messages[0].text).to.include('No GlobalLink targets found to cancel');
    });

    it('cancels only the targets for the given language', async () => {
      let cancelBody;
      installFetch((u, opts) => {
        if (u.includes('/rest/v0/targets')) {
          return new Response(JSON.stringify({
            targets: [
              { targetId: 'target-fr', targetLanguage: 'fr-FR' },
              { targetId: 'target-de', targetLanguage: 'de-DE' },
            ],
          }), { status: 200 });
        }
        if (u.includes('/submissions/cancel/')) {
          cancelBody = JSON.parse(opts.body);
          return new Response('{}', { status: 200 });
        }
        return defaultHandler(u);
      });
      const service = baseService({ submissionId: { value: 'sub-1' } });

      const result = await cancelTranslation({
        service, lang: { code: 'fr-FR', name: 'French' }, sendMessage: () => {},
      });

      expect(result).to.deep.equal({ ok: true });
      expect(cancelBody.targetIds).to.deep.equal(['target-fr']);
    });

    it('surfaces an error message when the cancel request fails', async () => {
      installFetch((u) => {
        if (u.includes('/rest/v0/targets')) {
          return new Response(JSON.stringify({
            targets: [{ targetId: 'target-fr', targetLanguage: 'fr-FR' }],
          }), { status: 200 });
        }
        if (u.includes('/submissions/cancel/')) {
          return new Response(JSON.stringify({ messages: ['Targets already in progress'] }), { status: 400 });
        }
        return defaultHandler(u);
      });
      const service = baseService({ submissionId: { value: 'sub-1' } });
      const messages = [];

      const result = await cancelTranslation({
        service, lang: { code: 'fr-FR', name: 'French' }, sendMessage: (m) => messages.push(m),
      });

      expect(result).to.deep.equal({ ok: false });
      const errorMessage = messages.find((m) => m.type === 'error');
      expect(errorMessage.text).to.include('Targets already in progress');
    });
  });
});
