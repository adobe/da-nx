import { expect } from '@esm-bundle/chai';
import {
  connect, saveItems, sendAllLanguages, getStatusAll,
} from '../../../../nx/blocks/loc/connectors/smartling/index.js';
import { DA_TRANSLATE } from '../../../../nx2/utils/utils.js';

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

  it('does nothing when the job has not been created yet (no jobUid)', async () => {
    const service = { origin: 'https://api.smartling.com', projectId: 'proj-1' };
    const langs = [{ code: 'fr-FR', translation: { translated: 0, status: 'created' } }];
    const urls = [{ daBasePath: '/page' }];
    const actions = { saveState: async () => {} };

    await getStatusAll({
      org, site, service, langs, urls, actions,
    });

    expect(calls.length).to.equal(0);
    expect(langs[0].translation.status).to.equal('created');
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
});
