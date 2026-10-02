import { expect } from '@esm-bundle/chai';
import {
  isConnected, connect, saveItems, sendAllLanguages, getStatusAll, translationProgress,
} from '../../../../nx/blocks/loc/connectors/smartling/index.js';
import { DA_TRANSLATE } from '../../../../nx2/utils/utils.js';

let calls;
let origFetch;

function fileStatusResponse(totalStringCount, items) {
  return new Response(JSON.stringify({
    response: { data: { totalStringCount, items } },
  }), { status: 200 });
}

function localeCounts(localeId, completedStringCount, excludedStringCount = 0) {
  return {
    localeId, authorizedStringCount: 0, completedStringCount, excludedStringCount,
  };
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
    if (u.includes('/file/status')) {
      return fileStatusResponse(10, [localeCounts('fr-FR', 10)]);
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

  it('rewrites the origin for getStatusAll file-status polling', async () => {
    const service = { origin: legacyOrigin, projectId: 'proj-1', jobUid: { value: 'job-1' } };
    const langs = [{ code: 'fr-FR', translation: { translated: 0 } }];
    const urls = [{ daBasePath: '/page' }];
    const actions = { saveState: async () => {} };

    await getStatusAll({
      org, site, service, langs, urls, actions,
    });

    const expectedUrl = `${DA_TRANSLATE}/translate/smartling/${org}/${site}/files-api/v2/projects/proj-1/file/status?fileUri=%2Fpage`;
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

  it('surfaces an error and does not touch lang status when the file status request fails', async () => {
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = url.toString();
      calls.push({ url: u, method: opts.method, body: opts.body });

      if (u.includes('/file/status')) {
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

  it('reports the computed progress percentage, not a stale status, when translation is incomplete', async () => {
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = url.toString();
      calls.push({ url: u, method: opts.method, body: opts.body });

      if (u.includes('/file/status')) {
        return fileStatusResponse(10, [localeCounts('fr-FR', 5)]);
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

  it('floors progress so 99.9999% is not reported as complete', async () => {
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = url.toString();
      calls.push({ url: u, method: opts.method, body: opts.body });

      if (u.includes('/file/status')) {
        return fileStatusResponse(1000000, [localeCounts('fr-FR', 999999)]);
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

  it('marks a lang translated (full file count) once every file is 100% complete', async () => {
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = url.toString();
      calls.push({ url: u, method: opts.method, body: opts.body });

      if (u.includes('/file/status')) {
        return fileStatusResponse(10, [localeCounts('fr-FR', 10)]);
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

  it('never marks a lang translated when Smartling lists no entry for that locale', async () => {
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = url.toString();
      calls.push({ url: u, method: opts.method, body: opts.body });

      if (u.includes('/file/status')) {
        return fileStatusResponse(10, [localeCounts('fr-FR', 10)]);
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

    expect(langs[0].translation.status).to.equal('0% translated');
    expect(langs[0].translation.translated).to.equal(0);
  });

  it('does not mark a lang translated while any string is unauthorized (job percentComplete would say 100%)', async () => {
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      calls.push({ url: url.toString(), method: opts.method, body: opts.body });
      if (url.toString().includes('/file/status')) {
        return fileStatusResponse(85, [localeCounts('fr-FR', 81)]);
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

    expect(langs[0].translation.status).to.equal('95% translated');
    expect(langs[0].translation.translated).to.equal(0);
  });

  it('reports the lowest per-file progress and counts only files at 100%', async () => {
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = url.toString();
      calls.push({ url: u, method: opts.method, body: opts.body });
      if (u.includes('/file/status')) {
        return u.includes('fileUri=%2Fpage-2')
          ? fileStatusResponse(10, [localeCounts('fr-FR', 4)])
          : fileStatusResponse(10, [localeCounts('fr-FR', 10)]);
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

    expect(langs[0].translation.status).to.equal('40% translated');
    expect(langs[0].translation.translated).to.equal(1);
  });

  it('surfaces an error and leaves status untouched when Smartling reports zero strings for a file', async () => {
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      calls.push({ url: url.toString(), method: opts.method, body: opts.body });
      if (url.toString().includes('/file/status')) return fileStatusResponse(0, []);
      return new Response('{}', { status: 200 });
    };

    const service = { origin: 'https://api.smartling.com', projectId: 'proj-1', jobUid: { value: 'job-1' } };
    const langs = [{ code: 'fr-FR', translation: { translated: 0, status: 'created' } }];
    const urls = [{ daBasePath: '/page' }];
    const messages = [];
    const actions = { saveState: async () => {}, sendMessage: (m) => messages.push(m) };

    await getStatusAll({
      org, site, service, langs, urls, actions,
    });

    expect(langs[0].translation.status).to.equal('created');
    expect(messages.find((m) => m.type === 'error').text).to.include('no strings for /page');
  });

  it('does not revert a lang already saved to DA back to "translated"', async () => {
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = url.toString();
      calls.push({ url: u, method: opts.method, body: opts.body });

      if (u.includes('/file/status')) {
        // Smartling keeps reporting 100% complete indefinitely once done.
        return fileStatusResponse(10, [localeCounts('fr-FR', 10)]);
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

      if (u.includes('/file/status')) {
        return fileStatusResponse(10, [localeCounts('fr-FR', 10)]);
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
      if (u.includes('/file/status')) {
        progressCalls += 1;
        if (opts.headers.Authorization !== 'Bearer new-token') return new Response('', { status: 401 });
        return new Response(JSON.stringify({
          response: {
            data: { totalStringCount: 10, items: [{ localeId: 'fr-FR', completedStringCount: 10, excludedStringCount: 0 }] },
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

      if (u.includes('/file/status')) {
        progressCalls += 1;
        if (progressCalls === 1) {
          return new Response('', { status: 429, headers: { 'Retry-After': '0.01' } });
        }
        return new Response(JSON.stringify({
          response: {
            data: { totalStringCount: 10, items: [{ localeId: 'fr-FR', completedStringCount: 10, excludedStringCount: 0 }] },
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
});

describe('translationProgress', () => {
  [
    [10, 0, 1, 0],
    [10, 5, 1, 55],
    [10, 9, 0, 90],
    [10, 0, 0, 0],
    [10, 0, 10, 100],
    [1000000, 999999, 0, 99],
  ].forEach(([total, completed, excluded, expected]) => {
    it(`total ${total}, completed ${completed}, excluded ${excluded} -> ${expected}%`, () => {
      expect(translationProgress({
        totalStringCount: total, completedStringCount: completed, excludedStringCount: excluded,
      })).to.equal(expected);
    });
  });
});
