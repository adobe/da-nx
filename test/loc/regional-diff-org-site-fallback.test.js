import sinon from 'sinon';
import { expect } from '@esm-bundle/chai';
import { regionalDiff } from '../../nx/blocks/loc/regional-diff/regional-diff.js';

// Kept in its own file: loc/utils/utils.js's fetchConfig caches its result
// in a module-level CONFIG_CACHE after the first call, so only the *first*
// regionalDiff call on a page ever reaches the network. Isolating this test
// in its own page keeps that first call observable. See
// regional-diff-org-site.test.js for the explicit-override case, isolated
// for the same reason.
describe('regionalDiff - org/site fallback', () => {
  let fetchStub;
  const originalFetch = window.fetch;
  const originalHash = window.location.hash;

  beforeEach(() => {
    fetchStub = sinon.stub().callsFake(() => Promise.resolve({
      ok: false,
      status: 404,
      headers: new Headers(),
      json: async () => ({}),
      text: async () => '',
    }));
    window.fetch = fetchStub;
  });

  afterEach(() => {
    window.fetch = originalFetch;
    window.location.hash = originalHash;
  });

  function makeDoc() {
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = '<main></main>';
    return doc;
  }

  it('falls back to location.hash when org/site are not passed', async () => {
    window.location.hash = '#/rollout/fallback-org/fallback-site';

    await regionalDiff(makeDoc(), makeDoc());

    const configCall = fetchStub.args.find(([url]) => url.includes('/source/fallback-org/fallback-site/'));
    expect(configCall, 'expected fetchConfig to request the hash-derived org/site path').to.exist;
  });
});
