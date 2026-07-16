import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { DA_ADMIN } from '../../nx2/utils/utils.js';
import { fetchMsmRows, getSourceChain, fetchWithMsmFallback } from '../../nx/blocks/loc/utils/msm.js';

const DA_PATH = '/en/about.html';

function makeResp(status, body = '') {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

function stubFetch({ org, config, sources = {} }) {
  globalThis.fetch = sinon.stub().callsFake((url) => {
    if (url.includes('/config/')) {
      if (typeof config === 'number') return Promise.resolve(makeResp(config));
      return Promise.resolve(makeResp(200, { msm: { data: config || [] } }));
    }
    const site = Object.keys(sources).find((s) => url.includes(`/source/${org}/${s}/`));
    const status = site ? sources[site] : 404;
    return Promise.resolve(makeResp(status, status === 200 ? '<main>content</main>' : ''));
  });
}

const configCalls = () => globalThis.fetch.args.filter(([url]) => url.includes('/config/'));

describe('msm', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    sinon.restore();
  });

  describe('getSourceChain', () => {
    it('returns an empty chain when the linked site has no source', () => {
      const rows = [{ source: 'source-site', linked: 'linked-site' }];
      expect(getSourceChain(rows, 'unrelated-site')).to.deep.equal([]);
    });

    it('resolves the source of a linked site', () => {
      const rows = [{ source: 'source-site', linked: 'linked-site' }];
      expect(getSourceChain(rows, 'linked-site')).to.deep.equal(['source-site']);
    });

    it('walks a multi-level chain nearest-source-first', () => {
      const rows = [
        { source: 'source-site', linked: 'mid-site' },
        { source: 'mid-site', linked: 'linked-site' },
      ];
      expect(getSourceChain(rows, 'linked-site')).to.deep.equal(['mid-site', 'source-site']);
    });

    it('guards against cycles without looping forever', () => {
      const rows = [
        { source: 'site-a', linked: 'site-b' },
        { source: 'site-b', linked: 'site-a' },
      ];
      expect(getSourceChain(rows, 'site-a')).to.deep.equal(['site-b', 'site-a']);
    });

    it('supports the legacy base/satellite column names', () => {
      const rows = [{ base: 'source-site', satellite: 'linked-site' }];
      expect(getSourceChain(rows, 'linked-site')).to.deep.equal(['source-site']);
    });

    it('falls back to the alternate column when a cell is blank', () => {
      const rows = [{ base: '', source: 'source-site', satellite: '', linked: 'linked-site' }];
      expect(getSourceChain(rows, 'linked-site')).to.deep.equal(['source-site']);
    });
  });

  describe('fetchMsmRows', () => {
    it('returns the msm sheet rows on a successful config fetch', async () => {
      const rows = [{ source: 'source-site', linked: 'linked-site' }];
      stubFetch({ org: 'rows-ok', config: rows });
      expect(await fetchMsmRows('rows-ok')).to.deep.equal(rows);
    });

    it('returns [] when the config has no msm sheet', async () => {
      globalThis.fetch = sinon.stub().resolves(makeResp(200, { other: { data: [] } }));
      expect(await fetchMsmRows('rows-nomsm')).to.deep.equal([]);
    });

    it('memoizes a successful lookup (one config fetch for repeat calls)', async () => {
      stubFetch({ org: 'rows-memo', config: [{ source: 'source-site', linked: 'linked-site' }] });
      await fetchMsmRows('rows-memo');
      await fetchMsmRows('rows-memo');
      expect(configCalls().length).to.equal(1);
    });

    it('caches an absent config (404) so non-MSM orgs are not re-probed', async () => {
      stubFetch({ org: 'rows-404', config: 404 });
      expect(await fetchMsmRows('rows-404')).to.deep.equal([]);
      await fetchMsmRows('rows-404');
      expect(configCalls().length).to.equal(1);
    });

    it('does not cache a transient failure (500) so a later call retries', async () => {
      stubFetch({ org: 'rows-500', config: 500 });
      expect(await fetchMsmRows('rows-500')).to.deep.equal([]);
      await fetchMsmRows('rows-500');
      expect(configCalls().length).to.equal(2);
    });
  });

  describe('fetchWithMsmFallback', () => {
    it('returns the linked-site response without consulting MSM when the file exists', async () => {
      stubFetch({ org: 'self-ok', sources: { 'linked-site': 200 } });
      const result = await fetchWithMsmFallback({ org: 'self-ok', site: 'linked-site', daPath: DA_PATH });
      expect(result.resp.ok).to.equal(true);
      expect(result.resolvedSite).to.equal('linked-site');
      expect(result.inherited).to.equal(false);
      expect(configCalls().length).to.equal(0);
    });

    it('resolves an inherited page from its source site', async () => {
      stubFetch({
        org: 'inherit',
        config: [{ source: 'source-site', linked: 'linked-site' }],
        sources: { 'source-site': 200 },
      });
      const result = await fetchWithMsmFallback({ org: 'inherit', site: 'linked-site', daPath: DA_PATH });
      expect(result.resp.ok).to.equal(true);
      expect(result.resolvedSite).to.equal('source-site');
      expect(result.inherited).to.equal(true);
    });

    it('walks multiple source sites until one holds the file', async () => {
      stubFetch({
        org: 'multi',
        config: [
          { source: 'source-site', linked: 'mid-site' },
          { source: 'mid-site', linked: 'linked-site' },
        ],
        sources: { 'source-site': 200 },
      });
      const result = await fetchWithMsmFallback({ org: 'multi', site: 'linked-site', daPath: DA_PATH });
      expect(result.resolvedSite).to.equal('source-site');
      expect(result.inherited).to.equal(true);
    });

    it('returns the linked-site 404 when there is no MSM config', async () => {
      stubFetch({ org: 'no-config', config: 404 });
      const result = await fetchWithMsmFallback({ org: 'no-config', site: 'linked-site', daPath: DA_PATH });
      expect(result.resp.status).to.equal(404);
      expect(result.resolvedSite).to.equal('linked-site');
      expect(result.inherited).to.equal(false);
    });

    it('returns the linked-site 404 when no source site holds the file', async () => {
      stubFetch({ org: 'none-have', config: [{ source: 'source-site', linked: 'linked-site' }] });
      const result = await fetchWithMsmFallback({ org: 'none-have', site: 'linked-site', daPath: DA_PATH });
      expect(result.resp.status).to.equal(404);
      expect(result.resolvedSite).to.equal('linked-site');
      expect(result.inherited).to.equal(false);
    });

    it('does not fall back on a non-404 error and surfaces the real status', async () => {
      stubFetch({
        org: 'forbidden',
        config: [{ source: 'source-site', linked: 'linked-site' }],
        sources: { 'linked-site': 403, 'source-site': 200 },
      });
      const result = await fetchWithMsmFallback({ org: 'forbidden', site: 'linked-site', daPath: DA_PATH });
      expect(result.resp.status).to.equal(403);
      expect(result.resolvedSite).to.equal('linked-site');
      expect(result.inherited).to.equal(false);
      // A permission/server error must not trigger a source-site read.
      expect(configCalls().length).to.equal(0);
    });

    it('requests the linked site then the source site at the expected DA path', async () => {
      stubFetch({
        org: 'url-check',
        config: [{ source: 'source-site', linked: 'linked-site' }],
        sources: { 'source-site': 200 },
      });
      await fetchWithMsmFallback({ org: 'url-check', site: 'linked-site', daPath: DA_PATH });
      const requested = globalThis.fetch.args.map(([url]) => url);
      expect(requested).to.include(`${DA_ADMIN}/source/url-check/linked-site${DA_PATH}`);
      expect(requested).to.include(`${DA_ADMIN}/source/url-check/source-site${DA_PATH}`);
    });

    it('forwards fetch opts (headers) to the source request', async () => {
      stubFetch({ org: 'opts', sources: { 'linked-site': 200 } });
      const opts = { headers: { 'Cache-Control': 'no-cache' } };
      await fetchWithMsmFallback({ org: 'opts', site: 'linked-site', daPath: DA_PATH, opts });
      const sourceCall = globalThis.fetch.args.find(([url]) => url.includes('/source/opts/linked-site/'));
      expect(sourceCall[1].headers['Cache-Control']).to.equal('no-cache');
    });
  });
});
