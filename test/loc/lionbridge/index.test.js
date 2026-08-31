import { expect } from '@esm-bundle/chai';
import {
  isConnected, connect, sendAllLanguages, getStatusAll, saveItems,
} from '../../../nx/blocks/loc/connectors/lionbridge/index.js';

const API_ENDPOINT = 'https://api.lionbridge.example.com/v2';
const UPLOAD_ORIGIN = 'https://upload.example.com';

let calls;
let origFetch;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function defaultHandler(url, opts) {
  if (url.includes('/integrations/lionbridge/login')) {
    return jsonResponse({ access_token: 'lb-token', expires_in: 3600 });
  }
  if (url.startsWith(UPLOAD_ORIGIN)) {
    return new Response('', { status: 200 });
  }
  if (url.includes('/requests/add')) {
    return jsonResponse({
      _embedded: { requests: [{ requestId: 'req-fr', targetNativeLanguageCode: 'fr-FR' }] },
    }, 201);
  }
  if (url.includes('/requests/approve')) {
    return jsonResponse({ _embedded: { requests: [{ requestId: 'req-fr', statusCode: 'TRANSLATION_APPROVED' }] } });
  }
  if (url.includes('/retrievefile')) {
    return new Response('<html><body><main><div>Translated</div></main></body></html>', { status: 200 });
  }
  if (url.includes('/submit')) {
    return jsonResponse({ statusCode: 'SENDING' });
  }
  if (url.includes('/sourcefiles')) {
    return jsonResponse({
      fmsPostMultipartUrl: `${UPLOAD_ORIGIN}/sas-1`,
      fmsFileId: 'file-1',
    }, 201);
  }
  if (url.includes('/requests')) {
    return jsonResponse({
      _embedded: {
        requests: [{ requestId: 'req-fr', targetNativeLanguageCode: 'fr-FR', statusCode: 'REVIEW_TRANSLATION' }],
      },
    });
  }
  if (url.endsWith('/jobs') && opts.method === 'POST') {
    return jsonResponse({ jobId: 'job-1' }, 201);
  }
  // .da/translate.json (connector guid lookup) and anything else unhandled.
  return jsonResponse({});
}

function installFetch(handler = defaultHandler) {
  calls = [];
  origFetch = window.fetch;
  window.fetch = async (url, opts = {}) => {
    const u = url.toString();
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
    apiEndpoint: API_ENDPOINT,
    providerId: 'provider-1',
    ...overrides,
  };
}

