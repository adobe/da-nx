import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import {
  isConnected, connect, saveItems, sendAllLanguages, getStatusAll, cancelTranslation,
} from '../../../../nx/blocks/loc/connectors/smartling/index.js';
import { DA_TRANSLATE } from '../../../../nx2/utils/utils.js';

// Mirrors the connector's internal PROCESS_POLL_INTERVAL_MS/MAX_PROCESS_POLL_ATTEMPTS,
// used to drive sinon's fake clock through the cancelTranslation poll loop.
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 30;

/**
 * Advances a sinon fake clock in POLL_INTERVAL_MS steps until `promise`
 * settles. A single large tickAsync() races the promise chain: the code
 * under test hasn't registered its next setTimeout yet when tickAsync
 * evaluates which timers are due, so it can fast-forward past a timer
 * that doesn't exist yet and leave the real one (now scheduled even
 * further in the "future") never firing.
 * @param {Object} clock - The sinon fake clock.
 * @param {Promise} promise - The promise to wait for.
 * @param {number} [maxSteps] - Safety cap on tick iterations.
 * @returns {Promise<void>}
 */
async function tickUntilSettled(clock, promise, maxSteps = MAX_POLL_ATTEMPTS + 1) {
  let settled = false;
  promise.then(() => {
    settled = true;
  }, () => {
    settled = true;
  });

  for (let i = 0; i < maxSteps && !settled; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await clock.tickAsync(POLL_INTERVAL_MS);
  }
}

let calls;
let origFetch;

// getJobProgress reports one precomputed percentComplete per locale for
// the whole job - Smartling does its own floor/excluded-string handling,
// so there's no per-file breakdown or formula left for us to reimplement.
function jobProgressResponse(contentProgressReport) {
  return new Response(JSON.stringify({
    response: { data: { contentProgressReport } },
  }), { status: 200 });
}

