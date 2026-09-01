import { expect } from '@esm-bundle/chai';
import {
  connect, isConnected, saveItems, sendAllLanguages, getStatusAll,
} from '../../../../nx/blocks/loc/connectors/smartling/index.js';
import { DA_TRANSLATE } from '../../../../nx2/utils/utils.js';

let calls;
let origFetch;

function installFetch() {
  calls = [];
  origFetch = window.fetch;
  window.fetch = async (url, opts = {}) => {
    const u = url.toString();
    calls.push({ url: u, method: opts.method, body: opts.body });

    if (u.includes('/auth-api/v2/authenticate')) {
      return new Response(JSON.stringify({
        response: { data: { accessToken: 'smartling-token', refreshToken: 'refresh-token' } },
      }), { status: 200 });
    }
    if (u.includes('/jobs-api/v3/projects') && opts.method === 'POST') {
      return new Response(JSON.stringify({
        response: { data: { translationJobUid: 'job-1' } },
      }), { status: 200 });
    }
    if (u.includes('/job-batches-api/v2/projects') && u.includes('/batches') && !u.includes('/file')) {
      return new Response(JSON.stringify({
        response: { data: { batchUid: 'batch-1' } },
      }), { status: 200 });
    }
    if (u.includes('/file') && opts.method === 'POST') {
      return new Response(JSON.stringify({ response: { code: 'ACCEPTED' } }), { status: 200 });
    }
    if (u.includes('/file/progress')) {
      return new Response(JSON.stringify({
        response: {
          code: 'SUCCESS',
          data: { contentProgressReport: [{ targetLocaleId: 'fr-FR', progress: null }] },
        },
      }), { status: 200 });
    }
    if (u.includes('/files-api/v2/projects')) {
      return new Response('translated content', { status: 200 });
    }
    return new Response('{}', { status: 200 });
  };
}

function restoreFetch() {
  if (origFetch) window.fetch = origFetch;
  origFetch = null;
}

