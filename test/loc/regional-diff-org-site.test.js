import sinon from 'sinon';
import { expect } from '@esm-bundle/chai';
import { regionalDiff } from '../../nx/blocks/loc/regional-diff/regional-diff.js';

// Kept in its own file: loc/utils/utils.js's fetchConfig caches its result
// in a module-level CONFIG_CACHE after the first call, so only the *first*
// regionalDiff call on a page ever reaches the network. Isolating this test
// in its own page keeps that first call observable. See
// regional-diff-org-site-fallback.test.js for the getPathDetails() case,
// isolated for the same reason.
describe('regionalDiff - explicit org/site', () => {
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

  it('uses the explicitly passed org/site instead of deriving them from location.hash', async () => {
    // A hash getPathDetails() can't turn into org/site, so any request
    // using it (instead of the explicit org/site) would be observable.
    window.location.hash = '';

    await regionalDiff(
      makeDoc(),
      makeDoc(),
      [],
      [],
      { org: 'explicit-org', site: 'explicit-site' },
    );

    const configCall = fetchStub.args.find(([url]) => url.includes('/source/explicit-org/explicit-site/'));
    expect(configCall, 'expected fetchConfig to request the explicit org/site path').to.exist;
  });
});