describe('lionbridge connector', () => {
  beforeEach(() => {
    localStorage.clear();
    installFetch();
  });

  afterEach(() => {
    restoreFetch();
    localStorage.clear();
  });

  describe('isConnected / connect', () => {
    it('resolves true when the login endpoint returns a token', async () => {
      expect(await isConnected(baseService({ site: 'connect-ok' }))).to.equal(true);
      expect(await connect(baseService({ site: 'connect-ok-2' }))).to.equal(true);
    });

    it('resolves false when the login endpoint fails', async () => {
      installFetch((url) => (url.includes('/login') ? new Response('', { status: 401 }) : jsonResponse({})));

      expect(await isConnected(baseService({ site: 'connect-fail' }))).to.equal(false);
    });
  });

  describe('sendAllLanguages', () => {
    it('creates a job, uploads all urls, and submits — providerId only in the submit body', async () => {
      const service = baseService({ site: 'send-ok' });
      const langs = [{ code: 'fr-FR', name: 'French' }];
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

      const jobCall = calls.find((c) => c.url.endsWith('/jobs') && c.method === 'POST');
      expect(jobCall, 'createJob call').to.exist;
      expect(JSON.parse(jobCall.body).providerId).to.equal(undefined);

      const submitCall = calls.find((c) => c.url.includes('/submit'));
      expect(submitCall, 'submit call').to.exist;
      expect(JSON.parse(submitCall.body).providerId).to.equal('provider-1');

      expect(langs[0].translation.status).to.equal('created');
      expect(langs[0].translation.jobId).to.equal('job-1');
      expect(langs[0].translation.sent).to.equal(1);
      expect(saved).to.have.length(1);
      expect(messages[messages.length - 1]).to.equal(undefined);
    });

    it('marks the language as error when a file fails to upload', async () => {
      installFetch((url, opts) => {
        if (url.includes('/sourcefiles')) return new Response('', { status: 500 });
        return defaultHandler(url, opts);
      });

      const service = baseService({ site: 'send-upload-fail' });
      const langs = [{ code: 'fr-FR', name: 'French' }];
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

      const submitCall = calls.find((c) => c.url.includes('/submit'));
      expect(submitCall, 'submit call').to.equal(undefined);
    });

    it('sends a dueDate on the job when project.due is set', async () => {
      const service = baseService({ site: 'send-due-date' });
      const langs = [{ code: 'fr-FR', name: 'French' }];
      const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await sendAllLanguages({
        title: 'My Project',
        service,
        options: { 'project.due': '2026-12-01T00:00:00.000Z' },
        langs,
        urls,
        actions,
      });

      const jobCall = calls.find((c) => c.url.endsWith('/jobs') && c.method === 'POST');
      expect(JSON.parse(jobCall.body).dueDate).to.equal('2026-12-01T00:00:00.000Z');
    });

    it('prefixes connectorName with the persisted connector guid', async () => {
      installFetch((url, opts) => {
        if (url.endsWith('.da/translate.json')) {
          return jsonResponse({
            config: {
              total: 1,
              limit: 1,
              offset: 0,
              data: [{ key: 'translation.service.prod.connectorGuid', value: 'guid-123' }],
            },
          });
        }
        return defaultHandler(url, opts);
      });

      const service = baseService({ site: 'send-guid' });
      const langs = [{ code: 'fr-FR', name: 'French' }];
      const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await sendAllLanguages({
        title: 'My Project', service, options: {}, langs, urls, actions,
      });

      const jobCall = calls.find((c) => c.url.endsWith('/jobs') && c.method === 'POST');
      expect(JSON.parse(jobCall.body).connectorName).to.equal('guid-123 DA Live Localization for Lionbridge');
    });

    it('truncates jobName and requestName to 250 bytes', async () => {
      const service = baseService({ site: 'send-long-names' });
      const longTitle = 'x'.repeat(500);
      const longPath = `/${'y'.repeat(500)}`;
      const langs = [{ code: 'fr-FR', name: 'French' }];
      const urls = [{ daBasePath: longPath, content: '<p>hi</p>' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await sendAllLanguages({
        title: longTitle, service, options: {}, langs, urls, actions,
      });

      const jobCall = calls.find((c) => c.url.endsWith('/jobs') && c.method === 'POST');
      const { jobName } = JSON.parse(jobCall.body);
      expect(new TextEncoder().encode(jobName).length).to.be.at.most(250);

      const addCall = calls.find((c) => c.url.includes('/requests/add'));
      const { requestName } = JSON.parse(addCall.body);
      expect(new TextEncoder().encode(requestName).length).to.be.at.most(250);
    });

    it('retries once on 429, honoring Retry-After, then succeeds', async () => {
      let jobPostCount = 0;
      installFetch((url, opts) => {
        if (url.endsWith('/jobs') && opts.method === 'POST') {
          jobPostCount += 1;
          if (jobPostCount === 1) {
            return new Response('', { status: 429, headers: { 'Retry-After': '0.01' } });
          }
          return jsonResponse({ jobId: 'job-1' }, 201);
        }
        return defaultHandler(url, opts);
      });

      const service = baseService({ site: 'send-retry-429' });
      const langs = [{ code: 'fr-FR', name: 'French' }];
      const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await sendAllLanguages({
        title: 'My Project', service, options: {}, langs, urls, actions,
      });

      expect(jobPostCount).to.equal(2);
      expect(langs[0].translation.jobId).to.equal('job-1');
    });

    it('gives up after exhausting retries and reports the job as failed', async () => {
      let jobPostCount = 0;
      installFetch((url, opts) => {
        if (url.endsWith('/jobs') && opts.method === 'POST') {
          jobPostCount += 1;
          return new Response('', { status: 429, headers: { 'Retry-After': '0.001' } });
        }
        return defaultHandler(url, opts);
      });

      const service = baseService({ site: 'send-retry-exhausted' });
      const langs = [{ code: 'fr-FR', name: 'French' }];
      const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
      const messages = [];
      const actions = { sendMessage: (m) => messages.push(m), saveState: async () => {} };

      await sendAllLanguages({
        title: 'My Project', service, options: {}, langs, urls, actions,
      });

      expect(jobPostCount).to.equal(4); // initial attempt + 3 retries
      expect(messages.some((m) => m?.text === 'Error creating Lionbridge job.')).to.equal(true);
    });
  });

  describe('getStatusAll', () => {
    it('does nothing when no jobId is present on the first lang', async () => {
      const langs = [{ code: 'fr-FR' }];
      const actions = {
        sendMessage: () => { throw new Error('sendMessage should not be called'); },
        saveState: async () => { throw new Error('saveState should not be called'); },
      };

      await getStatusAll({ service: baseService(), langs, urls: [], actions });

      expect(langs[0].translation).to.equal(undefined);
    });

    it('paginates through the next cursor and aggregates all requests', async () => {
      let call = 0;
      installFetch((url) => {
        if (url.includes('/login')) return jsonResponse({ access_token: 'lb-token', expires_in: 3600 });
        if (url.includes('/requests')) {
          call += 1;
          if (call === 1) {
            return jsonResponse({
              _embedded: { requests: [{ requestId: 'r1', targetNativeLanguageCode: 'fr-FR', statusCode: 'REVIEW_TRANSLATION' }] },
              next: 'cursor-2',
            });
          }
          return jsonResponse({
            _embedded: { requests: [{ requestId: 'r2', targetNativeLanguageCode: 'de-DE', statusCode: 'REVIEW_TRANSLATION' }] },
          });
        }
        return jsonResponse({});
      });

      const langs = [
        { code: 'fr-FR', translation: { jobId: 'job-1' } },
        { code: 'de-DE', translation: { jobId: 'job-1' } },
      ];
      const urls = [{ daBasePath: '/page' }];
      const saved = [];
      const actions = { sendMessage: () => {}, saveState: async () => { saved.push(true); } };

      await getStatusAll({ service: baseService(), langs, urls, actions });

      expect(call).to.equal(2);
      const requestsCalls = calls.filter((c) => c.url.includes('/requests') && !c.url.includes('/login'));
      expect(requestsCalls[1].url).to.include('next=cursor-2');
      expect(langs[0].translation.status).to.equal('translated');
      expect(langs[1].translation.status).to.equal('translated');
      expect(saved).to.have.length(1);
    });

    it('computes status per job when langs span more than one job (waitingFor follow-up jobs)', async () => {
      installFetch((url) => {
        if (url.includes('/login')) return jsonResponse({ access_token: 'lb-token', expires_in: 3600 });
        if (url.includes('/jobs/job-1/requests')) {
          return jsonResponse({
            _embedded: { requests: [{ requestId: 'r1', targetNativeLanguageCode: 'fr-FR', statusCode: 'REVIEW_TRANSLATION' }] },
          });
        }
        if (url.includes('/jobs/job-2/requests')) {
          // de-DE's own follow-up job has no ready requests yet.
          return jsonResponse({
            _embedded: { requests: [{ requestId: 'r2', targetNativeLanguageCode: 'de-DE', statusCode: 'IN_PROGRESS' }] },
          });
        }
        return jsonResponse({});
      });

      const langs = [
        { code: 'fr-FR', translation: { jobId: 'job-1' } },
        { code: 'de-DE', translation: { jobId: 'job-2' } },
      ];
      const urls = [{ daBasePath: '/page' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await getStatusAll({ service: baseService(), langs, urls, actions });

      const jobRequestUrls = calls.map((c) => c.url).filter((u) => u.includes('/requests') && !u.includes('/login'));
      expect(jobRequestUrls.some((u) => u.includes('/jobs/job-1/requests'))).to.equal(true);
      expect(jobRequestUrls.some((u) => u.includes('/jobs/job-2/requests'))).to.equal(true);
      expect(langs[0].translation.status).to.equal('translated');
      expect(langs[1].translation.status).to.equal('in progress');
    });
  });

  describe('saveItems', () => {
    it('downloads with Accept: application/octet-stream and passes DNT-stripped content to saveFn', async () => {
      const saved = [];
      const url = { daBasePath: '/page', requestIds: { 'fr-FR': 'req-fr' } };
      const lang = { code: 'fr-FR', translation: { jobId: 'job-1' } };

      await saveItems({
        org: 'acme',
        site: 'site1',
        service: baseService(),
        lang,
        urls: [url],
        saveFn: async (u) => { saved.push(u); u.status = 'success'; },
      });

      const dlCall = calls.find((c) => c.url.includes('/retrievefile'));
      expect(dlCall, 'retrievefile call').to.exist;
      expect(dlCall.headers.Accept).to.equal('application/octet-stream');
      expect(saved).to.have.length(1);
      expect(url.sourceContent).to.include('Translated');
    });

    it('approves the request after a successful download/save', async () => {
      const url = { daBasePath: '/page', requestIds: { 'fr-FR': 'req-fr' } };
      const lang = { code: 'fr-FR', translation: { jobId: 'job-1' } };

      await saveItems({
        org: 'acme',
        site: 'site1',
        service: baseService(),
        lang,
        urls: [url],
        saveFn: async (u) => { u.status = 'success'; },
      });

      const approveCall = calls.find((c) => c.url.includes('/requests/approve'));
      expect(approveCall, 'approve call').to.exist;
      expect(JSON.parse(approveCall.body).requestIds).to.deep.equal(['req-fr']);
      expect(url.status).to.equal('success');
    });

    it('does not mark the url as error when approval fails after a successful save', async () => {
      installFetch((url, opts) => {
        if (url.includes('/requests/approve')) return new Response('', { status: 500 });
        return defaultHandler(url, opts);
      });

      const url = { daBasePath: '/page', requestIds: { 'fr-FR': 'req-fr' } };
      const lang = { code: 'fr-FR', translation: { jobId: 'job-1' } };

      await saveItems({
        org: 'acme',
        site: 'site1',
        service: baseService(),
        lang,
        urls: [url],
        saveFn: async (u) => { u.status = 'success'; },
      });

      expect(url.status).to.equal('success');
    });

    it('does not approve the request when saveFn does not mark the url as success', async () => {
      const url = { daBasePath: '/page', requestIds: { 'fr-FR': 'req-fr' } };
      const lang = { code: 'fr-FR', translation: { jobId: 'job-1' } };

      await saveItems({
        org: 'acme',
        site: 'site1',
        service: baseService(),
        lang,
        urls: [url],
        saveFn: async (u) => { u.status = 'error'; },
      });

      const approveCall = calls.find((c) => c.url.includes('/requests/approve'));
      expect(approveCall, 'approve call').to.equal(undefined);
      expect(url.status).to.equal('error');
    });

    it('marks the url as error when there is no requestId for the lang', async () => {
      const url = { daBasePath: '/page', requestIds: {} };
      const lang = { code: 'fr-FR', translation: { jobId: 'job-1' } };

      const result = await saveItems({
        org: 'acme',
        site: 'site1',
        service: baseService(),
        lang,
        urls: [url],
        saveFn: async () => {},
      });

      expect(result[0].status).to.equal('error');
    });

    it('returns the urls unchanged when the lang has no jobId', async () => {
      const urls = [{ daBasePath: '/page' }];
      const lang = { code: 'fr-FR' };

      const result = await saveItems({
        org: 'acme', site: 'site1', service: baseService(), lang, urls, saveFn: async () => {},
      });

      expect(result).to.equal(urls);
    });
  });
});