describe('smartling connector - legacy origin rewriting', () => {
  const legacyOrigin = `${DA_TRANSLATE}/smartling`;
  const org = 'acme';
  const site = 'site1';

  beforeEach(() => installFetch());
  afterEach(() => restoreFetch());

  // Must run before any other test calls connect()/scheduleRefresh - isConnected's
  // early return depends on tokenPolling being unset, which is otherwise
  // module-level state left over from every later connect() call in this file.
  it('resolves the endpoint from origin/org/site in isConnected, not a nonexistent config key', async () => {
    localStorage.setItem('smartling.prod.token', JSON.stringify({
      accessToken: 'cached-token',
      refreshToken: 'cached-refresh-token',
      expires: Date.now() + 60000,
    }));

    const connected = await isConnected({
      name: 'Smartling', env: 'prod', userId: 'u', userSecret: 's', origin: legacyOrigin, org, site,
    });
    expect(connected).to.equal(true);

    let refreshCalls = 0;
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = url.toString();
      calls.push({ url: u, method: opts.method, body: opts.body });

      if (u.includes('/auth-api/v2/authenticate/refresh')) {
        refreshCalls += 1;
        return new Response(JSON.stringify({
          response: { data: { accessToken: 'new-token', refreshToken: 'r', expiresIn: 300 } },
        }), { status: 200 });
      }
      if (u.includes('/jobs-api/v3/projects') && opts.method === 'POST') {
        if (opts.headers.Authorization !== 'Bearer new-token') return new Response('', { status: 401 });
        return new Response(JSON.stringify({ response: { data: { translationJobUid: 'job-1' } } }), { status: 200 });
      }
      if (u.includes('/job-batches-api/v2/projects') && u.includes('/batches') && !u.includes('/file')) {
        return new Response(JSON.stringify({ response: { data: { batchUid: 'batch-1' } } }), { status: 200 });
      }
      if (u.includes('/file') && opts.method === 'POST') {
        return new Response(JSON.stringify({ response: { code: 'ACCEPTED' } }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    };

    const options = { service: { origin: 'https://api.smartling.com', projectId: 'proj-1' } };
    const langs = [{ name: 'French', code: 'fr-FR' }];
    const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
    const actions = { sendMessage: () => {}, saveState: async () => {} };

    await sendAllLanguages({
      org, site, title: 'title', options, langs, urls, actions,
    });

    expect(refreshCalls).to.equal(1);
    const refreshCall = calls.find((c) => c.url.includes('/auth-api/v2/authenticate/refresh'));
    expect(refreshCall.url).to.equal(`${DA_TRANSLATE}/translate/smartling/${org}/${site}/auth-api/v2/authenticate/refresh`);
    expect(langs[0].translation.status).to.equal('created');
  });

  it('rewrites the legacy /smartling origin to /translate/smartling/<org>/<site> on connect', async () => {
    await connect({
      name: 'Smartling', origin: legacyOrigin, env: 'prod', userId: 'u', userSecret: 's', org, site,
    });

    expect(calls[0].url).to.equal(`${DA_TRANSLATE}/translate/smartling/${org}/${site}/auth-api/v2/authenticate`);
  });

  it('leaves a non-legacy origin untouched on connect', async () => {
    const customOrigin = 'https://api.smartling.com';
    await connect({
      name: 'Smartling', origin: customOrigin, env: 'prod', userId: 'u', userSecret: 's', org, site,
    });

    expect(calls[0].url).to.equal(`${customOrigin}/auth-api/v2/authenticate`);
  });

  it('rewrites the origin for sendAllLanguages job/batch/upload calls', async () => {
    const options = { service: { origin: legacyOrigin, projectId: 'proj-1' } };
    const langs = [{ name: 'French', code: 'fr-FR' }];
    const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
    const actions = { sendMessage: () => {}, saveState: async () => {} };

    await sendAllLanguages({
      org, site, title: 'title', options, langs, urls, actions,
    });

    const base = `${DA_TRANSLATE}/translate/smartling/${org}/${site}`;
    expect(calls.some((c) => c.url === `${base}/jobs-api/v3/projects/proj-1/jobs`)).to.equal(true);
    expect(calls.some((c) => c.url === `${base}/job-batches-api/v2/projects/proj-1/batches`)).to.equal(true);
    expect(calls.some((c) => c.url === `${base}/job-batches-api/v2/projects/proj-1/batches/batch-1/file`)).to.equal(true);
  });

  it('rewrites the origin for getStatusAll progress polling', async () => {
    const service = { origin: legacyOrigin, projectId: 'proj-1', jobUid: { value: 'job-1' } };
    const langs = [{ code: 'fr-FR', translation: { translated: 0 } }];
    const urls = [{ daBasePath: '/page' }];
    const actions = { saveState: async () => {} };

    await getStatusAll({
      org, site, service, langs, urls, actions,
    });

    const expectedUrl = `${DA_TRANSLATE}/translate/smartling/${org}/${site}/jobs-api/v3/projects/proj-1/jobs/job-1/file/progress?fileUri=/page`;
    expect(calls[0].url).to.equal(expectedUrl);
  });

  it('recovers from a 401 on getStatusAll by refreshing the token and retrying', async () => {
    await connect({
      name: 'Smartling', origin: legacyOrigin, env: 'prod', userId: 'u', userSecret: 's', org, site,
    });

    let progressCalls = 0;
    let refreshCalls = 0;
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = url.toString();
      calls.push({ url: u, method: opts.method, body: opts.body });

      if (u.includes('/auth-api/v2/authenticate/refresh')) {
        refreshCalls += 1;
        return new Response(JSON.stringify({
          response: { data: { accessToken: 'new-token', refreshToken: 'new-refresh-token', expiresIn: 300 } },
        }), { status: 200 });
      }
      if (u.includes('/file/progress')) {
        progressCalls += 1;
        if (opts.headers.Authorization !== 'Bearer new-token') return new Response('', { status: 401 });
        return new Response(JSON.stringify({
          response: {
            code: 'SUCCESS',
            data: { contentProgressReport: [{ targetLocaleId: 'fr-FR', progress: null }] },
          },
        }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    };

    const service = { origin: 'https://api.smartling.com', projectId: 'proj-1', jobUid: { value: 'job-1' } };
    const langs = [{ code: 'fr-FR', translation: { translated: 0 } }];
    const urls = [{ daBasePath: '/page' }];
    const actions = { saveState: async () => {} };

    await getStatusAll({
      org, site, service, langs, urls, actions,
    });

    expect(progressCalls).to.equal(2);
    expect(refreshCalls).to.equal(1);
    expect(langs[0].translation.status).to.equal('translated');
  });

  it('rewrites the origin for saveItems file downloads', async () => {
    const service = { origin: legacyOrigin, projectId: 'proj-1' };
    const lang = { code: 'fr-FR' };
    const urls = [{ daBasePath: '/page', ext: 'html' }];
    const saveFn = async (url) => { url.status = 'success'; };

    await saveItems({
      org, site, service, lang, urls, saveFn,
    });

    const call = calls.find((c) => c.url.includes('/files-api/v2/projects'));
    expect(call.url).to.include(`${DA_TRANSLATE}/translate/smartling/${org}/${site}/files-api/v2/projects/proj-1/locales/fr-FR/file`);
  });

  it('retries a 429 from getStatusAll progress polling before succeeding', async () => {
    let progressCalls = 0;
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = url.toString();
      calls.push({ url: u, method: opts.method, body: opts.body });

      if (u.includes('/file/progress')) {
        progressCalls += 1;
        if (progressCalls === 1) {
          return new Response('', { status: 429, headers: { 'Retry-After': '0.01' } });
        }
        return new Response(JSON.stringify({
          response: {
            code: 'SUCCESS',
            data: { contentProgressReport: [{ targetLocaleId: 'fr-FR', progress: null }] },
          },
        }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    };

    const service = { origin: 'https://api.smartling.com', projectId: 'proj-1', jobUid: { value: 'job-1' } };
    const langs = [{ code: 'fr-FR', translation: { translated: 0 } }];
    const urls = [{ daBasePath: '/page' }];
    const actions = { saveState: async () => {} };

    await getStatusAll({
      org, site, service, langs, urls, actions,
    });

    expect(progressCalls).to.equal(2);
    expect(langs[0].translation.status).to.equal('translated');
  });

  it('retries a 429 from saveItems file download before succeeding', async () => {
    let downloadCalls = 0;
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = url.toString();
      calls.push({ url: u, method: opts.method, body: opts.body });

      if (u.includes('/files-api/v2/projects')) {
        downloadCalls += 1;
        if (downloadCalls === 1) {
          return new Response('', { status: 429, headers: { 'Retry-After': '0.01' } });
        }
        return new Response('translated content', { status: 200 });
      }
      return new Response('{}', { status: 200 });
    };

    const service = { origin: 'https://api.smartling.com', projectId: 'proj-1' };
    const lang = { code: 'fr-FR' };
    const urls = [{ daBasePath: '/page', ext: 'html' }];
    const saveFn = async (url) => { url.status = 'success'; };

    await saveItems({
      org, site, service, lang, urls, saveFn,
    });

    expect(downloadCalls).to.equal(2);
    expect(urls[0].status).to.equal('success');
  });

  it('does not auto-authorize the batch by default', async () => {
    const options = { service: { origin: legacyOrigin, projectId: 'proj-1' } };
    const langs = [{ name: 'French', code: 'fr-FR' }];
    const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
    const actions = { sendMessage: () => {}, saveState: async () => {} };

    await sendAllLanguages({
      org, site, title: 'title', options, langs, urls, actions,
    });

    const batchCall = calls.find((c) => c.url.includes('/job-batches-api/v2/projects') && !c.url.includes('/file'));
    expect(JSON.parse(batchCall.body).authorize).to.equal(false);
  });

  it('auto-authorizes the batch when translation.service.autoAuthorize is "yes"', async () => {
    const options = { service: { origin: legacyOrigin, projectId: 'proj-1', autoAuthorize: 'yes' } };
    const langs = [{ name: 'French', code: 'fr-FR' }];
    const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
    const actions = { sendMessage: () => {}, saveState: async () => {} };

    await sendAllLanguages({
      org, site, title: 'title', options, langs, urls, actions,
    });

    const batchCall = calls.find((c) => c.url.includes('/job-batches-api/v2/projects') && !c.url.includes('/file'));
    expect(JSON.parse(batchCall.body).authorize).to.equal(true);
  });

  it('does not auto-authorize when autoAuthorize is set to anything other than "yes"', async () => {
    const options = { service: { origin: legacyOrigin, projectId: 'proj-1', autoAuthorize: 'no' } };
    const langs = [{ name: 'French', code: 'fr-FR' }];
    const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
    const actions = { sendMessage: () => {}, saveState: async () => {} };

    await sendAllLanguages({
      org, site, title: 'title', options, langs, urls, actions,
    });

    const batchCall = calls.find((c) => c.url.includes('/job-batches-api/v2/projects') && !c.url.includes('/file'));
    expect(JSON.parse(batchCall.body).authorize).to.equal(false);
  });

  // Smartling's documented error envelope (Error Handling support article):
  // every 4xx/5xx response, on every endpoint, has this shape.
  function validationErrorResponse(message) {
    return new Response(JSON.stringify({
      response: {
        code: 'VALIDATION_ERROR',
        errors: [{ key: 'error.validation.job.locales.invalid', message, details: { field: 'targetLocaleIds' } }],
      },
    }), { status: 400 });
  }

  it('surfaces a job-creation failure as an error message instead of failing silently', async () => {
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = url.toString();
      calls.push({ url: u, method: opts.method, body: opts.body });

      if (u.includes('/jobs-api/v3/projects')) return validationErrorResponse('Invalid locales [fr-FR]');
      return new Response('{}', { status: 200 });
    };

    const options = { service: { origin: 'https://api.smartling.com', projectId: 'proj-1' } };
    const langs = [{ name: 'French', code: 'fr-FR' }];
    const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
    const messages = [];
    const actions = { sendMessage: (m) => messages.push(m), saveState: async () => {} };

    await sendAllLanguages({
      org, site, title: 'title', options, langs, urls, actions,
    });

    const errorMessage = messages.find((m) => m.type === 'error');
    expect(errorMessage.text).to.include('Invalid locales [fr-FR]');
  });

  it('surfaces a batch-creation failure as an error message instead of failing silently', async () => {
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = url.toString();
      calls.push({ url: u, method: opts.method, body: opts.body });

      if (u.includes('/jobs-api/v3/projects')) {
        return new Response(JSON.stringify({ response: { data: { translationJobUid: 'job-1' } } }), { status: 200 });
      }
      if (u.includes('/job-batches-api/v2/projects') && !u.includes('/file')) {
        return validationErrorResponse('Invalid fileUri');
      }
      return new Response('{}', { status: 200 });
    };

    const options = { service: { origin: 'https://api.smartling.com', projectId: 'proj-1' } };
    const langs = [{ name: 'French', code: 'fr-FR' }];
    const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
    const messages = [];
    const actions = { sendMessage: (m) => messages.push(m), saveState: async () => {} };

    await sendAllLanguages({
      org, site, title: 'title', options, langs, urls, actions,
    });

    const errorMessage = messages.find((m) => m.type === 'error');
    expect(errorMessage.text).to.include('Invalid fileUri');
  });

  it('surfaces a per-file upload failure as an error message instead of only counting it as not-accepted', async () => {
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = url.toString();
      calls.push({ url: u, method: opts.method, body: opts.body });

      if (u.includes('/jobs-api/v3/projects')) {
        return new Response(JSON.stringify({ response: { data: { translationJobUid: 'job-1' } } }), { status: 200 });
      }
      if (u.includes('/job-batches-api/v2/projects') && u.includes('/batches') && !u.includes('/file')) {
        return new Response(JSON.stringify({ response: { data: { batchUid: 'batch-1' } } }), { status: 200 });
      }
      if (u.includes('/file') && opts.method === 'POST') return validationErrorResponse('Invalid locales [fr-FR]');
      return new Response('{}', { status: 200 });
    };

    const options = { service: { origin: 'https://api.smartling.com', projectId: 'proj-1' } };
    const langs = [{ name: 'French', code: 'fr-FR' }];
    const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
    const messages = [];
    const actions = { sendMessage: (m) => messages.push(m), saveState: async () => {} };

    await sendAllLanguages({
      org, site, title: 'title', options, langs, urls, actions,
    });

    const errorMessage = messages.find((m) => m.type === 'error');
    expect(errorMessage.text).to.include('Invalid locales [fr-FR]');
    expect(langs[0].translation.status).to.equal('error');
  });

  it('recovers from a 401 by refreshing the token and retrying the request', async () => {
    await connect({
      name: 'Smartling', origin: legacyOrigin, env: 'prod', userId: 'u', userSecret: 's', org, site,
    });

    let jobCalls = 0;
    let refreshCalls = 0;
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = url.toString();
      calls.push({ url: u, method: opts.method, body: opts.body });

      if (u.includes('/auth-api/v2/authenticate/refresh')) {
        refreshCalls += 1;
        return new Response(JSON.stringify({
          response: { data: { accessToken: 'new-token', refreshToken: 'new-refresh-token', expiresIn: 300 } },
        }), { status: 200 });
      }
      if (u.includes('/jobs-api/v3/projects') && opts.method === 'POST') {
        jobCalls += 1;
        if (opts.headers.Authorization !== 'Bearer new-token') return new Response('', { status: 401 });
        return new Response(JSON.stringify({ response: { data: { translationJobUid: 'job-1' } } }), { status: 200 });
      }
      if (u.includes('/job-batches-api/v2/projects') && u.includes('/batches') && !u.includes('/file')) {
        return new Response(JSON.stringify({ response: { data: { batchUid: 'batch-1' } } }), { status: 200 });
      }
      if (u.includes('/file') && opts.method === 'POST') {
        return new Response(JSON.stringify({ response: { code: 'ACCEPTED' } }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    };

    const options = { service: { origin: 'https://api.smartling.com', projectId: 'proj-1' } };
    const langs = [{ name: 'French', code: 'fr-FR' }];
    const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
    const messages = [];
    const actions = { sendMessage: (m) => messages.push(m), saveState: async () => {} };

    await sendAllLanguages({
      org, site, title: 'title', options, langs, urls, actions,
    });

    expect(jobCalls).to.equal(2);
    expect(refreshCalls).to.equal(1);
    expect(langs[0].translation.status).to.equal('created');
  });

  it('gives up without looping when the retried request also 401s', async () => {
    await connect({
      name: 'Smartling', origin: legacyOrigin, env: 'prod', userId: 'u', userSecret: 's', org, site,
    });

    let refreshCalls = 0;
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = url.toString();
      calls.push({ url: u, method: opts.method, body: opts.body });

      if (u.includes('/auth-api/v2/authenticate/refresh')) {
        refreshCalls += 1;
        return new Response(JSON.stringify({
          response: { data: { accessToken: 'still-bad-token', refreshToken: 'r', expiresIn: 300 } },
        }), { status: 200 });
      }
      if (u.includes('/jobs-api/v3/projects') && opts.method === 'POST') return new Response('{}', { status: 401 });
      return new Response('{}', { status: 200 });
    };

    const options = { service: { origin: 'https://api.smartling.com', projectId: 'proj-1' } };
    const langs = [{ name: 'French', code: 'fr-FR' }];
    const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
    const messages = [];
    const actions = { sendMessage: (m) => messages.push(m), saveState: async () => {} };

    await sendAllLanguages({
      org, site, title: 'title', options, langs, urls, actions,
    });

    expect(refreshCalls).to.equal(1);
    expect(langs[0].translation).to.equal(undefined);
  });
});
