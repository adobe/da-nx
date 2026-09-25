import sinon from 'sinon';
import { expect } from '@esm-bundle/chai';
import { regionalDiff } from '../../nx/blocks/loc/regional-diff/regional-diff.js';

describe('regionalDiff - org/site resolution', () => {
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

  it('falls back to location.hash when org/site are not passed', async () => {
    window.location.hash = '#/rollout/fallback-org/fallback-site';

    await regionalDiff(makeDoc(), makeDoc());

    const configCall = fetchStub.args.find(([url]) => url.includes('/source/fallback-org/fallback-site/'));
    expect(configCall, 'expected fetchConfig to request the hash-derived org/site path').to.exist;
  });
});
