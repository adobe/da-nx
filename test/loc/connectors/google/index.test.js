import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { getStatusAll, saveItems, sendAllLanguages } from '../../../../nx/blocks/loc/connectors/google/index.js';
import { DA_TRANSLATE } from '../../../../nx2/utils/utils.js';

// Dynamic-expression import (not a literal string) so @web/dev-server-import-maps
// does not rewrite this to ...?wds-import-map=0. See test/nx2/utils/api.test.js.
const imsPath = '../../../../nx2/utils/ims.js';
const { setMockIms, resetMockIms } = await import(imsPath);

let calls;
let origFetch;

function installFetch({ translated = '<p>merged</p>' } = {}) {
  calls = [];
  origFetch = window.fetch;
  window.fetch = async (url, opts = {}) => {
    calls.push({
      url: url.toString(),
      method: opts.method,
      headers: opts.headers || {},
      body: opts.body,
    });
    return new Response(JSON.stringify({ translated }), { status: 200 });
  };
}

function restoreFetch() {
  if (origFetch) window.fetch = origFetch;
  origFetch = null;
}

describe('google connector - sendAllLanguages', () => {
  beforeEach(() => {
    resetMockIms();
    installFetch();
  });

  afterEach(() => {
    restoreFetch();
  });

  it('sends translation requests to the org/site-scoped /translate/google endpoint with an IMS bearer token', async () => {
    const org = 'acme';
    const site = 'site1';
    const langs = [{ name: 'French', code: 'fr-FR', location: '/fr' }];
    const langsWithUrls = [{
      urls: [{ suppliedPath: '/page', content: '<p>hi</p>' }],
    }];
    const actions = { sendMessage: () => {}, saveState: async () => {} };

    await sendAllLanguages({
      org, site, langs, langsWithUrls, options: {}, actions,
    });

    expect(calls).to.have.lengthOf(1);
    expect(calls[0].url).to.equal(`${DA_TRANSLATE}/translate/google/${org}/${site}`);
    expect(calls[0].method).to.equal('POST');
    expect(calls[0].headers.Authorization).to.equal('Bearer test-token');
    expect(calls[0].body.get('fromlang')).to.equal('en');
    expect(calls[0].body.get('tolang')).to.equal('fr-FR');

    expect(langs[0].translation.status).to.equal('translated');
  });

  it('does not call the translate endpoint when there is no IMS session', async () => {
    setMockIms({ anonymous: true });

    const org = 'acme';
    const site = 'site1';
    const langs = [{ name: 'French', code: 'fr-FR', location: '/fr' }];
    const langsWithUrls = [{
      urls: [{ suppliedPath: '/page', content: '<p>hi</p>' }],
    }];
    const actions = { sendMessage: () => {}, saveState: async () => {} };

    await sendAllLanguages({
      org, site, langs, langsWithUrls, options: {}, actions,
    });

    expect(calls).to.have.lengthOf(0);
  });
});

