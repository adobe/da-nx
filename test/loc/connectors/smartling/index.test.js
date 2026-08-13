import { expect } from '@esm-bundle/chai';
import {
  connect, saveItems, sendAllLanguages, getStatusAll,
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

  it('does not revert a lang already saved to DA back to "translated"', async () => {
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = url.toString();
      calls.push({ url: u, method: opts.method, body: opts.body });

      if (u.includes('/file/progress')) {
        // Smartling keeps reporting 100% complete indefinitely once done.
        return new Response(JSON.stringify({
          response: {
            code: 'SUCCESS',
            data: { contentProgressReport: [{ targetLocaleId: 'fr-FR', progress: { percentComplete: 100 } }] },
          },
        }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    };

    const service = { origin: 'https://api.smartling.com', projectId: 'proj-1', jobUid: { value: 'job-1' } };
    const langs = [{ code: 'fr-FR', translation: { translated: 0, status: 'complete', saved: 1 } }];
    const urls = [{ daBasePath: '/page' }];
    const actions = { saveState: async () => {} };

    await getStatusAll({
      org, site, service, langs, urls, actions,
    });

    expect(langs[0].translation.status).to.equal('complete');
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
});
