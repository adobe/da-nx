import { expect } from '@esm-bundle/chai';
import authReady, {
  getAccessToken, hasImsSession, imsAccessToken, imsAuthHeader,
} from '../../../nx/blocks/loc/utils/auth.js';

// Dynamic-expression import (not a literal string) so @web/dev-server-import-maps
// does not rewrite this to ...?wds-import-map=0. See test/nx2/utils/api.test.js.
const imsPath = '../../../nx2/utils/ims.js';
const { setMockIms, resetMockIms } = await import(imsPath);

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

describe('auth', () => {
  beforeEach(() => {
    resetMockIms();
    localStorage.clear();
  });

  afterEach(() => {
    restoreFetch();
    localStorage.clear();
  });

  describe('getAccessToken', () => {
    it('fetches and caches a token on first call', async () => {
      installFetch(async () => tokenResponse('token-1'));

      const token = await getAccessToken('example', { org: 'acme', site: 'site1', env: 'prod' });

      expect(token).to.equal('token-1');
      expect(calls).to.have.length(1);
      expect(calls[0].url).to.equal(`${LOGIN_ORIGIN}/acme/sites/site1/integrations/example/login?env=prod`);
      expect(calls[0].method).to.equal('POST');
      expect(localStorage.getItem('example.acme.site1.prod.token')).to.not.equal(null);
    });

    it('reuses the cached token without refetching while unexpired', async () => {
      installFetch(async () => tokenResponse('token-1'));

      await getAccessToken('example', { org: 'acme', site: 'site2', env: 'prod' });
      const token = await getAccessToken('example', { org: 'acme', site: 'site2', env: 'prod' });

      expect(token).to.equal('token-1');
      expect(calls).to.have.length(1);
    });

    it('refetches once the cached token has expired', async () => {
      let call = 0;
      installFetch(async () => {
        call += 1;
        return tokenResponse(`token-${call}`);
      });

      await getAccessToken('example', { org: 'acme', site: 'site3', env: 'prod' });

      const key = 'example.acme.site3.prod.token';
      const stored = JSON.parse(localStorage.getItem(key));
      localStorage.setItem(key, JSON.stringify({ ...stored, expires: Date.now() - 1000 }));

      const token = await getAccessToken('example', { org: 'acme', site: 'site3', env: 'prod' });

      expect(token).to.equal('token-2');
      expect(calls).to.have.length(2);
    });

    it('caches tokens separately per connector name and per env', async () => {
      installFetch(async () => tokenResponse('token-1'));

      await getAccessToken('trados', { org: 'acme', site: 'site4', env: 'prod' });
      await getAccessToken('lionbridge', { org: 'acme', site: 'site4', env: 'prod' });
      await getAccessToken('trados', { org: 'acme', site: 'site4', env: 'stage' });

      expect(calls).to.have.length(3);
      expect(localStorage.getItem('trados.acme.site4.prod.token')).to.not.equal(null);
      expect(localStorage.getItem('lionbridge.acme.site4.prod.token')).to.not.equal(null);
      expect(localStorage.getItem('trados.acme.site4.stage.token')).to.not.equal(null);
    });

    it('defaults env to prod when not specified', async () => {
      installFetch(async () => tokenResponse('token-1'));

      await getAccessToken('example', { org: 'acme', site: 'site5' });

      expect(calls[0].url).to.include('env=prod');
      expect(localStorage.getItem('example.acme.site5.prod.token')).to.not.equal(null);
    });

    it('returns null when the login request fails', async () => {
      installFetch(async () => new Response('', { status: 401 }));

      const token = await getAccessToken('example', { org: 'acme', site: 'site6', env: 'prod' });

      expect(token).to.equal(null);
    });

    it('returns null when the response has no access_token', async () => {
      installFetch(async () => new Response(JSON.stringify({}), { status: 200 }));

      const token = await getAccessToken('example', { org: 'acme', site: 'site7', env: 'prod' });

      expect(token).to.equal(null);
    });

    it('force bypasses a still-unexpired cached token and logs in again', async () => {
      let call = 0;
      installFetch(async () => {
        call += 1;
        return tokenResponse(`token-${call}`);
      });

      const first = await getAccessToken('example', { org: 'acme', site: 'site10', env: 'prod' });
      const second = await getAccessToken(
        'example',
        { org: 'acme', site: 'site10', env: 'prod' },
        { force: true },
      );

      expect(first).to.equal('token-1');
      expect(second).to.equal('token-2');
      expect(calls).to.have.length(2);
    });
  });

  describe('authReady (default export)', () => {
    it('resolves true when a token is obtained', async () => {
      installFetch(async () => tokenResponse('token-1'));

      expect(await authReady('example', { org: 'acme', site: 'site8', env: 'prod' })).to.equal(true);
    });

    it('resolves false when no token is obtained', async () => {
      installFetch(async () => new Response('', { status: 500 }));

      expect(await authReady('example', { org: 'acme', site: 'site9', env: 'prod' })).to.equal(false);
    });
  });

  describe('imsAccessToken / imsAuthHeader', () => {
    it('resolves the token from the current IMS session', async () => {
      expect(await imsAccessToken()).to.equal('test-token');
    });

    it('resolves null and does not throw when there is no IMS session', async () => {
      setMockIms({ anonymous: true });

      expect(await imsAccessToken()).to.equal(null);
    });

    it('builds an Authorization header from the IMS session', async () => {
      expect(await imsAuthHeader()).to.deep.equal({ Authorization: 'Bearer test-token' });
    });

    it('returns an empty header when there is no IMS session', async () => {
      setMockIms({ anonymous: true });

      expect(await imsAuthHeader()).to.deep.equal({});
    });
  });

  describe('hasImsSession', () => {
    it('resolves true when there is a current IMS session', async () => {
      expect(await hasImsSession()).to.equal(true);
    });

    it('resolves false without throwing or triggering sign-in when there is no IMS session', async () => {
      setMockIms({ anonymous: true });

      expect(await hasImsSession()).to.equal(false);
    });
  });
});
