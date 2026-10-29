import { expect } from '@esm-bundle/chai';
import {
  connect, isConnected, sendAllLanguages, getStatusAll, saveItems, serviceOptions,
} from '../../../../nx/blocks/loc/connectors/lilt/index.js';
import { DA_TRANSLATE } from '../../../../nx2/utils/utils.js';
import { zipSync, strToU8 } from '../../../../nx2/deps/fflate/dist/index.js';

// Dynamic-expression import (not a literal string) so @web/dev-server-import-maps
// does not rewrite this to ...?wds-import-map=0. See test/nx2/utils/api.test.js.
const imsPath = '../../../../nx2/utils/ims.js';
const { setMockIms, resetMockIms, getMockSignInCount } = await import(imsPath);

const org = 'acme';
const site = 'site1';
const proxyOrigin = `${DA_TRANSLATE}/translate/lilt/${org}/${site}`;
// DA_ETC resolves to undefined in this test env - auth.js falls back to this origin.
const statusUrl = `https://da-etc.adobeaem.workers.dev/${org}/sites/${site}/integrations/lilt/status?env=prod`;

let calls;
let origFetch;

function baseService(overrides = {}) {
  return { org, site, ...overrides };
}

function statusResponse(connected = true) {
  return new Response(JSON.stringify({ connected }), { status: 200 });
}

let nextJobId = 501;

// Unique job ids keep the connector's per-job zip cache from leaking between tests.
function verifiedService(jobIds = { 'fr-FR': String(nextJobId += 1) }) {
  return baseService({ translationMode: 'verified', jobIds: { value: JSON.stringify(jobIds) } });
}

const memories = [{ id: 11, srclang: 'en', trglang: 'fr' }];

function defaultHandler(u, opts) {
  if (u.includes('/integrations/lilt/status')) return statusResponse();
  if (u.includes('/v2/files') && opts.method === 'POST') {
    return new Response(JSON.stringify({ id: 1 }), { status: 200 });
  }
  if (u.includes('/v2/memories')) {
    return new Response(JSON.stringify(memories), { status: 200 });
  }
  if (u.includes('/v2/translate/file') && opts.method === 'POST') {
    return new Response(JSON.stringify([{ fileId: 1, id: 101 }]), { status: 200 });
  }
  if (u.includes('/v2/translate/file?translationIds=')) {
    return new Response(JSON.stringify([{ id: 101, status: 'Completed' }]), { status: 200 });
  }
  if (u.includes('/v2/translate/files?id=')) {
    return new Response('translated content', { status: 200 });
  }
  if (u.includes('/v2/jobs') && opts.method === 'POST') {
    return new Response(JSON.stringify({ id: 501 }), { status: 200 });
  }
  if (u.includes('/export?type=files')) {
    return new Response('{}', { status: 200 });
  }
  if (u.endsWith('/download')) {
    const zip = zipSync({
      'Project_1_en-US_fr-FR/': new Uint8Array(0),
      'Project_1_en-US_fr-FR/page.frFR.html': strToU8('translated content'),
    });
    return new Response(zip, { status: 200 });
  }
  if (u.includes('/v2/jobs/')) {
    return new Response(JSON.stringify({
      isProcessing: 0,
      stats: { projects: [{ id: 1, trgLang: 'fr', isComplete: true }] },
    }), { status: 200 });
  }
  return new Response('{}', { status: 200 });
}

function installFetch(handler = defaultHandler) {
  calls = [];
  origFetch = window.fetch;
  window.fetch = async (url, opts = {}) => {
    const u = url.toString();
    calls.push({
      url: u, method: opts.method, body: opts.body, headers: opts.headers,
    });
    return handler(u, opts);
  };
}

function restoreFetch() {
  if (origFetch) window.fetch = origFetch;
  origFetch = null;
}

