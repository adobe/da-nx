import { expect } from '@esm-bundle/chai';
import { ensureLivePreviewLogin } from '../../nx/utils/utils.js';

describe('ensureLivePreviewLogin', () => {
  it('logs into a site preview once for concurrent callers', async () => {
    const calls = [];
    const login = async (org, repo, ref) => {
      calls.push([org, repo, ref]);
      return true;
    };
    const results = await Promise.all([
      ensureLivePreviewLogin({ org: 'example', repo: 'login-once', login }),
      ensureLivePreviewLogin({ org: 'example', repo: 'login-once', login }),
    ]);
    expect(results).to.deep.equal([true, true]);
    expect(calls).to.deep.equal([['example', 'login-once', 'main']]);
  });

  it('logs in separately per ref', async () => {
    const calls = [];
    const login = async (org, repo, ref) => {
      calls.push(ref);
      return true;
    };
    await ensureLivePreviewLogin({ org: 'example', repo: 'login-refs', login });
    await ensureLivePreviewLogin({ org: 'example', repo: 'login-refs', ref: 'feature', login });
    expect(calls).to.deep.equal(['main', 'feature']);
  });

  it('retries a failed login on the next request', async () => {
    let attempts = 0;
    const login = async () => {
      attempts += 1;
      return false;
    };
    expect(await ensureLivePreviewLogin({ org: 'example', repo: 'login-retry', login })).to.be.false;
    await ensureLivePreviewLogin({ org: 'example', repo: 'login-retry', login });
    expect(attempts).to.equal(2);
  });

  it('retries a rejected login on the next request', async () => {
    let attempts = 0;
    const login = async () => {
      attempts += 1;
      throw new Error('network');
    };
    expect(await ensureLivePreviewLogin({ org: 'example', repo: 'login-reject', login })).to.be.false;
    await ensureLivePreviewLogin({ org: 'example', repo: 'login-reject', login });
    expect(attempts).to.equal(2);
  });
});