describe('google connector - partial failures', () => {
  let translateCalls;

  const translatedHtml = (text) => `<body><main><p>${text}</p></main></body>`;

  // A page whose content includes FAIL gets a 500, REJECT a network error.
  function installTranslateFetch() {
    translateCalls = [];
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const data = opts.body?.get?.('data') || '';
      translateCalls.push(data);
      if (data.includes('REJECT')) throw new TypeError('Failed to fetch');
      if (data.includes('FAIL')) return new Response('', { status: 500 });
      return new Response(JSON.stringify({ translated: translatedHtml(data) }), { status: 200 });
    };
  }

  const makeLangsWithUrls = (contents) => [{
    urls: contents.map((content, idx) => ({ suppliedPath: `/page-${idx}`, content })),
  }];

  const actions = { sendMessage: () => {}, saveState: async () => {} };
  const savedTo = (saveFn) => saveFn.args.map(([url]) => url.destination);
  const saveFn = () => sinon.stub().callsFake(async (url) => { url.status = 'success'; });

  beforeEach(() => {
    resetMockIms();
    installTranslateFetch();
  });

  afterEach(() => {
    restoreFetch();
  });

  ['FAIL', 'REJECT'].forEach((marker) => {
    it(`does not count a page whose translation fails (${marker})`, async () => {
      const langs = [{ name: 'French', code: 'fr', location: '/fr' }];
      const langsWithUrls = makeLangsWithUrls(['<p>one</p>', `<p>${marker}</p>`, '<p>three</p>']);

      const result = await sendAllLanguages({
        org: 'org', site: 'site', langs, langsWithUrls, options: {}, actions,
      });

      expect(langs[0].translation).to.deep.include({ sent: 3, translated: 2 });
      expect(result.errors).to.have.length(1);
      expect(result.errors[0].error).to.include('/page-1');

      const save = saveFn();
      const saved = await saveItems({ lang: langs[0], langIndex: 0, saveFn: save });
      expect(savedTo(save)).to.deep.equal(['/org/site/fr/page-0.html', '/org/site/fr/page-2.html']);
      expect(saved.find((url) => url.suppliedPath === '/page-1').status).to.equal('error');
    });
  });

  it('includes the HTTP status in the error', async () => {
    const langs = [{ name: 'French', code: 'fr', location: '/fr' }];
    const langsWithUrls = makeLangsWithUrls(['<p>FAIL</p>']);

    const { errors } = await sendAllLanguages({
      org: 'org', site: 'site', langs, langsWithUrls, options: {}, actions,
    });

    expect(errors[0].error).to.include('500');
  });

  it('reports every page as translated when all succeed', async () => {
    const langs = [{ name: 'French', code: 'fr', location: '/fr' }];
    const langsWithUrls = makeLangsWithUrls(['<p>one</p>', '<p>two</p>', '<p>three</p>']);

    const result = await sendAllLanguages({
      org: 'org', site: 'site', langs, langsWithUrls, options: {}, actions,
    });

    expect(result).to.equal(undefined);
    expect(langs[0].translation).to.deep.equal({ sent: 3, translated: 3, status: 'translated' });
  });

  it('retries only the failed pages on get status and then saves only those', async () => {
    const langs = [{ name: 'French', code: 'fr', location: '/fr' }];
    const langsWithUrls = makeLangsWithUrls(['<p>one</p>', '<p>FAIL two</p>', '<p>three</p>']);
    await sendAllLanguages({
      org: 'org', site: 'site', langs, langsWithUrls, options: {}, actions,
    });
    await saveItems({ lang: langs[0], langIndex: 0, saveFn: saveFn() });
    langs[0].translation.status = 'error';

    window.fetch = async (url, opts = {}) => {
      const data = opts.body.get('data');
      translateCalls.push(data);
      return new Response(JSON.stringify({ translated: translatedHtml(data) }), { status: 200 });
    };
    translateCalls = [];

    const status = await getStatusAll({ org: 'org', site: 'site', langs, actions });

    expect(translateCalls).to.have.length(1);
    expect(translateCalls[0]).to.include('FAIL two');
    expect(status).to.deep.equal({ errors: [] });
    expect(langs[0].translation).to.deep.include({ translated: 3, status: 'translated' });

    const retrySave = saveFn();
    await saveItems({ lang: langs[0], langIndex: 0, saveFn: retrySave });
    expect(savedTo(retrySave)).to.deep.equal(['/org/site/fr/page-1.html']);
  });

  it('re-saves a translated page whose save failed without translating it again', async () => {
    const langs = [{ name: 'French', code: 'fr', location: '/fr' }];
    const langsWithUrls = makeLangsWithUrls(['<p>one</p>', '<p>two</p>']);
    await sendAllLanguages({
      org: 'org', site: 'site', langs, langsWithUrls, options: {}, actions,
    });
    const failingSave = sinon.stub().callsFake(async (url) => {
      const ok = !url.destination.endsWith('page-1.html');
      url.status = ok ? 'success' : 'error';
      if (!ok) url.error = `${url.destination}: Save failed (500)`;
    });
    await saveItems({ lang: langs[0], langIndex: 0, saveFn: failingSave });
    langs[0].translation.status = 'error';
    translateCalls = [];

    const status = await getStatusAll({ org: 'org', site: 'site', langs, actions });

    expect(translateCalls).to.have.length(0);
    expect(status).to.deep.equal({ errors: [] });

    const retrySave = saveFn();
    await saveItems({ lang: langs[0], langIndex: 0, saveFn: retrySave });
    expect(savedTo(retrySave)).to.deep.equal(['/org/site/fr/page-1.html']);
  });

  it('saves each language from its own translations', async () => {
    const langs = [
      { name: 'French', code: 'fr', location: '/fr' },
      { name: 'German', code: 'de', location: '/de' },
    ];
    const [{ urls }] = makeLangsWithUrls(['<p>one</p>']);
    await sendAllLanguages({
      org: 'org', site: 'site', langs, langsWithUrls: [{ urls }, { urls }], options: {}, actions,
    });

    const save = saveFn();
    await saveItems({ lang: langs[1], langIndex: 0, saveFn: save });

    expect(savedTo(save)).to.deep.equal(['/org/site/de/page-0.html']);
  });
});
