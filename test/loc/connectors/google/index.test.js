import { expect } from '@esm-bundle/chai';
import { sendAllLanguages } from '../../../../nx/blocks/loc/connectors/google/index.js';
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
