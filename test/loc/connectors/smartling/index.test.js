import { expect } from '@esm-bundle/chai';
import {
  connect, saveItems, sendAllLanguages, getStatusAll,
} from '../../../../nx/blocks/loc/connectors/smartling/index.js';
import { DA_TRANSLATE } from '../../../../nx2/utils/utils.js';

let calls;
let origFetch;

// totalStringCount is a file-level count in Smartling's real response
// (shared across all locales), not repeated per item.
function fileStatusResponse(totalStringCount, items) {
  return new Response(JSON.stringify({
    response: { data: { totalStringCount, items } },
  }), { status: 200 });
}

function localeItem({ localeId, completedStringCount, excludedStringCount = 0 }) {
  return { localeId, completedStringCount, excludedStringCount };
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
      return fileStatusResponse(10, [localeItem({ localeId: 'fr-FR', completedStringCount: 10 })]);
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

  it('rewrites the origin for getStatusAll file-status polling and needs no jobUid', async () => {
    const service = { origin: legacyOrigin, projectId: 'proj-1' };
    const langs = [{ code: 'fr-FR', translation: { translated: 0 } }];
    const urls = [{ daBasePath: '/page' }];
    const actions = { saveState: async () => {} };

    await getStatusAll({
      org, site, service, langs, urls, actions,
    });

    const expectedUrl = `${DA_TRANSLATE}/translate/smartling/${org}/${site}/files-api/v2/projects/proj-1/file/status?fileUri=%2Fpage`;
    expect(calls[0].url).to.equal(expectedUrl);
    expect(langs[0].translation.status).to.equal('translated');
  });

  it('reports Smartling\'s real progress percentage, not a stale status, when translation is incomplete', async () => {
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = url.toString();
      calls.push({ url: u, method: opts.method, body: opts.body });

      if (u.includes('/file/status')) {
        return fileStatusResponse(10, [localeItem({ localeId: 'fr-FR', completedStringCount: 5 })]);
      }
      return new Response('{}', { status: 200 });
    };

    const service = { origin: 'https://api.smartling.com', projectId: 'proj-1' };
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

  it('floors progress rather than rounding up, per Smartling\'s documented formula', async () => {
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = url.toString();
      calls.push({ url: u, method: opts.method, body: opts.body });

      if (u.includes('/file/status')) {
        // 999999 / 1000000 = 99.9999% — must report 99%, not 100%.
        return fileStatusResponse(1000000, [localeItem({ localeId: 'fr-FR', completedStringCount: 999999 })]);
      }
      return new Response('{}', { status: 200 });
    };

    const service = { origin: 'https://api.smartling.com', projectId: 'proj-1' };
    const langs = [{ code: 'fr-FR', translation: { translated: 0 } }];
    const urls = [{ daBasePath: '/page' }];
    const actions = { saveState: async () => {} };

    await getStatusAll({
      org, site, service, langs, urls, actions,
    });

    expect(langs[0].translation.status).to.equal('99% translated');
  });

  it('treats a fully-excluded file as 100% (nothing left to translate)', async () => {
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = url.toString();
      calls.push({ url: u, method: opts.method, body: opts.body });

      if (u.includes('/file/status')) {
        return fileStatusResponse(10, [localeItem({ localeId: 'fr-FR', completedStringCount: 0, excludedStringCount: 10 })]);
      }
      return new Response('{}', { status: 200 });
    };

    const service = { origin: 'https://api.smartling.com', projectId: 'proj-1' };
    const langs = [{ code: 'fr-FR', translation: { translated: 0 } }];
    const urls = [{ daBasePath: '/page' }];
    const actions = { saveState: async () => {} };

    await getStatusAll({
      org, site, service, langs, urls, actions,
    });

    expect(langs[0].translation.status).to.equal('translated');
    expect(langs[0].translation.translated).to.equal(1);
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

  it('retries a 429 from getStatusAll file-status polling before succeeding', async () => {
    let statusCalls = 0;
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = url.toString();
      calls.push({ url: u, method: opts.method, body: opts.body });

      if (u.includes('/file/status')) {
        statusCalls += 1;
        if (statusCalls === 1) {
          return new Response('', { status: 429, headers: { 'Retry-After': '0.01' } });
        }
        return fileStatusResponse(10, [localeItem({ localeId: 'fr-FR', completedStringCount: 10 })]);
      }
      return new Response('{}', { status: 200 });
    };

    const service = { origin: 'https://api.smartling.com', projectId: 'proj-1' };
    const langs = [{ code: 'fr-FR', translation: { translated: 0 } }];
    const urls = [{ daBasePath: '/page' }];
    const actions = { saveState: async () => {} };

    await getStatusAll({
      org, site, service, langs, urls, actions,
    });

    expect(statusCalls).to.equal(2);
    expect(langs[0].translation.status).to.equal('translated');
  });

  it('retries a 429 from saveItems file download before succeeding', async () => {
    let downloadCalls = 0;
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = url.toString();
      calls.push({ url: u, method: opts.method, body: opts.body });

      if (u.includes('/files-api/v2/projects') && u.includes('/locales/')) {
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
});
