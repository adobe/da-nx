import { expect } from '@esm-bundle/chai';
import {
  ensurePreviewLogin,
  getLivePreviewUrl,
  previewCookieHrefs,
  previewLogin,
} from '../../../nx2/utils/utils.js';

const site = { org: 'example', repo: 'site' };

const recordRequests = (ok = () => true) => {
  const calls = [];
  const request = async (href, opts) => {
    calls.push({ href, opts });
    return { ok: ok(href) };
  };
  return { calls, request };
};

describe('getLivePreviewUrl', () => {
  it('builds the site preview origin on main by default', () => {
    expect(getLivePreviewUrl(site)).to.match(/^https?:\/\/main--site--example\.[^/]+$/);
  });

  it('uses the given ref', () => {
    expect(getLivePreviewUrl({ ...site, ref: 'feature' })).to.match(/^https?:\/\/feature--site--example\./);
  });
});

describe('previewLogin', () => {
  it('targets the site preview and the DA content cookie endpoints', () => {
    const [previewHref, contentHref] = previewCookieHrefs(site);
    expect(previewHref).to.equal(`${getLivePreviewUrl(site)}/gimme_cookie`);
    expect(contentHref).to.match(/^https?:\/\/[^/]+\/example\/site\/\.gimme_cookie$/);
  });

  it('exchanges the IMS token for both cookies', async () => {
    const { calls, request } = recordRequests();
    const ok = await previewLogin({ ...site, getToken: async () => 'token', request });
    expect(ok).to.be.true;
    expect(calls.map(({ href }) => href)).to.deep.equal(previewCookieHrefs(site));
    calls.forEach(({ opts }) => {
      expect(opts.credentials).to.equal('include');
      expect(opts.headers.Authorization).to.equal('Bearer token');
    });
  });

  it('skips the exchange without a token', async () => {
    const { calls, request } = recordRequests();
    const ok = await previewLogin({ ...site, getToken: async () => undefined, request });
    expect(ok).to.be.false;
    expect(calls).to.be.empty;
  });

  it('fails when either cookie is refused', async () => {
    const { request } = recordRequests((href) => !href.endsWith('.gimme_cookie'));
    const ok = await previewLogin({ ...site, getToken: async () => 'token', request });
    expect(ok).to.be.false;
  });

  it('fails when the token cannot be loaded', async () => {
    const getToken = async () => { throw new Error('IMS unavailable'); };
    expect(await previewLogin({ ...site, getToken })).to.be.false;
  });
});

describe('ensurePreviewLogin', () => {
  it('logs into a site once for concurrent callers', async () => {
    const calls = [];
    const login = async ({ org, repo }) => {
      calls.push([org, repo]);
      return true;
    };
    const results = await Promise.all([
      ensurePreviewLogin({ org: 'example', repo: 'login-once', login }),
      ensurePreviewLogin({ org: 'example', repo: 'login-once', login }),
    ]);
    expect(results).to.deep.equal([true, true]);
    expect(calls).to.deep.equal([['example', 'login-once']]);
  });

  it('retries a failed login on the next request', async () => {
    let attempts = 0;
    const login = async () => {
      attempts += 1;
      return false;
    };
    expect(await ensurePreviewLogin({ org: 'example', repo: 'login-retry', login })).to.be.false;
    await ensurePreviewLogin({ org: 'example', repo: 'login-retry', login });
    expect(attempts).to.equal(2);
  });

  it('retries a rejected login on the next request', async () => {
    let attempts = 0;
    const login = async () => {
      attempts += 1;
      throw new Error('network');
    };
    expect(await ensurePreviewLogin({ org: 'example', repo: 'login-reject', login })).to.be.false;
    await ensurePreviewLogin({ org: 'example', repo: 'login-reject', login });
    expect(attempts).to.equal(2);
  });
});
