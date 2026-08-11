import { expect } from '@esm-bundle/chai';
import authReady, { getAccessToken } from '../../../nx/blocks/loc/connectors/lionbridge/auth.js';

const LOGIN_ORIGIN = 'https://da-etc.adobeaem.workers.dev';

let calls;
let origFetch;

function installFetch(handler) {
  calls = [];
  origFetch = window.fetch;
  window.fetch = async (url, opts = {}) => {
    calls.push({ url: url.toString(), method: opts.method });
    return handler(url.toString(), opts);
  };
}

function restoreFetch() {
  if (origFetch) window.fetch = origFetch;
  origFetch = null;
}

function tokenResponse(accessToken, expiresIn = 3600) {
  const body = { access_token: accessToken, expires_in: expiresIn };
  return new Response(JSON.stringify(body), { status: 200 });
}

describe('lionbridge auth', () => {
  beforeEach(() => localStorage.clear());

  afterEach(() => {
    restoreFetch();
    localStorage.clear();
  });

  it('fetches and caches a token on first call', async () => {
    installFetch(async () => tokenResponse('token-1'));

    const token = await getAccessToken({ org: 'acme', site: 'site1', env: 'prod' });

    expect(token).to.equal('token-1');
    expect(calls).to.have.length(1);
    expect(calls[0].url).to.equal(`${LOGIN_ORIGIN}/acme/sites/site1/integrations/lionbridge/login?env=prod`);
    expect(calls[0].method).to.equal('POST');
  });

  it('reuses the cached token without refetching while unexpired', async () => {
    installFetch(async () => tokenResponse('token-1'));

    await getAccessToken({ org: 'acme', site: 'site2', env: 'prod' });
    const token = await getAccessToken({ org: 'acme', site: 'site2', env: 'prod' });

    expect(token).to.equal('token-1');
    expect(calls).to.have.length(1);
  });

  it('refetches once the cached token has expired', async () => {
    let call = 0;
    installFetch(async () => {
      call += 1;
      return tokenResponse(`token-${call}`);
    });

    await getAccessToken({ org: 'acme', site: 'site3', env: 'prod' });

    const key = 'lionbridge.acme.site3.prod.token';
    const stored = JSON.parse(localStorage.getItem(key));
    localStorage.setItem(key, JSON.stringify({ ...stored, expires: Date.now() - 1000 }));

    const token = await getAccessToken({ org: 'acme', site: 'site3', env: 'prod' });

    expect(token).to.equal('token-2');
    expect(calls).to.have.length(2);
  });

  it('caches tokens separately per env', async () => {
    installFetch(async (url) => tokenResponse(url.includes('env=stage') ? 'stage-token' : 'prod-token'));

    const prodToken = await getAccessToken({ org: 'acme', site: 'site4', env: 'prod' });
    const stageToken = await getAccessToken({ org: 'acme', site: 'site4', env: 'stage' });

    expect(prodToken).to.equal('prod-token');
    expect(stageToken).to.equal('stage-token');
    expect(calls).to.have.length(2);
  });

  it('defaults env to prod when not specified', async () => {
    installFetch(async () => tokenResponse('token-1'));

    await getAccessToken({ org: 'acme', site: 'site5' });

    expect(calls[0].url).to.include('env=prod');
  });

  it('returns null when the login request fails', async () => {
    installFetch(async () => new Response('', { status: 401 }));

    const token = await getAccessToken({ org: 'acme', site: 'site6', env: 'prod' });

    expect(token).to.equal(null);
  });

  it('returns null when the response has no access_token', async () => {
    installFetch(async () => new Response(JSON.stringify({}), { status: 200 }));

    const token = await getAccessToken({ org: 'acme', site: 'site7', env: 'prod' });

    expect(token).to.equal(null);
  });

  describe('authReady (default export)', () => {
    it('resolves true when a token is obtained', async () => {
      installFetch(async () => tokenResponse('token-1'));

      expect(await authReady({ org: 'acme', site: 'site8', env: 'prod' })).to.equal(true);
    });

    it('resolves false when no token is obtained', async () => {
      installFetch(async () => new Response('', { status: 500 }));

      expect(await authReady({ org: 'acme', site: 'site9', env: 'prod' })).to.equal(false);
    });
  });
});
