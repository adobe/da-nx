import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setImsDetails } from '../../nx/utils/daFetch.js';
import { getBlockHashes } from '../../nx/blocks/loc/regional-diff/regional-diff.js';

const CONFIG = { config: { data: [{ key: 'source.fragment.hostnames', value: 'main--other--org.aem.live' }] } };

const toDoc = (href) => {
  const doc = document.implementation.createHTMLDocument();
  doc.body.innerHTML = `<main><div><p><a href="${href}">Link</a></p></div></main>`;
  return doc;
};

describe('getBlockHashes outside the Loc app', () => {
  let originalFetch;
  let originalHash;

  beforeEach(() => {
    setImsDetails('test-token');
    originalFetch = globalThis.fetch;
    originalHash = window.location.hash;
    window.location.hash = '';
    globalThis.fetch = sinon.stub().callsFake(async (url) => {
      const headers = new Headers();
      if (url.endsWith('/source/org/site/.da/translate.json')) return { ok: true, status: 200, headers, json: async () => CONFIG };
      return { ok: false, status: 404, headers, json: async () => ({}) };
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    window.location.hash = originalHash;
    sinon.restore();
  });

  it('uses the given org and site for link normalization without touching the URL hash', async () => {
    const equivalent = await getBlockHashes({ doc: toDoc('https://main--other--org.aem.page/a'), org: 'org', site: 'site' });
    const same = await getBlockHashes({ doc: toDoc('https://main--site--org.aem.live/a'), org: 'org', site: 'site' });
    expect(equivalent).to.deep.equal(same);
    expect(window.location.hash).to.equal('');
  });
});