function localeProgress(targetLocaleId, percentComplete) {
  return { targetLocaleId, progress: { percentComplete } };
}

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
    if (u.includes('/jobs-api/v3/projects') && u.includes('/progress')) {
      return jobProgressResponse([localeProgress('fr-FR', 100)]);
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

  // auth.js's refreshOrReauthenticate() reads a module-level authContext
  // that's only populated by isConnected()/connect(). Seed it via a cached,
  // non-expired token before every test (not just relying on the first
  // test's isConnected() call), so 401-recovery tests pass regardless of
  // execution order or whether a single test runs in isolation.
  beforeEach(async () => {
    sessionStorage.setItem(`smartling.${org}.${site}.prod.token`, JSON.stringify({
      accessToken: 'seed-token',
      refreshToken: 'seed-refresh-token',
      expires: Date.now() + 60000,
    }));
    await isConnected({
      name: 'Smartling', env: 'prod', origin: legacyOrigin, org, site,
    });
  });

  it('resolves the endpoint from origin/org/site in isConnected, not a nonexistent config key', async () => {
    sessionStorage.setItem(`smartling.${org}.${site}.prod.token`, JSON.stringify({
      accessToken: 'cached-token',
      refreshToken: 'cached-refresh-token',
      expires: Date.now() + 60000,
    }));

    const connected = await isConnected({
      name: 'Smartling', env: 'prod', origin: legacyOrigin, org, site,
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

  it('auto-connects via isConnected when there is no cached token, with no separate connect() step', async () => {
    // Distinct org/site so this test's cache key can't collide with the
    // 'acme'/'site1' state other tests in this file leave behind.
    const autoOrg = 'auto-org';
    const autoSite = 'auto-site';

    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = url.toString();
      calls.push({ url: u, method: opts.method, body: opts.body });

      if (u.includes('/integrations/smartling/login')) {
        return new Response(JSON.stringify({
          response: { data: { accessToken: 'auto-token', refreshToken: 'auto-refresh', expiresIn: 300 } },
        }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    };

    const connected = await isConnected({
      name: 'Smartling', env: 'prod', origin: 'https://api.smartling.com', org: autoOrg, site: autoSite,
    });

    expect(connected).to.equal(true);
    expect(calls.some((c) => c.url.includes('/integrations/smartling/login'))).to.equal(true);
  });

  it('surfaces an error and returns false when connect fails', async () => {
    // Distinct org/site so this test's cache key can't collide with other
    // tests' state in this file.
    const failOrg = 'fail-org';
    const failSite = 'fail-site';

    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = url.toString();
      calls.push({ url: u, method: opts.method, body: opts.body });

      if (u.includes('/integrations/smartling/login')) {
        return new Response('', { status: 401 });
      }
      return new Response('{}', { status: 200 });
    };

    const messages = [];
    const sendMessage = (m) => messages.push(m);

    const result = await connect({
      name: 'Smartling', env: 'prod', origin: legacyOrigin, org: failOrg, site: failSite,
    }, sendMessage);

    expect(result).to.equal(false);
    const errorMessage = messages.find((m) => m.type === 'error');
    expect(errorMessage.text).to.include('Connection to Smartling failed');
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

  it('surfaces an error and stops when job creation fails', async () => {
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = url.toString();
      calls.push({ url: u, method: opts.method, body: opts.body });

      if (u.includes('/jobs-api/v3/projects') && opts.method === 'POST') {
        return new Response('{}', { status: 400 });
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

    expect(calls.some((c) => c.url.includes('/job-batches-api/v2/projects'))).to.equal(false);
    const errorMessage = messages.find((m) => m.type === 'error');
    expect(errorMessage.text).to.include('Job creation failed');
  });

  it('surfaces an error and stops when batch creation fails', async () => {
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = url.toString();
      calls.push({ url: u, method: opts.method, body: opts.body });

      if (u.includes('/jobs-api/v3/projects') && opts.method === 'POST') {
        return new Response(JSON.stringify({ response: { data: { translationJobUid: 'job-1' } } }), { status: 200 });
      }
      if (u.includes('/job-batches-api/v2/projects') && !u.includes('/file')) {
        return new Response('{}', { status: 400 });
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

    expect(calls.some((c) => c.url.includes('/file') && c.method === 'POST')).to.equal(false);
    const errorMessage = messages.find((m) => m.type === 'error');
    expect(errorMessage.text).to.include('Batch creation failed');
  });

  it('surfaces an error per file that fails to upload', async () => {
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = url.toString();
      calls.push({ url: u, method: opts.method, body: opts.body });

      if (u.includes('/jobs-api/v3/projects') && opts.method === 'POST') {
        return new Response(JSON.stringify({ response: { data: { translationJobUid: 'job-1' } } }), { status: 200 });
      }
      if (u.includes('/job-batches-api/v2/projects') && !u.includes('/file')) {
        return new Response(JSON.stringify({ response: { data: { batchUid: 'batch-1' } } }), { status: 200 });
      }
      if (u.includes('/file') && opts.method === 'POST') {
        return new Response(JSON.stringify({ response: { code: 'VALIDATION_ERROR' } }), { status: 400 });
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
    expect(errorMessage.text).to.include('Upload failed for /page');
    expect(langs[0].translation.status).to.equal('error');
  });

  it('rewrites the origin for getStatusAll job-progress polling', async () => {
    const service = { origin: legacyOrigin, projectId: 'proj-1', jobUid: { value: 'job-1' } };
    const langs = [{ code: 'fr-FR', translation: { translated: 0 } }];
    const urls = [{ daBasePath: '/page' }];
    const actions = { saveState: async () => {} };

    await getStatusAll({
      org, site, service, langs, urls, actions,
    });

    const expectedUrl = `${DA_TRANSLATE}/translate/smartling/${org}/${site}/jobs-api/v3/projects/proj-1/jobs/job-1/progress`;
    expect(calls[0].url).to.equal(expectedUrl);
    expect(langs[0].translation.status).to.equal('translated');
    expect(langs[0].translation.translated).to.equal(1);
  });

  it('surfaces an error and does nothing when the job has not been created yet (no jobUid)', async () => {
    const service = { origin: 'https://api.smartling.com', projectId: 'proj-1' };
    const langs = [{ code: 'fr-FR', translation: { translated: 0, status: 'created' } }];
    const urls = [{ daBasePath: '/page' }];
    const messages = [];
    const actions = { saveState: async () => {}, sendMessage: (m) => messages.push(m) };

    await getStatusAll({
      org, site, service, langs, urls, actions,
    });

    expect(calls.length).to.equal(0);
    expect(langs[0].translation.status).to.equal('created');
    const errorMessage = messages.find((m) => m.type === 'error');
    expect(errorMessage.text).to.include('no Smartling job has been created yet');
  });

  it('surfaces an error and does not touch lang status when the progress request fails', async () => {
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = url.toString();
      calls.push({ url: u, method: opts.method, body: opts.body });

      if (u.includes('/progress')) {
        return new Response('', { status: 404 });
      }
      return new Response('{}', { status: 200 });
    };

    const service = { origin: 'https://api.smartling.com', projectId: 'proj-1', jobUid: { value: 'job-1' } };
    const langs = [{ code: 'fr-FR', translation: { translated: 0, status: 'created' } }];
    const urls = [{ daBasePath: '/page' }];
    const messages = [];
    let saveStateCalled = false;
    const actions = {
      saveState: async () => { saveStateCalled = true; },
      sendMessage: (m) => messages.push(m),
    };

    await getStatusAll({
      org, site, service, langs, urls, actions,
    });

    expect(langs[0].translation.status).to.equal('created');
    expect(saveStateCalled).to.equal(false);
    const errorMessage = messages.find((m) => m.type === 'error');
    expect(errorMessage.text).to.include('Checking status failed');
  });

  it('reports Smartling\'s real progress percentage, not a stale status, when translation is incomplete', async () => {
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = url.toString();
      calls.push({ url: u, method: opts.method, body: opts.body });

      if (u.includes('/progress')) {
        return jobProgressResponse([localeProgress('fr-FR', 50)]);
      }
      return new Response('{}', { status: 200 });
    };

    const service = { origin: 'https://api.smartling.com', projectId: 'proj-1', jobUid: { value: 'job-1' } };
    // Leftover status from sendAllLanguages — should not still read 'created' after getStatusAll.
    const langs = [{ code: 'fr-FR', translation: { translated: 0, status: 'created' } }];
    const urls = [{ daBasePath: '/page' }];
    const actions = { saveState: async () => {} };

    await getStatusAll({
      org, site, service, langs, urls, actions,
    });

    expect(langs[0].translation.status).to.equal('50% translated');
    expect(langs[0].translation.translated).to.equal(0);
  });

  it('passes through Smartling\'s percentComplete verbatim, without re-deriving it ourselves', async () => {
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = url.toString();
      calls.push({ url: u, method: opts.method, body: opts.body });

      if (u.includes('/progress')) {
        // Smartling floors internally (e.g. 99.9999% -> 99) - we must not
        // re-round or otherwise recompute this ourselves.
        return jobProgressResponse([localeProgress('fr-FR', 99)]);
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

    expect(langs[0].translation.status).to.equal('99% translated');
  });

  it('marks a lang translated (full file count) once Smartling reports 100% complete', async () => {
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = url.toString();
      calls.push({ url: u, method: opts.method, body: opts.body });

      if (u.includes('/progress')) {
        return jobProgressResponse([localeProgress('fr-FR', 100)]);
      }
      return new Response('{}', { status: 200 });
    };

    const service = { origin: 'https://api.smartling.com', projectId: 'proj-1', jobUid: { value: 'job-1' } };
    const langs = [{ code: 'fr-FR', translation: { translated: 0 } }];
    const urls = [{ daBasePath: '/page' }, { daBasePath: '/page-2' }];
    const actions = { saveState: async () => {} };

    await getStatusAll({
      org, site, service, langs, urls, actions,
    });

    expect(langs[0].translation.status).to.equal('translated');
    expect(langs[0].translation.translated).to.equal(2);
  });

  it('marks a lang translated when Smartling reports no content for that locale (progress: null)', async () => {
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = url.toString();
      calls.push({ url: u, method: opts.method, body: opts.body });

      if (u.includes('/progress')) {
        return jobProgressResponse([{ targetLocaleId: 'it-IT', progress: null }]);
      }
      return new Response('{}', { status: 200 });
    };

    const service = { origin: 'https://api.smartling.com', projectId: 'proj-1', jobUid: { value: 'job-1' } };
    const langs = [{ code: 'it-IT', translation: { translated: 0 } }];
    const urls = [{ daBasePath: '/page' }, { daBasePath: '/page-2' }];
    const actions = { saveState: async () => {} };

    await getStatusAll({
      org, site, service, langs, urls, actions,
    });

    expect(langs[0].translation.status).to.equal('translated');
    expect(langs[0].translation.translated).to.equal(2);
  });

  it('does not revert a lang already saved to DA back to "translated"', async () => {
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = url.toString();
      calls.push({ url: u, method: opts.method, body: opts.body });

      if (u.includes('/progress')) {
        // Smartling keeps reporting 100% complete indefinitely once done.
        return jobProgressResponse([localeProgress('fr-FR', 100)]);
      }
      return new Response('{}', { status: 200 });
    };

    const service = { origin: 'https://api.smartling.com', projectId: 'proj-1', jobUid: { value: 'job-1' } };
    const langs = [{ code: 'fr-FR', translation: { translated: 1, status: 'complete', saved: 1 } }];
    const urls = [{ daBasePath: '/page' }];
    const actions = { saveState: async () => {} };

    await getStatusAll({
      org, site, service, langs, urls, actions,
    });

    expect(langs[0].translation.status).to.equal('complete');
    expect(calls.length).to.equal(0);
  });

  it('does not revert a cancelled lang back to "translated"', async () => {
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = url.toString();
      calls.push({ url: u, method: opts.method, body: opts.body });

      if (u.includes('/progress')) {
        return jobProgressResponse([localeProgress('fr-FR', 100)]);
      }
      return new Response('{}', { status: 200 });
    };

    const service = { origin: 'https://api.smartling.com', projectId: 'proj-1', jobUid: { value: 'job-1' } };
    const langs = [{ code: 'fr-FR', translation: { translated: 0, status: 'cancelled' } }];
    const urls = [{ daBasePath: '/page' }];
    const actions = { saveState: async () => {} };

    await getStatusAll({
      org, site, service, langs, urls, actions,
    });

    expect(langs[0].translation.status).to.equal('cancelled');
    expect(calls.length).to.equal(0);
  });

  it('recovers from a 401 on getStatusAll by refreshing the token and retrying', async () => {
    // authContext is seeded by the top-level beforeEach; this test's
    // `service` has no `env`, so the initial token read is a cache miss
    // regardless, and it always 401s and forces the refresh path being tested.
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
      if (u.includes('/progress')) {
        progressCalls += 1;
        if (opts.headers.Authorization !== 'Bearer new-token') return new Response('', { status: 401 });
        return new Response(JSON.stringify({
          response: {
            data: { contentProgressReport: [{ targetLocaleId: 'fr-FR', progress: { percentComplete: 100 } }] },
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

    const call = calls.find((c) => c.url.includes('/files-api/v2/projects') && c.url.includes('/locales/'));
    expect(call.url).to.include(`${DA_TRANSLATE}/translate/smartling/${org}/${site}/files-api/v2/projects/proj-1/locales/fr-FR/file`);
  });

  it('retries a 429 from getStatusAll progress polling before succeeding', async () => {
    let progressCalls = 0;
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = url.toString();
      calls.push({ url: u, method: opts.method, body: opts.body });

      if (u.includes('/progress')) {
        progressCalls += 1;
        if (progressCalls === 1) {
          return new Response('', { status: 429, headers: { 'Retry-After': '0.01' } });
        }
        return new Response(JSON.stringify({
          response: {
            data: { contentProgressReport: [{ targetLocaleId: 'fr-FR', progress: { percentComplete: 100 } }] },
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

  it('surfaces an error and skips saving when a file download fails', async () => {
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = url.toString();
      calls.push({ url: u, method: opts.method, body: opts.body });

      if (u.includes('/files-api/v2/projects')) {
        return new Response('', { status: 404 });
      }
      return new Response('{}', { status: 200 });
    };

    const service = { origin: 'https://api.smartling.com', projectId: 'proj-1' };
    const lang = { code: 'fr-FR' };
    const urls = [{ daBasePath: '/page', ext: 'html' }];
    const messages = [];
    const saveFn = async (url) => { url.status = 'success'; };
    const sendMessage = (m) => messages.push(m);

    await saveItems({
      org, site, service, lang, urls, saveFn, sendMessage,
    });

    expect(urls[0].status).to.equal('error');
    expect(urls[0].sourceContent).to.equal(undefined);
    const errorMessage = messages.find((m) => m.type === 'error');
    expect(errorMessage.text).to.include('Download failed for /page');
  });

  it('marks a url as errored (without hanging) when saveFn throws, and still finishes every other url', async () => {
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = url.toString();
      calls.push({ url: u, method: opts.method, body: opts.body });

      if (u.includes('/files-api/v2/projects')) return new Response('translated content', { status: 200 });
      return new Response('{}', { status: 200 });
    };

    const service = { origin: 'https://api.smartling.com', projectId: 'proj-1' };
    const lang = { code: 'fr-FR' };
    const urls = [
      { daBasePath: '/page-fails', ext: 'html' },
      { daBasePath: '/page-succeeds', ext: 'html' },
    ];
    const saveFn = async (url) => {
      if (url.daBasePath === '/page-fails') throw new Error('save failed');
      url.status = 'success';
    };

    const result = await saveItems({
      org, site, service, lang, urls, saveFn,
    });

    expect(result).to.equal(urls);
    expect(urls[0].status).to.equal('error');
    expect(urls[1].status).to.equal('success');
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
    // See the getStatusAll 401-recovery test above - authContext is seeded
    // by the top-level beforeEach.
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
    // See the getStatusAll 401-recovery test above - authContext is seeded
    // by the top-level beforeEach.
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

  it('cancels a single locale via removeLocaleFromJob (not the job-level cancelJob endpoint), marking it cancelled', async () => {
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = url.toString();
      calls.push({ url: u, method: opts.method, body: opts.body });

      if (u.includes('/jobs-api/v3/projects') && u.includes('/locales/fr-FR') && opts.method === 'DELETE') {
        return new Response('{}', { status: 200 });
      }
      return new Response('{}', { status: 200 });
    };

    const service = {
      org, site, env: 'prod', origin: 'https://api.smartling.com', projectId: 'proj-1', jobUid: { value: 'job-1' },
    };
    const lang = { name: 'French', code: 'fr-FR', translation: { status: 'translated' } };
    const sendMessage = () => {};

    const result = await cancelTranslation({ service, lang, sendMessage });

    expect(result.ok).to.equal(true);
    expect(lang.translation.status).to.equal('cancelled');
    const deleteCall = calls.find((c) => c.method === 'DELETE');
    expect(deleteCall.url).to.include(`/jobs-api/v3/projects/proj-1/jobs/job-1/locales/${lang.code}`);
  });

  it('skips cancellation as a no-op when the lang has no translation info yet', async () => {
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      calls.push({ url: url.toString(), method: opts.method });
      return new Response('{}', { status: 200 });
    };

    const service = {
      org, site, env: 'prod', origin: 'https://api.smartling.com', projectId: 'proj-1', jobUid: { value: 'job-1' },
    };
    const lang = { name: 'French', code: 'fr-FR' };
    const sendMessage = () => {};

    const result = await cancelTranslation({ service, lang, sendMessage });

    expect(result).to.deep.equal({ ok: true, skipped: true });
    expect(calls.length).to.equal(0);
  });

  it('skips cancellation as a no-op when no Smartling job has been created yet', async () => {
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      calls.push({ url: url.toString(), method: opts.method });
      return new Response('{}', { status: 200 });
    };

    const service = {
      org, site, env: 'prod', origin: 'https://api.smartling.com', projectId: 'proj-1',
    };
    const lang = { name: 'French', code: 'fr-FR', translation: { status: 'translated' } };
    const sendMessage = () => {};

    const result = await cancelTranslation({ service, lang, sendMessage });

    expect(result).to.deep.equal({ ok: true, skipped: true });
    expect(calls.length).to.equal(0);
  });

  it('surfaces a cancellation failure as an error message instead of failing silently', async () => {
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = url.toString();
      calls.push({ url: u, method: opts.method });

      if (u.includes('/locales/fr-FR') && opts.method === 'DELETE') {
        return new Response(JSON.stringify({
          response: { code: 'VALIDATION_ERROR', errors: [{ message: 'Locale not found on job.' }] },
        }), { status: 400 });
      }
      return new Response('{}', { status: 200 });
    };

    const service = {
      org, site, env: 'prod', origin: 'https://api.smartling.com', projectId: 'proj-1', jobUid: { value: 'job-1' },
    };
    const lang = { name: 'French', code: 'fr-FR', translation: { status: 'translated' } };
    const messages = [];

    const result = await cancelTranslation({ service, lang, sendMessage: (m) => messages.push(m) });

    expect(result.ok).to.equal(false);
    expect(lang.translation.status).to.equal('translated');
    expect(messages.some((m) => m.type === 'error' && m.text.includes('Locale not found on job.'))).to.equal(true);
  });

  it('polls the async process to completion on a 202 response before marking the lang cancelled', async () => {
    const clock = sinon.useFakeTimers();
    try {
      let progressPolls = 0;
      origFetch = window.fetch;
      window.fetch = async (url, opts = {}) => {
        const u = url.toString();
        calls.push({ url: u, method: opts.method });

        if (u.includes('/locales/fr-FR') && opts.method === 'DELETE') {
          return new Response(JSON.stringify({
            response: { data: { processUid: 'process-1' } },
          }), { status: 202 });
        }
        if (u.includes('/processes/process-1')) {
          progressPolls += 1;
          const processState = progressPolls < 2 ? 'PENDING' : 'COMPLETED';
          return new Response(JSON.stringify({
            response: { data: { processState } },
          }), { status: 200 });
        }
        return new Response('{}', { status: 200 });
      };

      const service = {
        org, site, env: 'prod', origin: 'https://api.smartling.com', projectId: 'proj-1', jobUid: { value: 'job-1' },
      };
      const lang = { name: 'French', code: 'fr-FR', translation: { status: 'translated' } };
      const sendMessage = () => {};

      const promise = cancelTranslation({ service, lang, sendMessage });
      await tickUntilSettled(clock, promise);
      const result = await promise;

      expect(result.ok).to.equal(true);
      expect(lang.translation.status).to.equal('cancelled');
      expect(progressPolls).to.be.greaterThan(1);
    } finally {
      clock.restore();
    }
  });

  it('surfaces an error when the async process never reaches a terminal state', async () => {
    const clock = sinon.useFakeTimers();
    try {
      origFetch = window.fetch;
      window.fetch = async (url, opts = {}) => {
        const u = url.toString();
        calls.push({ url: u, method: opts.method });

        if (u.includes('/locales/fr-FR') && opts.method === 'DELETE') {
          return new Response(JSON.stringify({
            response: { data: { processUid: 'process-1' } },
          }), { status: 202 });
        }
        if (u.includes('/processes/process-1')) {
          return new Response(JSON.stringify({ response: { data: { processState: 'PENDING' } } }), { status: 200 });
        }
        return new Response('{}', { status: 200 });
      };

      const service = {
        org, site, env: 'prod', origin: 'https://api.smartling.com', projectId: 'proj-1', jobUid: { value: 'job-1' },
      };
      const lang = { name: 'French', code: 'fr-FR', translation: { status: 'translated' } };
      const messages = [];

      const promise = cancelTranslation({ service, lang, sendMessage: (m) => messages.push(m) });
      await tickUntilSettled(clock, promise);
      const result = await promise;

      expect(result.ok).to.equal(false);
      expect(lang.translation.status).to.equal('translated');
      expect(messages.some((m) => m.type === 'error' && m.text.includes('did not finish in time'))).to.equal(true);
    } finally {
      clock.restore();
    }
  });
});
