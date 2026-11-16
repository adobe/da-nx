import { expect } from '@esm-bundle/chai';
import { setImsDetails } from '../../../nx/utils/daFetch.js';
import {
  DA_RATE_LIMIT, DA_RETRY, daFetchWithRetry, saveSourceWithRetry, updateProject,
} from '../../../nx/blocks/loc/utils/utils.js';

const ORIGINAL_RETRY = { ...DA_RETRY };

function respond(status, headers = {}) {
  return new Response(status === 200 ? '{}' : '', { status, headers });
}

describe('DA retries', () => {
  let originalFetch;
  let calls;

  function installFetch(handler) {
    globalThis.fetch = async (url, opts) => {
      const href = String(url);
      if (href.includes('/ping/')) return respond(200);
      calls.push({ url: href, opts });
      return handler(href, opts, calls.length);
    };
  }

  beforeEach(() => {
    setImsDetails('test-token');
    originalFetch = globalThis.fetch;
    calls = [];
    Object.assign(DA_RETRY, { baseDelayMs: 0, maxDelayMs: 0, maxRetryAfterMs: 0 });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    Object.assign(DA_RETRY, ORIGINAL_RETRY);
  });

  it('retries a 429 and then succeeds', async () => {
    installFetch((url, opts, n) => respond(n === 1 ? 429 : 200, { 'Retry-After': '30' }));
    const resp = await daFetchWithRetry('https://admin.da.live/source/o/s/a.html', { method: 'POST' });
    expect(resp.status).to.equal(200);
    expect(calls).to.have.length(2);
  });

  it('gives up after the configured retries', async () => {
    installFetch(() => respond(503));
    const resp = await daFetchWithRetry('https://admin.da.live/source/o/s/a.html');
    expect(resp.status).to.equal(503);
    expect(calls).to.have.length(ORIGINAL_RETRY.maxRetries + 1);
  });

  [401, 403, 404].forEach((status) => {
    it(`does not retry a ${status}`, async () => {
      installFetch(() => respond(status));
      const resp = await daFetchWithRetry('https://admin.da.live/source/o/s/a.html');
      expect(resp.status).to.equal(status);
      expect(calls).to.have.length(1);
    });
  });

  it('retries a version save', async () => {
    installFetch((url, opts, n) => respond(n === 1 ? 502 : 200));
    const resp = await daFetchWithRetry('https://admin.da.live/versionsource/o/s/a.html', {
      method: 'POST', body: JSON.stringify({ label: 'x' }),
    });
    expect(resp.status).to.equal(200);
    expect(calls).to.have.length(2);
  });

  it('retries a source save with the same body', async () => {
    installFetch((url, opts, n) => respond(n === 1 ? 503 : 200));
    const resp = await saveSourceWithRetry({
      org: 'o', site: 's', path: '/a.html', body: '<body></body>',
    });
    expect(resp.status).to.equal(200);
    expect(calls).to.have.length(2);
    const texts = await Promise.all(calls.map((c) => c.opts.body.get('data').text()));
    expect(texts).to.deep.equal(['<body></body>', '<body></body>']);
  });

  it('retries a project save', async () => {
    installFetch((url, opts, n) => respond(n === 1 ? 500 : 200));
    const { project, message } = await updateProject({
      path: '/.da/translation/active/1',
      updates: { org: 'o', site: 's', title: 'T' },
    });
    expect(message).to.be.undefined;
    expect(project.title).to.equal('T');
    expect(calls).to.have.length(2);
    expect(calls[0].url).to.include('/source/o/s/.da/translation/active/1.json');
  });

  describe('write rate limit', () => {
    const ORIGINAL_LIMIT = { ...DA_RATE_LIMIT };
    afterEach(() => { Object.assign(DA_RATE_LIMIT, ORIGINAL_LIMIT); });

    it('spaces source saves for one site at the rate', async () => {
      Object.assign(DA_RATE_LIMIT, { ratePerSec: 20, burst: 1 });
      installFetch(() => respond(200));
      const times = [];
      await Promise.all([1, 2, 3].map((n) => saveSourceWithRetry({
        org: 'o', site: 'rate', path: `/${n}.html`, body: '',
      }).then(() => times.push(performance.now()))));
      expect(times[2] - times[0]).to.be.at.least(90);
    });

    it('does not limit reads', async () => {
      Object.assign(DA_RATE_LIMIT, { ratePerSec: 1, burst: 1 });
      installFetch(() => respond(200));
      const start = performance.now();
      await Promise.all([1, 2, 3].map((n) => daFetchWithRetry(`https://admin.da.live/source/o/reads/${n}.html`)));
      expect(performance.now() - start).to.be.below(500);
    });

    it('pauses all writes for a site after a 429', async () => {
      Object.assign(DA_RATE_LIMIT, { ratePerSec: 1000, burst: 10, cooldownMs: 150 });
      const times = [];
      installFetch((url, opts, n) => {
        times.push(performance.now());
        return respond(n === 1 ? 429 : 200);
      });
      await daFetchWithRetry('https://admin.da.live/versionsource/o/cool/a.html', { method: 'POST' });
      await saveSourceWithRetry({ org: 'o', site: 'cool', path: '/b.html', body: '' });
      expect(calls).to.have.length(3);
      expect(times[1] - times[0]).to.be.at.least(140);
    });
  });
});
