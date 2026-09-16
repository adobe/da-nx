import { expect } from '@esm-bundle/chai';
import {
  connect, isConnected, sendAllLanguages, getStatusAll, saveItems, cancelTranslation,
  listProjects, serviceOptions,
} from '../../../../nx/blocks/loc/connectors/globallink/index.js';
import { DA_TRANSLATE } from '../../../../nx2/utils/utils.js';
import { unzipSync } from '../../../../nx2/deps/fflate/dist/index.js';

// Dynamic-expression import (not a literal string) so @web/dev-server-import-maps
// does not rewrite this to ...?wds-import-map=0. See test/nx2/utils/api.test.js.
const imsPath = '../../../../nx2/utils/ims.js';
const { setMockIms, resetMockIms } = await import(imsPath);

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
    resetMockIms();
    sessionStorage.clear();
    installFetch();
  });
  afterEach(() => {
    restoreFetch();
    sessionStorage.clear();
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

    it('resolves false when there is no IMS session, even with a valid GlobalLink login', async () => {
      setMockIms({ anonymous: true });

      expect(await isConnected(baseService())).to.equal(false);
    });
  });

  describe('listProjects', () => {
    it('maps enabled projects to projectId/name and drops disabled ones', async () => {
      installFetch((u) => {
        if (u.includes('/rest/v0/projects')) {
          return new Response(JSON.stringify([
            { projectId: 1, name: 'Marketing Site', enabled: true, organizationId: 9 },
            { projectId: 2, name: 'Retired Project', enabled: false },
          ]), { status: 200 });
        }
        return defaultHandler(u);
      });

      const projects = await listProjects(baseService());

      expect(projects).to.deep.equal([{ projectId: '1', name: 'Marketing Site' }]);
    });

    it('treats a project without an explicit enabled flag as enabled', async () => {
      installFetch((u) => {
        if (u.includes('/rest/v0/projects')) {
          return new Response(JSON.stringify([{ projectId: 3, name: 'No Flag Project' }]), { status: 200 });
        }
        return defaultHandler(u);
      });

      const projects = await listProjects(baseService());

      expect(projects).to.deep.equal([{ projectId: '3', name: 'No Flag Project' }]);
    });

    it('falls back to a wrapped { projects } response shape', async () => {
      installFetch((u) => {
        if (u.includes('/rest/v0/projects')) {
          return new Response(JSON.stringify({ projects: [{ projectId: 4, name: 'Wrapped', enabled: true }] }), { status: 200 });
        }
        return defaultHandler(u);
      });

      const projects = await listProjects(baseService());

      expect(projects).to.deep.equal([{ projectId: '4', name: 'Wrapped' }]);
    });

    it('resolves an empty array when the request fails', async () => {
      // 400 (not 500) - a 500 would trigger fetchWithRetry's slow backoff/retry loop.
      installFetch((u) => {
        if (u.includes('/rest/v0/projects')) return new Response('', { status: 400 });
        return defaultHandler(u);
      });

      expect(await listProjects(baseService())).to.deep.equal([]);
    });
  });

  describe('serviceOptions', () => {
    it('exposes a projectId option whose fetch maps listProjects to {value, label}', async () => {
      installFetch((u) => {
        if (u.includes('/rest/v0/projects')) {
          return new Response(JSON.stringify([{ projectId: 1, name: 'Marketing Site', enabled: true }]), { status: 200 });
        }
        return defaultHandler(u);
      });

      const option = serviceOptions.find((o) => o.key === 'projectId');
      expect(option.label).to.equal('Project');

      const items = await option.fetch(baseService());
      expect(items).to.deep.equal([{ value: '1', label: 'Marketing Site' }]);
    });
  });

  describe('IMS auth', () => {
    it('sends the IMS bearer token as Authorization and the GlobalLink token as x-globallink-authorization', async () => {
      const service = baseService();
      const options = { service };
      const langs = [{ name: 'French', code: 'fr-FR' }];
      const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await sendAllLanguages({
        title: 't', service, options, langs, urls, actions,
      });

      const createCall = calls.find((c) => c.url.includes('/rest/v0/submissions/create'));
      expect(createCall.headers.Authorization).to.equal('Bearer test-token');
      expect(createCall.headers['x-globallink-authorization']).to.equal('Bearer gl-token');
    });

    it('does not call the submission-create proxy endpoint when there is no IMS session', async () => {
      setMockIms({ anonymous: true });
      const service = baseService();
      const options = { service };
      const langs = [{ name: 'French', code: 'fr-FR' }];
      const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
      const messages = [];
      const actions = { sendMessage: (m) => messages.push(m), saveState: async () => {} };

      await sendAllLanguages({
        title: 't', service, options, langs, urls, actions,
      });

      expect(calls.some((c) => c.url.includes('/rest/v0/submissions/create'))).to.equal(false);
      expect(langs[0].translation).to.be.undefined;
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
          if (opts.headers['x-globallink-authorization'] !== 'Bearer fresh-token') return new Response('', { status: 401 });
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
      expect(langs[0].translation).to.be.undefined;
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
      expect(JSON.parse(service.submissionIds.value)).to.deep.equal(['sub-1']);
      expect(JSON.parse(service.documentIds.value)).to.deep.equal({
        '/page': { documentId: 'doc-1', submissionId: 'sub-1' },
      });
    });

    it('sends translation.service.custom.* options as submission-create customAttributes', async () => {
      const service = baseService();
      const options = {
        service,
        'translation.service.custom.textarea.Custom_Mandatory': 'Some value',
        'translation.service.custom.dropdown.Custom_Priority': 'High',
      };
      const langs = [{ name: 'French', code: 'fr-FR' }];
      const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await sendAllLanguages({
        title: 'My Project', service, options, langs, urls, actions,
      });

      const createCall = calls.find((c) => c.url.includes('/rest/v0/submissions/create'));
      const body = JSON.parse(createCall.body);
      expect(body.customAttributes).to.deep.equal([
        { name: 'Custom_Mandatory', value: 'Some value' },
        { name: 'Custom_Priority', value: 'High' },
      ]);
    });

    it('omits empty, null, and undefined translation.service.custom.* values', async () => {
      const service = baseService();
      const options = {
        service,
        'translation.service.custom.textarea.Custom_Empty': '',
        'translation.service.custom.textarea.Custom_Null': null,
        'translation.service.custom.textarea.Custom_Undefined': undefined,
      };
      const langs = [{ name: 'French', code: 'fr-FR' }];
      const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await sendAllLanguages({
        title: 'My Project', service, options, langs, urls, actions,
      });

      const createCall = calls.find((c) => c.url.includes('/rest/v0/submissions/create'));
      const body = JSON.parse(createCall.body);
      expect(body.customAttributes).to.be.undefined;
    });

    it('marks no lang state and does not persist when not connected, so retry stays available', async () => {
      installFetch(() => new Response('', { status: 401 }));
      const service = baseService();
      const options = { service };
      const langs = [{ name: 'French', code: 'fr-FR' }];
      const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
      const messages = [];
      let saveStateCalled = false;
      const actions = {
        sendMessage: (m) => messages.push(m),
        saveState: async () => { saveStateCalled = true; },
      };

      await sendAllLanguages({
        title: 't', service, options, langs, urls, actions,
      });

      expect(langs[0].translation).to.be.undefined;
      const errorMessage = messages.find((m) => m.type === 'error');
      expect(errorMessage.text).to.equal('Not connected to GlobalLink.');
      expect(calls.some((c) => c.url.includes('/rest/v0/submissions/create'))).to.equal(false);
      expect(saveStateCalled).to.equal(false);
    });

    it('errors when projectId or fileFormatName is missing, without touching lang state', async () => {
      const service = baseService({ fileFormatName: undefined });
      const options = { service };
      const langs = [{ name: 'French', code: 'fr-FR' }];
      const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
      const messages = [];
      let saveStateCalled = false;
      const actions = {
        sendMessage: (m) => messages.push(m),
        saveState: async () => { saveStateCalled = true; },
      };

      await sendAllLanguages({
        title: 't', service, options, langs, urls, actions,
      });

      const errorMessage = messages.find((m) => m.type === 'error');
      expect(errorMessage.text).to.include('projectId and fileFormatName are required');
      expect(langs[0].translation).to.be.undefined;
      expect(calls.some((c) => c.url.includes('/rest/v0/submissions/create'))).to.equal(false);
      expect(saveStateCalled).to.equal(false);
    });

    it('errors and stops when submission creation fails, without touching lang state', async () => {
      installFetch((u) => {
        if (u.includes('/rest/v0/submissions/create')) return new Response('{}', { status: 400 });
        return defaultHandler(u);
      });
      const service = baseService();
      const options = { service };
      const langs = [{ name: 'French', code: 'fr-FR' }];
      const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
      const messages = [];
      let saveStateCalled = false;
      const actions = {
        sendMessage: (m) => messages.push(m),
        saveState: async () => { saveStateCalled = true; },
      };

      await sendAllLanguages({
        title: 't', service, options, langs, urls, actions,
      });

      const errorMessage = messages.find((m) => m.type === 'error');
      expect(errorMessage.text).to.equal('Failed to create GlobalLink submission.');
      expect(langs[0].translation).to.be.undefined;
      expect(calls.some((c) => c.url.includes('/upload/source'))).to.equal(false);
      expect(saveStateCalled).to.equal(false);
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

    it('tracks an overflow submission GlobalLink splits the upload into', async () => {
      installFetch((u) => {
        if (u.includes('/upload/source')) {
          return new Response(JSON.stringify({
            documentIds: [
              { name: 'page-1.html', documentId: 'doc-1', submissionId: 'sub-1' },
              { name: 'page-2.html', documentId: 'doc-2', submissionId: 'sub-2' },
            ],
          }), { status: 200 });
        }
        if (u.endsWith('/save')) {
          const [, submissionId] = u.match(/submissions\/([^/]+)\/save/);
          return new Response(
            JSON.stringify({ startedSubmissionIds: [submissionId] }),
            { status: 200 },
          );
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

      expect(langs[0].translation.status).to.equal('created');
      expect(JSON.parse(service.submissionIds.value)).to.deep.equal(['sub-1', 'sub-2']);
      expect(JSON.parse(service.documentIds.value)).to.deep.equal({
        '/page-1': { documentId: 'doc-1', submissionId: 'sub-1' },
        '/page-2': { documentId: 'doc-2', submissionId: 'sub-2' },
      });
      // Both submissions must be waited-on and saved/started, not just the primary one.
      expect(calls.some((c) => c.url === `${proxyOrigin}/rest/v0/submissions/sub-1/save`)).to.equal(true);
      expect(calls.some((c) => c.url === `${proxyOrigin}/rest/v0/submissions/sub-2/save`)).to.equal(true);

      // The multi-submission split is a GlobalLink-internal detail - no user-facing message.
      expect(messages.every((m) => m?.type !== 'error')).to.equal(true);
      expect(messages[messages.length - 1]).to.equal(undefined);
    });

    it('falls back to the requested submission id when a document omits its own', async () => {
      installFetch((u) => {
        if (u.includes('/upload/source')) {
          return new Response(JSON.stringify({
            documentIds: [{ name: 'page.html', documentId: 'doc-1' }],
          }), { status: 200 });
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

      expect(langs[0].translation.status).to.equal('created');
      expect(JSON.parse(service.submissionIds.value)).to.deep.equal(['sub-1']);
      expect(JSON.parse(service.documentIds.value)).to.deep.equal({
        '/page': { documentId: 'doc-1', submissionId: 'sub-1' },
      });
    });

    it('aborts and does not autostart when GlobalLink reports upload processing errored', async () => {
      installFetch((u) => {
        if (u.endsWith('/status')) {
          return new Response(JSON.stringify({ status: 'ERROR' }), { status: 200 });
        }
        return defaultHandler(u);
      });
      const service = baseService();
      const options = { service };
      const langs = [{ name: 'French', code: 'fr-FR' }];
      const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
      const messages = [];
      let saveStateCalled = false;
      const actions = {
        sendMessage: (m) => messages.push(m),
        saveState: async () => { saveStateCalled = true; },
      };

      await sendAllLanguages({
        title: 't', service, options, langs, urls, actions,
      });

      const errorMessage = messages.find((m) => m.type === 'error');
      expect(errorMessage.text).to.equal('Failed to process GlobalLink submission uploads.');
      expect(langs[0].translation.status).to.equal('error');
      expect(saveStateCalled).to.equal(true);
      expect(calls.some((c) => c.url.endsWith('/save'))).to.equal(false);
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

    it('errors with no trailing detail when the /save request itself fails', async () => {
      // 400 (not 500) - a 500 would trigger fetchWithRetry's slow backoff/retry loop.
      installFetch((u) => {
        if (u.endsWith('/save')) return new Response('', { status: 400 });
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
      expect(errorMessage.text).to.equal('Failed to save/start GlobalLink submission.');
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

    it('uploads every file in a batch spanning multiple chunk-yield boundaries', async () => {
      const total = 25;
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
      const urls = Array.from({ length: total }, (_, i) => ({ daBasePath: `/page-${i}`, content: `<p>${i}</p>` }));
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await sendAllLanguages({
        title: 't', service, options, langs, urls, actions,
      });

      expect(Object.keys(uploadedFiles)).to.have.length(total);
      expect(langs[0].translation.sent).to.equal(total);
      expect(langs[0].translation.status).to.equal('created');
    });

    it('stops polling for submission-ready status once the IMS session is lost mid-wait', async () => {
      installFetch((u) => {
        if (u.includes('/upload/source')) setMockIms({ anonymous: true });
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

      expect(calls.some((c) => c.url.endsWith('/status'))).to.equal(false);
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
      const service = baseService({ submissionIds: { value: JSON.stringify(['sub-1']) } });
      const langs = [{ code: 'fr-FR', translation: { status: 'created' } }];
      const messages = [];
      const actions = { sendMessage: (m) => messages.push(m), saveState: async () => {} };

      await getStatusAll({
        service, langs, urls: [], actions,
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
        submissionIds: { value: JSON.stringify(['sub-1']) },
        documentIds: { value: JSON.stringify({ '/page': { documentId: 'doc-1', submissionId: 'sub-1' } }) },
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
        submissionIds: { value: JSON.stringify(['sub-1']) },
        documentIds: { value: JSON.stringify({ '/page': { documentId: 'doc-1', submissionId: 'sub-1' } }) },
      });
      const langs = [{ code: 'fr-FR', translation: { translated: 0 } }];
      const urls = [{ daBasePath: '/page' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await getStatusAll({
        service, langs, urls, actions,
      });

      expect(langs[0].translation.status).to.equal('cancelled');
    });

    it('does not revert a lang already saved to DA back to "translated"', async () => {
      installFetch((u) => {
        if (u.includes('/rest/v0/targets')) {
          // GlobalLink keeps reporting a delivered target as processed indefinitely.
          return new Response(JSON.stringify({
            targets: [{ documentId: 'doc-1', targetLanguage: 'fr-FR', targetStatus: 'DELIVERED' }],
          }), { status: 200 });
        }
        return defaultHandler(u);
      });
      const service = baseService({
        submissionIds: { value: JSON.stringify(['sub-1']) },
        documentIds: { value: JSON.stringify({ '/page': { documentId: 'doc-1', submissionId: 'sub-1' } }) },
      });
      const langs = [{ code: 'fr-FR', translation: { translated: 1, status: 'complete', saved: 1 } }];
      const urls = [{ daBasePath: '/page' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await getStatusAll({
        service, langs, urls, actions,
      });

      expect(langs[0].translation.status).to.equal('complete');
      expect(calls.length).to.equal(0);
    });

    it('does not revert a cancelled lang back to "translated"', async () => {
      installFetch((u) => {
        if (u.includes('/rest/v0/targets')) {
          return new Response(JSON.stringify({
            targets: [{ documentId: 'doc-1', targetLanguage: 'fr-FR', targetStatus: 'PROCESSED' }],
          }), { status: 200 });
        }
        return defaultHandler(u);
      });
      const service = baseService({
        submissionIds: { value: JSON.stringify(['sub-1']) },
        documentIds: { value: JSON.stringify({ '/page': { documentId: 'doc-1', submissionId: 'sub-1' } }) },
      });
      const langs = [{ code: 'fr-FR', translation: { translated: 0, status: 'cancelled' } }];
      const urls = [{ daBasePath: '/page' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await getStatusAll({
        service, langs, urls, actions,
      });

      expect(langs[0].translation.status).to.equal('cancelled');
      expect(calls.length).to.equal(0);
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
        submissionIds: { value: JSON.stringify(['sub-1']) },
        documentIds: { value: JSON.stringify({ '/page': { documentId: 'doc-1', submissionId: 'sub-1' } }) },
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
        documentIdsByPath[`/page-${i}`] = { documentId: `doc-${i}`, submissionId: 'sub-1' };
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
        submissionIds: { value: JSON.stringify(['sub-1']) },
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

    it('checks status across every submission a project spans, not just the primary one', async () => {
      installFetch((u) => {
        if (u.includes('/rest/v0/targets')) {
          expect(new URL(u).searchParams.get('submissionIds')).to.equal('sub-1,sub-2');
          return new Response(JSON.stringify({
            targets: [
              { documentId: 'doc-1', targetLanguage: 'fr-FR', targetStatus: 'PROCESSED' },
              { documentId: 'doc-2', targetLanguage: 'fr-FR', targetStatus: 'PROCESSED' },
            ],
          }), { status: 200 });
        }
        return defaultHandler(u);
      });
      const service = baseService({
        submissionIds: { value: JSON.stringify(['sub-1', 'sub-2']) },
        documentIds: {
          value: JSON.stringify({
            '/page-1': { documentId: 'doc-1', submissionId: 'sub-1' },
            '/page-2': { documentId: 'doc-2', submissionId: 'sub-2' },
          }),
        },
      });
      const langs = [{ code: 'fr-FR', translation: { translated: 0 } }];
      const urls = [{ daBasePath: '/page-1' }, { daBasePath: '/page-2' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await getStatusAll({
        service, langs, urls, actions,
      });

      expect(langs[0].translation.translated).to.equal(2);
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
      const service = baseService({ submissionIds: { value: JSON.stringify(['sub-1']) } });
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
      const service = baseService({ submissionIds: { value: JSON.stringify(['sub-1']) } });
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

    it('stops waiting for deliverables without polling further once the IMS session is lost', async () => {
      installFetch((u) => {
        if (u.includes('/download') && !u.includes('/download/deliverable')) {
          setMockIms({ anonymous: true });
          return new Response(
            JSON.stringify({ downloadId: 'dl-1', processingFinished: false }),
            { status: 200 },
          );
        }
        return defaultHandler(u);
      });
      const service = baseService({ submissionIds: { value: JSON.stringify(['sub-1']) } });
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
      expect(calls.some((c) => c.url.includes('downloadId=dl-1'))).to.equal(false);
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
        submissionIds: { value: JSON.stringify(['sub-1']) },
        documentIds: { value: JSON.stringify({ '/page': { documentId: 'doc-1', submissionId: 'sub-1' } }) },
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

    it('resolves every url to a terminal status above the concurrency cap', async function test() {
      // downloadQueue's throttle dispatches one url per 250ms poll tick, so 8 urls
      // need 2s+ just to all start - past mocha's default 2000ms test timeout.
      this.timeout(5000);
      const total = 8;
      const documentIdsByPath = {};
      const targets = [];
      for (let i = 0; i < total; i += 1) {
        documentIdsByPath[`/page-${i}`] = { documentId: `doc-${i}`, submissionId: 'sub-1' };
        targets.push({
          targetId: `target-${i}`, documentId: `doc-${i}`, targetLanguage: 'fr-FR', targetStatus: 'PROCESSED',
        });
      }
      const deliveredIds = [];
      installFetch((u, opts) => {
        if (u.includes('/rest/v0/targets')) {
          return new Response(JSON.stringify({ targets }), { status: 200 });
        }
        if (u.includes('/targets/delivered')) {
          deliveredIds.push(...JSON.parse(opts.body).targetIds);
          return new Response('{}', { status: 200 });
        }
        return defaultHandler(u);
      });
      const service = baseService({
        submissionIds: { value: JSON.stringify(['sub-1']) },
        documentIds: { value: JSON.stringify(documentIdsByPath) },
      });
      const urls = Array.from({ length: total }, (_, i) => ({ daBasePath: `/page-${i}`, ext: 'html' }));
      const saveFn = async (url) => { url.status = 'success'; };

      const result = await saveItems({
        org, site, service, lang: { code: 'fr-FR', name: 'French' }, urls, saveFn, sendMessage: () => {},
      });

      expect(result).to.have.length(total);
      expect(result.every((url) => url.status === 'success')).to.equal(true);
      expect(deliveredIds.sort()).to.deep.equal(targets.map((t) => t.targetId).sort());
    });

    it('marks the url errored and surfaces an error when marking delivered fails', async () => {
      installFetch((u) => {
        if (u.includes('/rest/v0/targets')) {
          return new Response(JSON.stringify({
            targets: [{
              targetId: 'target-1', documentId: 'doc-1', targetLanguage: 'fr-FR', targetStatus: 'PROCESSED',
            }],
          }), { status: 200 });
        }
        if (u.includes('/targets/delivered')) {
          return new Response('', { status: 400 });
        }
        return defaultHandler(u);
      });
      const service = baseService({
        submissionIds: { value: JSON.stringify(['sub-1']) },
        documentIds: { value: JSON.stringify({ '/page': { documentId: 'doc-1', submissionId: 'sub-1' } }) },
      });
      const urls = [{ daBasePath: '/page', ext: 'html' }];
      const saveFn = async (url) => { url.status = 'success'; };
      const messages = [];

      const result = await saveItems({
        org, site, service, lang: { code: 'fr-FR', name: 'French' }, urls, saveFn, sendMessage: (m) => messages.push(m),
      });

      expect(result[0].status).to.equal('error');
      const errorMessage = messages.find((m) => m.type === 'error');
      expect(errorMessage.text).to.include('failed to mark it delivered');
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
      // No documentIds map persisted on the service, so the target can't be resolved.
      const service = baseService({ submissionIds: { value: JSON.stringify(['sub-1']) } });
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
        submissionIds: { value: JSON.stringify(['sub-1']) },
        documentIds: { value: JSON.stringify({ '/page': { documentId: 'doc-1', submissionId: 'sub-1' } }) },
      });
      const urls = [{ daBasePath: '/page', ext: 'html' }];
      const saveFn = async (url) => { url.status = 'success'; };

      const result = await saveItems({
        org, site, service, lang: { code: 'fr-FR', name: 'French' }, urls, saveFn, sendMessage: () => {},
      });

      expect(result[0].status).to.equal('error');
    });

    it('downloads and marks delivered against the correct submission when documents span more than one', async () => {
      const deliveredCalls = [];
      installFetch((u, opts) => {
        if (u.includes('/rest/v0/targets')) {
          expect(new URL(u).searchParams.get('submissionIds')).to.equal('sub-1,sub-2');
          return new Response(JSON.stringify({
            targets: [
              {
                targetId: 'target-1', documentId: 'doc-1', targetLanguage: 'fr-FR', targetStatus: 'PROCESSED',
              },
              {
                targetId: 'target-2', documentId: 'doc-2', targetLanguage: 'fr-FR', targetStatus: 'PROCESSED',
              },
            ],
          }), { status: 200 });
        }
        if (u.includes('/targets/delivered')) {
          deliveredCalls.push({ url: u, body: JSON.parse(opts.body) });
          return new Response('{}', { status: 200 });
        }
        return defaultHandler(u);
      });
      const service = baseService({
        submissionIds: { value: JSON.stringify(['sub-1', 'sub-2']) },
        documentIds: {
          value: JSON.stringify({
            '/page-1': { documentId: 'doc-1', submissionId: 'sub-1' },
            '/page-2': { documentId: 'doc-2', submissionId: 'sub-2' },
          }),
        },
      });
      const urls = [
        { daBasePath: '/page-1', ext: 'html' },
        { daBasePath: '/page-2', ext: 'html' },
      ];
      const saveFn = async (url) => { url.status = 'success'; };

      const result = await saveItems({
        org, site, service, lang: { code: 'fr-FR', name: 'French' }, urls, saveFn, sendMessage: () => {},
      });

      expect(result.every((url) => url.status === 'success')).to.equal(true);
      expect(calls.some(
        (c) => c.url === `${proxyOrigin}/rest/v0/submissions/sub-1/targets/target-1/download/deliverable`,
      )).to.equal(true);
      expect(calls.some(
        (c) => c.url === `${proxyOrigin}/rest/v0/submissions/sub-2/targets/target-2/download/deliverable`,
      )).to.equal(true);
      expect(deliveredCalls.find((c) => c.url.includes('sub-1')).body.targetIds).to.deep.equal(['target-1']);
      expect(deliveredCalls.find((c) => c.url.includes('sub-2')).body.targetIds).to.deep.equal(['target-2']);
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
      const service = baseService({ submissionIds: { value: JSON.stringify(['sub-1']) } });
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
      const service = baseService({ submissionIds: { value: JSON.stringify(['sub-1']) } });
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
      const service = baseService({ submissionIds: { value: JSON.stringify(['sub-1']) } });

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
      const service = baseService({ submissionIds: { value: JSON.stringify(['sub-1']) } });
      const messages = [];

      const result = await cancelTranslation({
        service, lang: { code: 'fr-FR', name: 'French' }, sendMessage: (m) => messages.push(m),
      });

      expect(result).to.deep.equal({ ok: false });
      const errorMessage = messages.find((m) => m.type === 'error');
      expect(errorMessage.text).to.include('Targets already in progress');
    });

    it('cancels targets on every submission a project spans, skipping ones with no matching targets', async () => {
      const cancelCalls = [];
      installFetch((u, opts) => {
        if (u.includes('/rest/v0/targets')) {
          const submissionIds = new URL(u).searchParams.get('submissionIds');
          if (submissionIds === 'sub-1') {
            return new Response(JSON.stringify({
              targets: [{ targetId: 'target-1', targetLanguage: 'fr-FR' }],
            }), { status: 200 });
          }
          if (submissionIds === 'sub-2') {
            return new Response(JSON.stringify({
              targets: [
                { targetId: 'target-2', targetLanguage: 'fr-FR' },
                { targetId: 'target-3', targetLanguage: 'de-DE' },
              ],
            }), { status: 200 });
          }
          return new Response(JSON.stringify({ targets: [] }), { status: 200 });
        }
        if (u.includes('/submissions/cancel/')) {
          cancelCalls.push({ url: u, body: JSON.parse(opts.body) });
          return new Response('{}', { status: 200 });
        }
        return defaultHandler(u);
      });
      const service = baseService({
        submissionIds: { value: JSON.stringify(['sub-1', 'sub-2']) },
      });

      const result = await cancelTranslation({
        service, lang: { code: 'fr-FR', name: 'French' }, sendMessage: () => {},
      });

      expect(result).to.deep.equal({ ok: true });
      expect(cancelCalls).to.have.length(2);
      const sub1Call = cancelCalls.find((c) => c.url.endsWith('/cancel/sub-1'));
      const sub2Call = cancelCalls.find((c) => c.url.endsWith('/cancel/sub-2'));
      expect(sub1Call.body.targetIds).to.deep.equal(['target-1']);
      expect(sub2Call.body.targetIds).to.deep.equal(['target-2']);
    });
  });
});
