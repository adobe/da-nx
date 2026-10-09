import sinon from 'sinon';
import { expect } from '@esm-bundle/chai';
import { fetchConfig } from '../../nx/blocks/loc/utils/utils.js';

describe('fetchConfig', () => {
  let fetchStub;
  const originalFetch = window.fetch;

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
  });

  it('fetches independently for each distinct org/site pair rather than sharing one cache', async () => {
    await fetchConfig('org-a', 'site-a');
    await fetchConfig('org-b', 'site-b');

    const callsForA = fetchStub.args.filter(([url]) => url.includes('/source/org-a/site-a/'));
    const callsForB = fetchStub.args.filter(([url]) => url.includes('/source/org-b/site-b/'));
    expect(callsForA.length, 'org-a/site-a should have been fetched').to.be.greaterThan(0);
    expect(callsForB.length, 'org-b/site-b should have been fetched').to.be.greaterThan(0);
  });

  it('caches the result for a repeated org/site pair instead of re-fetching', async () => {
    await fetchConfig('org-c', 'site-c');
    const callCountAfterFirst = fetchStub.callCount;

    await fetchConfig('org-c', 'site-c');
    expect(fetchStub.callCount, 'second call for the same org/site should not hit the network')
      .to.equal(callCountAfterFirst);
  });

  it('returns an error without fetching when org or site is missing', async () => {
    expect(await fetchConfig(undefined, 'site-d')).to.deep.equal({ error: 'Options not available.' });
    expect(await fetchConfig('org-d', undefined)).to.deep.equal({ error: 'Options not available.' });
    expect(await fetchConfig(undefined, undefined)).to.deep.equal({ error: 'Options not available.' });
    expect(fetchStub.callCount, 'missing org/site should never hit the network').to.equal(0);
  });
});
