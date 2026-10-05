import { expect } from '@esm-bundle/chai';
import { fetchResolvedManifestId, resolveManifestId } from '../../../../../nx2/blocks/chat-ao/utils/manifest.js';
import { AO_MANIFEST_ID, AO_HTTP_BASE } from '../../../../../nx2/blocks/chat-ao/ao-constants.js';
import { resetMockIms, setMockIms } from '../../../../../nx2/test/mocks/ims.js';

const projectedProductContext = (tenantId) => [{ prodCtx: { owningEntity: tenantId } }];
const cacheKey = (tenantId, userId) => `da-chat-ao-resolved-manifest--${tenantId}--${userId}`;

describe('fetchResolvedManifestId', () => {
  let calls;
  let origFetch;

  const installFetch = ({ status: httpStatus = 200, body = '{}' } = {}) => {
    calls = [];
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      calls.push({ url: url.toString(), headers: opts.headers ?? {} });
      return new Response(body, { status: httpStatus });
    };
  };

  const restoreFetch = () => {
    if (origFetch) window.fetch = origFetch;
    origFetch = null;
  };

  const lastCall = () => calls[calls.length - 1];

  beforeEach(() => {
    resetMockIms();
    setMockIms({ userId: 'user1', projectedProductContext: projectedProductContext('org1') });
  });

  afterEach(() => {
    restoreFetch();
    sessionStorage.removeItem(cacheKey('org1', 'user1'));
    sessionStorage.removeItem(cacheKey('org2', 'user1'));
  });

  it('requests the resolved manifest with an auth + tenant header', async () => {
    installFetch({ body: JSON.stringify({ manifest_id: 'aem-aia' }) });

    const result = await fetchResolvedManifestId();

    expect(result).to.equal('aem-aia');
    expect(lastCall().url).to.equal(`${AO_HTTP_BASE}/api/v1/overrides/user/resolved`);
    expect(lastCall().headers.authorization).to.equal('Bearer test-token');
    expect(lastCall().headers['x-tenant-id']).to.equal('org1');
  });

  it('caches the resolved manifest for the tenant+user pair', async () => {
    installFetch({ body: JSON.stringify({ manifest_id: 'aem-aia' }) });

    await fetchResolvedManifestId();

    expect(sessionStorage.getItem(cacheKey('org1', 'user1'))).to.equal('aem-aia');
    expect(calls).to.have.length(1);
    expect(await fetchResolvedManifestId()).to.equal('aem-aia');
    expect(calls).to.have.length(1); // second call served from sessionStorage, no new fetch
  });

  it('caches a null resolution (no override) distinctly from never having asked', async () => {
    installFetch({ body: JSON.stringify({ manifest_id: null }) });

    expect(await fetchResolvedManifestId()).to.equal(null);
    expect(sessionStorage.getItem(cacheKey('org1', 'user1'))).to.equal('');

    expect(await fetchResolvedManifestId()).to.equal(null);
    expect(calls).to.have.length(1); // still no second fetch — the null itself was cached
  });

  it('does not mix up two different tenants\' cached values', async () => {
    installFetch({ body: JSON.stringify({ manifest_id: 'aem-aia' }) });
    await fetchResolvedManifestId();

    setMockIms({ projectedProductContext: projectedProductContext('org2') });
    installFetch({ body: JSON.stringify({ manifest_id: 'ajo' }) });

    expect(await fetchResolvedManifestId()).to.equal('ajo');
  });

  it('returns null and does not cache on a non-ok response', async () => {
    installFetch({ status: 500 });

    expect(await fetchResolvedManifestId()).to.equal(null);
    expect(sessionStorage.getItem(cacheKey('org1', 'user1'))).to.equal(null);
  });

  it('returns null when the fetch itself throws', async () => {
    origFetch = window.fetch;
    window.fetch = async () => { throw new Error('network down'); };

    expect(await fetchResolvedManifestId()).to.equal(null);
  });

  it('does not cache and still fetches when tenant or user id is missing', async () => {
    resetMockIms(); // default projectedProductContext is undefined, so getOrgId() has no tenantId
    installFetch({ body: JSON.stringify({ manifest_id: 'aem-aia' }) });

    expect(await fetchResolvedManifestId()).to.equal('aem-aia');
    expect(calls).to.have.length(1);

    expect(await fetchResolvedManifestId()).to.equal('aem-aia');
    expect(calls).to.have.length(2); // no cache key, so every call re-fetches
  });
});

describe('resolveManifestId', () => {
  let origFetch;

  // Routes by URL so one test can control both the resolved and config tiers.
  function installRoutedFetch({ resolved, configManifest } = {}) {
    origFetch = window.fetch;
    window.fetch = async (url) => {
      const u = url.toString();
      if (u.includes('/overrides/user/resolved')) {
        return new Response(JSON.stringify({ manifest_id: resolved ?? null }), { status: 200 });
      }
      if (u.includes('/ping/')) return new Response('', { status: 200 });
      const flags = configManifest ? [{ key: 'ew.coworkerManifest', value: configManifest }] : [];
      return new Response(JSON.stringify({ flags: { data: flags } }), { status: 200 });
    };
  }

  beforeEach(() => {
    resetMockIms();
    setMockIms({ userId: 'user1', projectedProductContext: projectedProductContext('org1') });
  });

  afterEach(() => {
    if (origFetch) window.fetch = origFetch;
    origFetch = null;
    sessionStorage.removeItem(cacheKey('org1', 'user1'));
  });

  it('a query override wins outright, without consulting config or AO resolution', async () => {
    let fetchCalled = false;
    origFetch = window.fetch;
    window.fetch = async () => {
      fetchCalled = true;
      return new Response('{}', { status: 200 });
    };

    const result = await resolveManifestId({
      org: 'adobe', site: 'da-live', search: '?nx-chat-ao-manifest=dev-manifest',
    });

    expect(result).to.deep.equal({ manifestId: 'dev-manifest', debugMode: true });
    expect(fetchCalled).to.equal(false);
  });

  it('falls through to the AO-resolved manifest when there is no query override or org/site', async () => {
    installRoutedFetch({ resolved: 'aem-aia' });

    const result = await resolveManifestId({ search: '' });

    expect(result).to.deep.equal({ manifestId: 'aem-aia', debugMode: false });
  });

  it('falls back to the fixed default when nothing else resolves', async () => {
    installRoutedFetch({ resolved: null });

    const result = await resolveManifestId({ search: '' });

    expect(result).to.deep.equal({ manifestId: AO_MANIFEST_ID, debugMode: false });
  });

  it('a configured manifest wins over the AO-resolved one', async () => {
    installRoutedFetch({ resolved: 'aem-aia', configManifest: 'staging-manifest' });

    const result = await resolveManifestId({ org: 'adobe', site: 'da-live', search: '' });

    expect(result).to.deep.equal({ manifestId: 'staging-manifest', debugMode: true });
  });

  it('skips the config tier entirely without both org and site', async () => {
    installRoutedFetch({ resolved: 'aem-aia', configManifest: 'staging-manifest' });

    const result = await resolveManifestId({ org: 'adobe', search: '' });

    expect(result).to.deep.equal({ manifestId: 'aem-aia', debugMode: false });
  });
});