describe('lilt connector', () => {
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
    it('resolves true when da-etc reports a working Lilt key and an IMS session is present', async () => {
      const connected = await isConnected(baseService());

      expect(connected).to.equal(true);
      expect(calls.some((c) => c.url === statusUrl)).to.equal(true);
    });

    it('resolves false when da-etc reports no working Lilt key', async () => {
      installFetch(() => statusResponse(false));

      expect(await isConnected(baseService())).to.equal(false);
    });

    it('resolves false when the da-etc status check fails', async () => {
      installFetch(() => new Response('', { status: 401 }));

      expect(await isConnected(baseService())).to.equal(false);
    });

    it('connect resolves true when connected', async () => {
      expect(await connect(baseService())).to.equal(true);
    });

    it('resolves false when there is no IMS session, even with a working Lilt key', async () => {
      setMockIms({ anonymous: true });

      expect(await isConnected(baseService())).to.equal(false);
    });

    it('isConnected does not prompt sign-in without an IMS session', async () => {
      setMockIms({ anonymous: true });

      await isConnected(baseService());

      expect(getMockSignInCount()).to.equal(0);
    });

    it('connect prompts sign-in without an IMS session and resolves false', async () => {
      setMockIms({ anonymous: true });

      expect(await connect(baseService())).to.equal(false);
      expect(getMockSignInCount()).to.equal(1);
    });
  });

  describe('serviceOptions', () => {
    it('offers AI Translation and Verified Translation modes', async () => {
      const translationMode = serviceOptions.find((opt) => opt.key === 'translationMode');
      const choices = await translationMode.fetch();

      expect(choices).to.deep.equal([
        { value: 'ai', label: 'AI Translation' },
        { value: 'verified', label: 'Verified Translation' },
      ]);
    });
  });

  describe('sendAllLanguages - AI Translation (default mode)', () => {
    it('uploads files, resolves a memory, starts translation and persists translation ids', async () => {
      const service = baseService();
      const options = { service };
      const langs = [{ code: 'fr-FR', name: 'French' }];
      const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
      const savedOptions = [];
      const actions = {
        sendMessage: () => {},
        saveState: async ({ options: opts }) => { savedOptions.push(opts); },
      };

      await sendAllLanguages({
        title: 'My Project', service, options, langs, urls, actions,
      });

      expect(calls.some((c) => c.url.startsWith(`${proxyOrigin}/v2/files`))).to.equal(true);
      expect(calls.some((c) => c.url.includes('/v2/translate/file?fileId=1&memoryId=11'))).to.equal(true);
      expect(langs[0].translation.status).to.equal('created');
      expect(langs[0].translation.sent).to.equal(1);
      expect(savedOptions).to.have.length(1);
      const translationIds = JSON.parse(options.service.translationIds.value);
      expect(translationIds['fr-FR']['/page']).to.equal(101);
    });

    it('keeps ids from earlier sends when a dependent language is sent later', async () => {
      let nextId = 100;
      installFetch((u, opts) => {
        if (u.includes('/v2/translate/file') && opts.method === 'POST') {
          nextId += 1;
          return new Response(JSON.stringify([{ fileId: 1, id: nextId }]), { status: 200 });
        }
        if (u.includes('/v2/translate/file?translationIds=')) {
          const ids = u.split('translationIds=')[1].split(',');
          return new Response(JSON.stringify(
            ids.map((id) => ({ id: Number(id), status: 'Completed' })),
          ), { status: 200 });
        }
        return defaultHandler(u, opts);
      });
      const service = baseService();
      const options = { service };
      const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
      const langs = [{ code: 'fr-FR', name: 'French' }, { code: 'fr-CA', name: 'Canadian French' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await sendAllLanguages({
        title: 'P', service, options, langs: [langs[0]], urls, actions,
      });
      await sendAllLanguages({
        title: 'P', service, options, langs: [langs[1]], urls, actions,
      });

      const ids = JSON.parse(options.service.translationIds.value);
      expect(ids['fr-FR']['/page']).to.equal(101);
      expect(ids['fr-CA']['/page']).to.equal(102);

      await getStatusAll({
        service, langs, urls, actions,
      });
      expect(langs.map((l) => l.translation.status)).to.deep.equal(['translated', 'translated']);
    });

    it('leaves the language untouched when no memory matches its language pair', async () => {
      installFetch((u, opts) => {
        if (u.includes('/v2/memories')) return new Response(JSON.stringify([]), { status: 200 });
        return defaultHandler(u, opts);
      });
      const service = baseService();
      const options = { service };
      const langs = [{ code: 'fr-FR', name: 'French' }];
      const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
      const messages = [];
      const actions = { sendMessage: (m) => messages.push(m), saveState: async () => {} };

      await sendAllLanguages({
        title: 'My Project', service, options, langs, urls, actions,
      });

      expect(langs[0].translation).to.equal(undefined);
      expect(messages.some((m) => m?.type === 'error')).to.equal(true);
    });

    [
      ['returns a non-array response', { not: 'an array' }, 'unexpected response'],
      ['returns no ids for the uploaded files', [], 'no translation ids'],
    ].forEach(([title, body, text]) => {
      it(`reports an error when the translate request ${title}`, async () => {
        installFetch((u, opts) => {
          if (u.includes('/v2/translate/file') && opts.method === 'POST') {
            return new Response(JSON.stringify(body), { status: 200 });
          }
          return defaultHandler(u, opts);
        });
        const service = baseService();
        const langs = [{ code: 'fr-FR', name: 'French' }];
        const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
        const messages = [];
        const actions = { sendMessage: (m) => messages.push(m), saveState: async () => {} };

        await sendAllLanguages({
          title: 'P', service, options: { service }, langs, urls, actions,
        });

        expect(langs[0].translation).to.equal(undefined);
        expect(messages.some((m) => m?.type === 'error' && m.text.includes(text))).to.equal(true);
      });
    });

    it('reports an error and keeps the ids when Lilt starts only some of the files', async () => {
      let nextFileId = 0;
      installFetch((u, opts) => {
        if (u.includes('/v2/files') && opts.method === 'POST') {
          nextFileId += 1;
          return new Response(JSON.stringify({ id: nextFileId }), { status: 200 });
        }
        if (u.includes('/v2/translate/file') && opts.method === 'POST') {
          return new Response(JSON.stringify([{ fileId: 1, id: 101 }]), { status: 200 });
        }
        return defaultHandler(u, opts);
      });
      const service = baseService();
      const options = { service };
      const langs = [{ code: 'fr-FR', name: 'French' }];
      const urls = [
        { daBasePath: '/a', content: '<p>a</p>' },
        { daBasePath: '/b', content: '<p>b</p>' },
      ];
      const messages = [];
      const actions = { sendMessage: (m) => messages.push(m), saveState: async () => {} };

      await sendAllLanguages({
        title: 'P', service, options, langs, urls, actions,
      });

      expect(langs[0].translation.status).to.equal('error');
      expect(langs[0].translation.sent).to.equal(1);
      expect(messages.some((m) => m?.type === 'error' && m.text.includes('only 1 of 2'))).to.equal(true);
      expect(JSON.parse(options.service.translationIds.value)['fr-FR']).to.deep.equal({ '/a': 101 });
    });

    it('uploads at most 5 files at a time and keeps the query strings bounded', async () => {
      const count = 120;
      let inFlight = 0;
      let maxInFlight = 0;
      let nextFileId = 0;
      const translateIdCounts = [];
      installFetch(async (u, opts) => {
        if (u.includes('/v2/files') && opts.method === 'POST') {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await new Promise((resolve) => { setTimeout(resolve, 1); });
          inFlight -= 1;
          nextFileId += 1;
          return new Response(JSON.stringify({ id: nextFileId }), { status: 200 });
        }
        if (u.includes('/v2/translate/file') && opts.method === 'POST') {
          const fileIds = new URL(u).searchParams.get('fileId').split(',').map(Number);
          translateIdCounts.push(fileIds.length);
          const infos = fileIds.map((fileId) => ({ fileId, id: fileId + 1000 }));
          return new Response(JSON.stringify(infos), { status: 200 });
        }
        return defaultHandler(u, opts);
      });
      const service = baseService();
      const options = { service };
      const langs = [{ code: 'fr-FR', name: 'French' }];
      const urls = Array.from({ length: count }, (_, i) => ({ daBasePath: `/p${i}`, content: '<p>x</p>' }));
      const messages = [];
      const actions = { sendMessage: (m) => messages.push(m), saveState: async () => {} };

      await sendAllLanguages({
        title: 'P', service, options, langs, urls, actions,
      });

      expect(maxInFlight).to.be.at.most(5);
      expect(translateIdCounts.length).to.be.greaterThan(1);
      expect(Math.max(...translateIdCounts)).to.be.at.most(50);
      expect(langs[0].translation.status).to.equal('created');
      expect(langs[0].translation.sent).to.equal(count);
      expect(Object.keys(JSON.parse(options.service.translationIds.value)['fr-FR'])).to.have.lengthOf(count);
      expect(messages.some((m) => m?.type === 'error')).to.equal(false);
    });

    it('leaves languages untouched when not every url uploads successfully', async () => {
      installFetch((u, opts) => {
        if (u.includes('/v2/files') && opts.method === 'POST') {
          return new Response(JSON.stringify({ message: 'Unsupported file type.' }), { status: 400 });
        }
        return defaultHandler(u, opts);
      });
      const service = baseService();
      const options = { service };
      const langs = [{ code: 'fr-FR', name: 'French' }];
      const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
      const messages = [];
      const actions = { sendMessage: (m) => messages.push(m), saveState: async () => {} };

      await sendAllLanguages({
        title: 'My Project', service, options, langs, urls, actions,
      });

      expect(langs[0].translation).to.equal(undefined);
      expect(messages.some((m) => m?.text?.includes('Unsupported file type.'))).to.equal(true);
    });

    it('leaves the language untouched with the Lilt detail surfaced when the translate request fails', async () => {
      installFetch((u, opts) => {
        if (u.includes('/v2/translate/file') && opts.method === 'POST') {
          return new Response(JSON.stringify({ message: 'Memory is not ready.' }), { status: 400 });
        }
        return defaultHandler(u, opts);
      });
      const service = baseService();
      const options = { service };
      const langs = [{ code: 'fr-FR', name: 'French' }];
      const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
      const messages = [];
      const actions = { sendMessage: (m) => messages.push(m), saveState: async () => {} };

      await sendAllLanguages({
        title: 'My Project', service, options, langs, urls, actions,
      });

      expect(langs[0].translation).to.equal(undefined);
      expect(messages.some((m) => m?.text?.includes('Memory is not ready.'))).to.equal(true);
    });

    it('does not call Lilt when there is no IMS session', async () => {
      setMockIms({ anonymous: true });
      const service = baseService();
      const options = { service };
      const langs = [{ code: 'fr-FR', name: 'French' }];
      const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await sendAllLanguages({
        title: 'My Project', service, options, langs, urls, actions,
      });

      expect(calls).to.have.lengthOf(0);
    });
  });

  describe('sendAllLanguages - Verified Translation', () => {
    it('uploads files, creates a job and persists the job id', async () => {
      const service = baseService({ translationMode: 'verified' });
      const options = { service };
      const langs = [{ code: 'fr-FR', name: 'French' }];
      const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await sendAllLanguages({
        title: 'My Project', service, options, langs, urls, actions,
      });

      const jobCall = calls.find((c) => c.url.endsWith('/v2/jobs') && c.method === 'POST');
      expect(jobCall).to.exist;
      const body = JSON.parse(jobCall.body);
      expect(body.name).to.equal('My Project');
      expect(body.languagePairs).to.deep.equal([{ trgLang: 'fr', trgLocale: 'FR', memoryId: 11 }]);
      expect(langs[0].translation.status).to.equal('created');
      expect(JSON.parse(options.service.jobIds.value)).to.deep.equal({ 'fr-FR': '501' });
    });

    it('keeps earlier job ids and polls and saves each language from its own job', async () => {
      let nextJob = 500;
      installFetch((u, opts) => {
        if (u.endsWith('/v2/jobs') && opts.method === 'POST') {
          nextJob += 1;
          return new Response(JSON.stringify({ id: nextJob }), { status: 200 });
        }
        return defaultHandler(u, opts);
      });
      const service = baseService({ translationMode: 'verified' });
      const options = { service };
      const urls = [{ daBasePath: '/page', content: '<p>hi</p>', ext: 'html' }];
      const langs = [{ code: 'fr-FR', name: 'French' }, { code: 'fr-CA', name: 'Canadian French' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await sendAllLanguages({
        title: 'P', service, options, langs: [langs[0]], urls, actions,
      });
      await sendAllLanguages({
        title: 'P', service, options, langs: [langs[1]], urls, actions,
      });

      expect(JSON.parse(options.service.jobIds.value)).to.deep.equal({
        'fr-FR': '501',
        'fr-CA': '502',
      });

      calls.length = 0;
      await getStatusAll({
        service, langs, urls, actions,
      });
      expect(calls.some((c) => c.url.endsWith('/v2/jobs/501'))).to.equal(true);
      expect(calls.some((c) => c.url.endsWith('/v2/jobs/502'))).to.equal(true);

      calls.length = 0;
      const saveFn = async (url) => { url.status = 'success'; };
      await saveItems({
        org, site, service, lang: langs[1], urls: [{ daBasePath: '/page', ext: 'html' }], saveFn, sendMessage: () => {},
      });
      expect(calls.some((c) => c.url.includes('/v2/jobs/502/'))).to.equal(true);
      expect(calls.some((c) => c.url.includes('/v2/jobs/501/'))).to.equal(false);
    });

    it('reports an error and does not create a job when no languages have a matching memory', async () => {
      installFetch((u, opts) => {
        if (u.includes('/v2/memories')) return new Response(JSON.stringify([]), { status: 200 });
        return defaultHandler(u, opts);
      });
      const service = baseService({ translationMode: 'verified' });
      const options = { service };
      const langs = [{ code: 'fr-FR', name: 'French' }];
      const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
      const messages = [];
      const actions = { sendMessage: (m) => messages.push(m), saveState: async () => {} };

      await sendAllLanguages({
        title: 'My Project', service, options, langs, urls, actions,
      });

      expect(calls.some((c) => c.url.endsWith('/v2/jobs') && c.method === 'POST')).to.equal(false);
      expect(langs[0].translation).to.equal(undefined);
      expect(messages.some((m) => m?.type === 'error')).to.equal(true);
    });

    it('leaves matched languages unsent when job creation fails, so the project can be resent', async () => {
      installFetch((u, opts) => {
        if (u.includes('/v2/jobs') && opts.method === 'POST') {
          return new Response(JSON.stringify({ message: 'Invalid due date.' }), { status: 400 });
        }
        return defaultHandler(u, opts);
      });
      const service = baseService({ translationMode: 'verified' });
      const options = { service };
      const langs = [{ code: 'fr-FR', name: 'French' }];
      const urls = [{ daBasePath: '/page', content: '<p>hi</p>' }];
      const messages = [];
      const actions = { sendMessage: (m) => messages.push(m), saveState: async () => {} };

      await sendAllLanguages({
        title: 'My Project', service, options, langs, urls, actions,
      });

      expect(langs[0].translation).to.equal(undefined);
      expect(options.service.jobIds).to.equal(undefined);
      expect(messages.some((m) => m?.text?.includes('Invalid due date.'))).to.equal(true);
    });
  });

  describe('getStatusAll - AI Translation', () => {
    it('marks a language translated once every file is done', async () => {
      const service = baseService({
        translationIds: { value: JSON.stringify({ 'fr-FR': { '/page': 101 } }) },
      });
      const langs = [{ code: 'fr-FR', translation: { status: 'created' } }];
      const urls = [{ daBasePath: '/page' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await getStatusAll({
        service, langs, urls, actions,
      });

      expect(langs[0].translation.status).to.equal('translated');
      expect(langs[0].translation.translated).to.equal(1);
    });

    it('marks a language error when Lilt reports a failed translation', async () => {
      installFetch((u, opts) => {
        if (u.includes('/v2/translate/file?translationIds=')) {
          return new Response(JSON.stringify([{ id: 101, status: 'Failed' }]), { status: 200 });
        }
        return defaultHandler(u, opts);
      });
      const service = baseService({
        translationIds: { value: JSON.stringify({ 'fr-FR': { '/page': 101 } }) },
      });
      const langs = [{ code: 'fr-FR', translation: { status: 'created' } }];
      const urls = [{ daBasePath: '/page' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await getStatusAll({
        service, langs, urls, actions,
      });

      expect(langs[0].translation.status).to.equal('error');
    });

    it('polls in bounded id chunks and counts the merged results', async () => {
      const count = 120;
      const idCounts = [];
      installFetch((u, opts) => {
        if (u.includes('/v2/translate/file?translationIds=')) {
          const ids = new URL(u).searchParams.get('translationIds').split(',').map(Number);
          idCounts.push(ids.length);
          const infos = ids.map((id) => ({ id, status: 'Completed' }));
          return new Response(JSON.stringify(infos), { status: 200 });
        }
        return defaultHandler(u, opts);
      });
      const urls = Array.from({ length: count }, (_, i) => ({ daBasePath: `/p${i}` }));
      const idsByPath = Object.fromEntries(urls.map((url, i) => [url.daBasePath, i + 1]));
      const service = baseService({
        translationIds: { value: JSON.stringify({ 'fr-FR': idsByPath }) },
      });
      const langs = [{ code: 'fr-FR', translation: { status: 'created' } }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await getStatusAll({
        service, langs, urls, actions,
      });

      expect(idCounts.length).to.be.greaterThan(1);
      expect(Math.max(...idCounts)).to.be.at.most(50);
      expect(langs[0].translation.translated).to.equal(count);
      expect(langs[0].translation.status).to.equal('translated');
    });

    it('leaves the status unchanged when any status chunk fails', async () => {
      installFetch((u, opts) => {
        if (u.includes('/v2/translate/file?translationIds=')) {
          return new Response('{}', { status: 400 });
        }
        return defaultHandler(u, opts);
      });
      const service = baseService({
        translationIds: { value: JSON.stringify({ 'fr-FR': { '/page': 101 } }) },
      });
      const langs = [{ code: 'fr-FR', translation: { status: 'created' } }];
      const urls = [{ daBasePath: '/page' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await getStatusAll({
        service, langs, urls, actions,
      });

      expect(langs[0].translation.status).to.equal('created');
    });

    it('leaves a language unchanged when Lilt reports an unknown state', async () => {
      installFetch((u, opts) => {
        if (u.includes('/v2/translate/file?translationIds=')) {
          return new Response(JSON.stringify([{ id: 101, status: 'SomethingNew' }]), { status: 200 });
        }
        return defaultHandler(u, opts);
      });
      const service = baseService({
        translationIds: { value: JSON.stringify({ 'fr-FR': { '/page': 101 } }) },
      });
      const langs = [{ code: 'fr-FR', translation: { status: 'created' } }];
      const urls = [{ daBasePath: '/page' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await getStatusAll({
        service, langs, urls, actions,
      });

      expect(langs[0].translation.status).to.equal('created');
      expect(langs[0].translation.translated).to.equal(0);
    });

    it('skips a language with no persisted ids', async () => {
      const service = baseService({
        translationIds: { value: JSON.stringify({ 'de-DE': { '/page': 202 } }) },
      });
      const langs = [{ code: 'fr-FR', translation: { status: 'created' } }];
      const urls = [{ daBasePath: '/page' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await getStatusAll({
        service, langs, urls, actions,
      });

      expect(calls.some((c) => c.url.includes('translationIds='))).to.equal(false);
      expect(langs[0].translation.status).to.equal('created');
    });

    it('skips languages already in a terminal status', async () => {
      const service = baseService();
      const langs = [{ code: 'fr-FR', translation: { status: 'complete' } }];
      const urls = [{ daBasePath: '/page' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await getStatusAll({
        service, langs, urls, actions,
      });

      expect(calls).to.have.lengthOf(0);
    });
  });

  describe('getStatusAll - Verified Translation', () => {
    it('marks a language translated once its job project is complete', async () => {
      const service = verifiedService();
      const langs = [{ code: 'fr-FR', translation: { status: 'created' } }];
      const urls = [{ daBasePath: '/page' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await getStatusAll({
        service, langs, urls, actions,
      });

      expect(langs[0].translation.status).to.equal('translated');
      expect(langs[0].translation.translated).to.equal(1);
    });

    it('does not mark a waiting dependent language translated from another language\'s project', async () => {
      const service = verifiedService();
      const langs = [
        { code: 'fr-FR', translation: { status: 'created' } },
        { code: 'fr-CA', translation: { status: 'waiting' } },
      ];
      const urls = [{ daBasePath: '/page' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await getStatusAll({
        service, langs, urls, actions,
      });

      expect(langs[0].translation.status).to.equal('translated');
      expect(langs[1].translation).to.deep.equal({ status: 'waiting' });
    });

    it('skips polling when no active language was part of the job', async () => {
      const service = verifiedService();
      const langs = [{ code: 'fr-CA', translation: { status: 'waiting' } }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await getStatusAll({
        service, langs, urls: [{ daBasePath: '/page' }], actions,
      });

      expect(calls.some((c) => c.url.includes('/v2/jobs/501'))).to.equal(false);
      expect(langs[0].translation).to.deep.equal({ status: 'waiting' });
    });
  });

  describe('saveItems - AI Translation', () => {
    it('downloads translated content per url and saves it', async () => {
      const service = baseService({
        translationIds: { value: JSON.stringify({ 'fr-FR': { '/page': 101 } }) },
      });
      const urls = [{ daBasePath: '/page', ext: 'html' }];
      const saveFn = async (url) => { url.status = 'success'; };

      const result = await saveItems({
        org, site, service, lang: { code: 'fr-FR', name: 'French' }, urls, saveFn, sendMessage: () => {},
      });

      expect(result[0].status).to.equal('success');
      expect(result[0].sourceContent).to.be.a('string');
    });

    it('marks a url as errored when there is no translation id for it', async () => {
      const service = baseService({ translationIds: { value: JSON.stringify({ 'fr-FR': {} }) } });
      const urls = [{ daBasePath: '/page', ext: 'html' }];
      const saveFn = async (url) => { url.status = 'success'; };

      const result = await saveItems({
        org, site, service, lang: { code: 'fr-FR', name: 'French' }, urls, saveFn, sendMessage: () => {},
      });

      expect(result[0].status).to.equal('error');
    });
  });

  describe('saveItems - concurrency and persistence', () => {
    it('resolves every url to a terminal status above the concurrency cap', async function test() {
      // downloadQueue dispatches one url per 250ms tick, so 8 urls exceed mocha's 2s default.
      this.timeout(5000);
      const total = 8;
      const urls = Array.from({ length: total }, (_, i) => ({ daBasePath: `/p${i}`, ext: 'html' }));
      const idsByPath = Object.fromEntries(urls.map((url, i) => [url.daBasePath, i + 1]));
      const service = baseService({
        translationIds: { value: JSON.stringify({ 'fr-FR': idsByPath }) },
      });
      const saveFn = async (url) => { url.status = 'success'; };

      const result = await saveItems({
        org, site, service, lang: { code: 'fr-FR', name: 'French' }, urls, saveFn, sendMessage: () => {},
      });

      expect(result).to.have.lengthOf(total);
      expect(result.every((url) => url.status === 'success')).to.equal(true);
    });

    it('polls and saves from options persisted by an earlier send', async () => {
      const sendService = baseService();
      const options = { service: sendService };
      const sendLangs = [{ code: 'fr-FR', name: 'French' }];
      const urls = [{ daBasePath: '/page', content: '<p>x</p>', ext: 'html' }];
      const actions = { sendMessage: () => {}, saveState: async () => {} };

      await sendAllLanguages({
        title: 'P', service: sendService, options, langs: sendLangs, urls, actions,
      });

      const reloaded = baseService(JSON.parse(JSON.stringify({
        translationIds: options.service.translationIds,
      })));
      const langs = [{ code: 'fr-FR', name: 'French', translation: { status: 'created' } }];
      await getStatusAll({
        service: reloaded, langs, urls, actions,
      });
      const saveFn = async (url) => { url.status = 'success'; };
      const result = await saveItems({
        org, site, service: reloaded, lang: langs[0], urls, saveFn, sendMessage: () => {},
      });

      expect(langs[0].translation.status).to.equal('translated');
      expect(result[0].status).to.equal('success');
    });
  });

  describe('saveItems - Verified Translation', () => {
    it('exports, waits for readiness, downloads the zip and saves each matched url', async () => {
      const service = verifiedService();
      const urls = [{ daBasePath: '/page', ext: 'html' }];
      const saveFn = async (url) => { url.status = 'success'; };

      const result = await saveItems({
        org, site, service, lang: { code: 'fr-FR', name: 'French' }, urls, saveFn, sendMessage: () => {},
      });

      expect(result[0].status).to.equal('success');
      expect(result[0].sourceContent).to.be.a('string');
      expect(calls.some((c) => c.url.includes('/export?type=files'))).to.equal(true);
      expect(calls.some((c) => c.url.endsWith('/download'))).to.equal(true);
    });

    it('matches the language project folder and locale-infixed file name', async () => {
      installFetch((u, opts) => {
        if (u.endsWith('/download')) {
          return new Response(zipSync({
            'Project_2_en-US_de-DE/a_page.deDE.html': strToU8('<p>german</p>'),
            'Project_1_en-US_fr-FR/x__a_page.frFR.html': strToU8('<p>other</p>'),
            'Project_1_en-US_fr-FR/a_page.frFR.html': strToU8('<p>mine</p>'),
          }), { status: 200 });
        }
        return defaultHandler(u, opts);
      });
      const service = verifiedService();
      const urls = [{ daBasePath: '/a/page', ext: 'html' }];
      const saved = [];
      const saveFn = async (url) => {
        saved.push(url.sourceContent);
        url.status = 'success';
      };

      const result = await saveItems({
        org, site, service, lang: { code: 'fr-FR', name: 'French' }, urls, saveFn, sendMessage: () => {},
      });

      expect(result[0].status).to.equal('success');
      expect(saved[0]).to.include('mine');
    });

    it('errors a url whose file only exists in another language folder', async () => {
      installFetch((u, opts) => {
        if (u.endsWith('/download')) {
          return new Response(zipSync({
            'Project_2_en-US_de-DE/page.deDE.html': strToU8('<p>german</p>'),
          }), { status: 200 });
        }
        return defaultHandler(u, opts);
      });
      const service = verifiedService();
      const urls = [{ daBasePath: '/page', ext: 'html' }];
      const saveFn = async (url) => { url.status = 'success'; };

      const result = await saveItems({
        org, site, service, lang: { code: 'fr-FR', name: 'French' }, urls, saveFn, sendMessage: () => {},
      });

      expect(result[0].status).to.equal('error');
    });

    describe('multi-language job', () => {
      const twoLangZip = () => zipSync({
        'Project_1_en-US_fr-FR/page.frFR.html': strToU8('<p>bonjour</p>'),
        'Project_2_en-US_de-DE/page.deDE.html': strToU8('<p>hallo</p>'),
      });

      function jobHandler({ complete = [true, true], onArchive } = {}) {
        return (u, opts) => {
          if (u.endsWith('/download')) return new Response(twoLangZip(), { status: 200 });
          if (u.endsWith('/archive')) {
            onArchive?.();
            return new Response('{}', { status: 200 });
          }
          if (u.includes('/v2/jobs/') && !u.includes('export')) {
            return new Response(JSON.stringify({
              isProcessing: 0,
              stats: {
                projects: [
                  { id: 1, trgLang: 'fr', isComplete: complete[0] },
                  { id: 2, trgLang: 'de', isComplete: complete[1] },
                ],
              },
            }), { status: 200 });
          }
          return defaultHandler(u, opts);
        };
      }

      async function saveBoth(service) {
        const saved = {};
        const results = [];
        for (const lang of [{ code: 'fr-FR', name: 'French' }, { code: 'de-DE', name: 'German' }]) {
          const urls = [{ daBasePath: '/page', ext: 'html' }];
          const saveFn = async (url) => {
            saved[lang.code] = url.sourceContent;
            url.status = 'success';
          };
          // eslint-disable-next-line no-await-in-loop
          results.push(await saveItems({
            org, site, service, lang, urls, saveFn, sendMessage: () => {},
          }));
        }
        return { saved, results };
      }

      it('saves each language from its own folder and downloads the zip once', async () => {
        installFetch(jobHandler());
        const service = verifiedService({ 'fr-FR': 'shared-1', 'de-DE': 'shared-1' });

        const { saved, results } = await saveBoth(service);

        expect(saved['fr-FR']).to.include('bonjour');
        expect(saved['de-DE']).to.include('hallo');
        expect(results.flat().every((url) => url.status === 'success')).to.equal(true);
        expect(calls.filter((c) => c.url.endsWith('/download'))).to.have.lengthOf(1);
        expect(calls.filter((c) => c.url.includes('/export?type=files'))).to.have.lengthOf(1);
      });

      it('downloads again when a project completes between languages', async () => {
        let state = [true, false];
        installFetch((u, opts) => jobHandler({ complete: state })(u, opts));
        const service = verifiedService({ 'fr-FR': 'shared-2', 'de-DE': 'shared-2' });
        const frUrls = [{ daBasePath: '/page', ext: 'html' }];
        const saveFn = async (url) => { url.status = 'success'; };

        await saveItems({
          org, site, service, lang: { code: 'fr-FR', name: 'French' }, urls: frUrls, saveFn, sendMessage: () => {},
        });
        state = [true, true];
        await saveItems({
          org,
          site,
          service,
          lang: { code: 'de-DE', name: 'German' },
          urls: [{ daBasePath: '/page', ext: 'html' }],
          saveFn,
          sendMessage: () => {},
        });

        expect(calls.filter((c) => c.url.endsWith('/download'))).to.have.lengthOf(2);
      });

      it('archives the job once every project is complete and the save succeeded', async () => {
        let archived = 0;
        installFetch(jobHandler({ onArchive: () => { archived += 1; } }));

        await saveBoth(verifiedService({ 'fr-FR': 'shared-3', 'de-DE': 'shared-3' }));

        expect(archived).to.be.greaterThan(0);
        expect(calls.some((c) => c.url.endsWith('/jobs/shared-3/archive') && c.method === 'POST'))
          .to.equal(true);
      });

      it('does not archive while a project is incomplete', async () => {
        let archived = 0;
        installFetch(jobHandler({ complete: [true, false], onArchive: () => { archived += 1; } }));
        const urls = [{ daBasePath: '/page', ext: 'html' }];
        const saveFn = async (url) => { url.status = 'success'; };

        await saveItems({
          org,
          site,
          service: verifiedService({ 'fr-FR': 'shared-4', 'de-DE': 'shared-4' }),
          lang: { code: 'fr-FR', name: 'French' },
          urls,
          saveFn,
          sendMessage: () => {},
        });

        expect(archived).to.equal(0);
      });

      it('does not archive when a url failed to save', async () => {
        let archived = 0;
        installFetch(jobHandler({ onArchive: () => { archived += 1; } }));
        const urls = [{ daBasePath: '/page', ext: 'html' }];
        const saveFn = async (url) => { url.status = 'error'; };

        await saveItems({
          org,
          site,
          service: verifiedService({ 'fr-FR': 'shared-5', 'de-DE': 'shared-5' }),
          lang: { code: 'fr-FR', name: 'French' },
          urls,
          saveFn,
          sendMessage: () => {},
        });

        expect(archived).to.equal(0);
      });

      it('still succeeds when archiving fails', async () => {
        installFetch((u, opts) => {
          if (u.endsWith('/archive')) return new Response('{}', { status: 400 });
          return jobHandler()(u, opts);
        });
        const urls = [{ daBasePath: '/page', ext: 'html' }];
        const saveFn = async (url) => { url.status = 'success'; };

        const result = await saveItems({
          org,
          site,
          service: verifiedService({ 'fr-FR': 'shared-6', 'de-DE': 'shared-6' }),
          lang: { code: 'fr-FR', name: 'French' },
          urls,
          saveFn,
          sendMessage: () => {},
        });

        expect(result[0].status).to.equal('success');
      });
    });

    it('marks urls as errored when the export never becomes ready', async () => {
      installFetch((u, opts) => {
        if (u.includes('/v2/jobs/') && !u.includes('export') && !u.includes('download')) {
          return new Response(JSON.stringify({ isProcessing: -2 }), { status: 200 });
        }
        return defaultHandler(u, opts);
      });
      const service = verifiedService();
      const urls = [{ daBasePath: '/page', ext: 'html' }];
      const saveFn = async (url) => { url.status = 'success'; };

      const result = await saveItems({
        org, site, service, lang: { code: 'fr-FR', name: 'French' }, urls, saveFn, sendMessage: () => {},
      });

      expect(result[0].status).to.equal('error');
    });

    it('marks urls as errored with the Lilt detail when export fails', async () => {
      installFetch((u, opts) => {
        if (u.includes('/export?type=files')) {
          return new Response(JSON.stringify({ message: 'Job is not yet complete.' }), { status: 400 });
        }
        return defaultHandler(u, opts);
      });
      const service = verifiedService();
      const urls = [{ daBasePath: '/page', ext: 'html' }];
      const saveFn = async (url) => { url.status = 'success'; };
      const messages = [];

      const result = await saveItems({
        org,
        site,
        service,
        lang: { code: 'fr-FR', name: 'French' },
        urls,
        saveFn,
        sendMessage: (m) => messages.push(m),
      });

      expect(result[0].status).to.equal('error');
      expect(messages.some((m) => m?.text?.includes('Job is not yet complete.'))).to.equal(true);
    });

    it('marks urls as errored with the Lilt detail when download fails', async () => {
      installFetch((u, opts) => {
        if (u.endsWith('/download')) {
          return new Response(JSON.stringify({ message: 'Export has expired.' }), { status: 400 });
        }
        return defaultHandler(u, opts);
      });
      const service = verifiedService();
      const urls = [{ daBasePath: '/page', ext: 'html' }];
      const saveFn = async (url) => { url.status = 'success'; };
      const messages = [];

      const result = await saveItems({
        org,
        site,
        service,
        lang: { code: 'fr-FR', name: 'French' },
        urls,
        saveFn,
        sendMessage: (m) => messages.push(m),
      });

      expect(result[0].status).to.equal('error');
      expect(messages.some((m) => m?.text?.includes('Export has expired.'))).to.equal(true);
    });

    it('returns urls unchanged when the language has no job id', async () => {
      const service = baseService({ translationMode: 'verified' });
      const urls = [{ daBasePath: '/page', ext: 'html' }];
      const saveFn = async () => {};

      const result = await saveItems({
        org, site, service, lang: { code: 'fr-FR', name: 'French' }, urls, saveFn, sendMessage: () => {},
      });

      expect(result).to.equal(urls);
      expect(calls.some((c) => c.url.includes('/v2/jobs'))).to.equal(false);
    });
  });

  describe('regional and Chinese variants', () => {
    const mem = (id, trglang, trglocale, srclocale = null) => ({
      id, srclang: 'en', srclocale, trglang, trglocale,
    });
    const regionalMemories = [
      mem(1, 'pt', 'BR'), mem(2, 'pt', 'PT'), mem(3, 'zh', null), mem(4, 'zt', null),
      mem(5, 'es', '419'), mem(6, 'es', 'MX'), mem(7, 'fr', 'FR'), mem(8, 'fr', 'CA'),
      mem(9, 'ar', 'EG'),
    ];
    const memoryHandler = (list, extra) => (u, opts) => {
      if (u.includes('/v2/memories')) return new Response(JSON.stringify(list), { status: 200 });
      return extra?.(u, opts) || defaultHandler(u, opts);
    };

    async function createJob(codes, list = regionalMemories) {
      installFetch(memoryHandler(list));
      const service = baseService({ translationMode: 'verified' });
      const langs = codes.map((code) => ({ code, name: code }));
      const errors = [];
      await sendAllLanguages({
        title: 'P',
        service,
        options: { service },
        langs,
        urls: [{ daBasePath: '/page', content: '<p>hi</p>' }],
        actions: { sendMessage: (m) => { if (m?.type === 'error') errors.push(m); }, saveState: async () => {} },
      });
      const body = JSON.parse(calls.find((c) => c.url.endsWith('/v2/jobs') && c.method === 'POST').body);
      return { body, errors };
    }

    it('picks the memory matching the target region', async () => {
      const { body } = await createJob(['pt-BR', 'pt-PT', 'es-419', 'es-MX', 'fr-CA', 'fr-FR']);

      expect(body.languagePairs.map((p) => p.memoryId)).to.deep.equal([1, 2, 5, 6, 8, 7]);
    });

    it('maps Chinese scripts and regions to the zh and zt memories without a locale', async () => {
      const { body } = await createJob(['zh-Hans', 'zh-CN', 'zh-Hant', 'zh-TW']);

      expect(body.languagePairs).to.deep.equal([
        { trgLang: 'zh', memoryId: 3 },
        { trgLang: 'zh', memoryId: 3 },
        { trgLang: 'zt', memoryId: 4 },
        { trgLang: 'zt', memoryId: 4 },
      ]);
    });

    it('falls back to the only memory for a language', async () => {
      const { body } = await createJob(['ar-SA']);

      expect(body.languagePairs[0].memoryId).to.equal(9);
    });

    it('errors instead of guessing when several regional memories exist', async () => {
      const { body, errors } = await createJob(['pt-AO', 'pt-BR']);

      expect(body.languagePairs.map((p) => p.memoryId)).to.deep.equal([1]);
      expect(errors[0].text).to.include('pt-AO');
    });

    it('prefers a source-region match among memories for the same target', async () => {
      const { body } = await createJob(['fr-FR'], [mem(21, 'fr', 'FR', 'GB'), mem(22, 'fr', 'FR', 'US')]);

      expect(body.languagePairs[0].memoryId).to.equal(22);
    });

    describe('saving from a shared job', () => {
      const zip = () => zipSync({
        'Project_10_en-US_pt-BR/page.ptBR.html': strToU8('<p>brasil</p>'),
        'Project_11_en-US_pt-PT/page.ptPT.html': strToU8('<p>portugal</p>'),
        'Project_12_en-US_zh/page.zh.html': strToU8('<p>simplified</p>'),
        'Project_13_en-US_zh-Hant/page.zhHant.html': strToU8('<p>traditional</p>'),
      });
      const projects = [
        { id: 10, trgLang: 'pt', trgLocale: 'BR', isComplete: true },
        { id: 11, trgLang: 'pt', trgLocale: 'PT', isComplete: true },
        { id: 12, trgLang: 'zh', trgLocale: null, isComplete: true },
        { id: 13, trgLang: 'zt', trgLocale: null, isComplete: true },
      ];
      const jobHandler = (u, opts) => {
        if (u.endsWith('/download')) return new Response(zip(), { status: 200 });
        if (u.includes('/v2/jobs/') && !u.includes('export') && !u.endsWith('/archive')) {
          const job = { isProcessing: 0, stats: { projects } };
          return new Response(JSON.stringify(job), { status: 200 });
        }
        return defaultHandler(u, opts);
      };

      async function saveCode(service, code) {
        let saved;
        const saveFn = async (url) => {
          saved = url.sourceContent;
          url.status = 'success';
        };
        const urls = [{ daBasePath: '/page', ext: 'html' }];
        await saveItems({
          org, site, service, lang: { code, name: code }, urls, saveFn, sendMessage: () => {},
        });
        return saved;
      }

      it('saves pt-BR, pt-PT, zh-Hans and zh-Hant each from their own project', async () => {
        installFetch(jobHandler);
        const ids = ['pt-BR', 'pt-PT', 'zh-Hans', 'zh-Hant'];
        const service = verifiedService(Object.fromEntries(ids.map((id) => [id, 'shared-regional'])));

        const saved = {};
        for (const id of ids) {
          // eslint-disable-next-line no-await-in-loop
          saved[id] = await saveCode(service, id);
        }

        expect(saved['pt-BR']).to.include('brasil');
        expect(saved['pt-PT']).to.include('portugal');
        expect(saved['zh-Hans']).to.include('simplified');
        expect(saved['zh-Hant']).to.include('traditional');
      });

      it('reports each regional project status separately', async () => {
        installFetch((u, opts) => {
          if (u.includes('/v2/jobs/') && !u.includes('export')) {
            return new Response(JSON.stringify({
              isProcessing: 0,
              stats: {
                projects: [
                  { id: 10, trgLang: 'pt', trgLocale: 'BR', isComplete: true },
                  { id: 11, trgLang: 'pt', trgLocale: 'PT', isComplete: false },
                ],
              },
            }), { status: 200 });
          }
          return defaultHandler(u, opts);
        });
        const service = verifiedService({ 'pt-BR': 'status-regional', 'pt-PT': 'status-regional' });
        const langs = ['pt-BR', 'pt-PT'].map((code) => ({
          code, name: code, translation: { status: 'created' },
        }));
        const urls = [{ daBasePath: '/page', ext: 'html' }];

        await getStatusAll({
          service, langs, urls, actions: { sendMessage: () => {}, saveState: async () => {} },
        });

        expect(langs[0].translation.status).to.equal('translated');
        expect(langs[1].translation.status).to.equal('created');
      });
    });
  });
});
