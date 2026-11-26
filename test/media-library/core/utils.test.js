import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { checkSiteAuthRequired, sortMediaData, deduplicateMediaByHash } from '../../../nx/blocks/media-library/core/utils.js';

describe('utils', () => {
  describe('checkSiteAuthRequired', () => {
    const cacheKey = 'auth-test-site-auth-status';
    let originalCache;
    let fetchStub;

    beforeEach(() => {
      originalCache = localStorage.getItem(cacheKey);
      fetchStub = sinon.stub(window, 'fetch');
    });

    afterEach(() => {
      fetchStub.restore();
      if (originalCache === null) localStorage.removeItem(cacheKey);
      else localStorage.setItem(cacheKey, originalCache);
    });

    it('rechecks protection on each opening despite persisted auth results', async () => {
      localStorage.setItem(cacheKey, JSON.stringify({ requiresAuth: false, status: 200 }));
      fetchStub.onFirstCall().resolves(new Response(null, { status: 401 }));
      fetchStub.onSecondCall().resolves(new Response(null, { status: 200 }));

      expect(await checkSiteAuthRequired('auth-test', 'site')).to.deep.equal({
        requiresAuth: true, status: 401,
      });
      localStorage.setItem(cacheKey, JSON.stringify({ requiresAuth: true, status: 401 }));
      expect(await checkSiteAuthRequired('auth-test', 'site')).to.deep.equal({
        requiresAuth: false, status: 200,
      });
      expect(fetchStub.callCount).to.equal(2);
      expect(fetchStub.firstCall.args[1]).to.include({ method: 'HEAD', cache: 'no-store' });
    });

    it('reports inconclusive checks without classifying the site as public and can recover', async () => {
      localStorage.removeItem(cacheKey);
      fetchStub.onFirstCall().rejects(new TypeError('Network unavailable'));
      fetchStub.onSecondCall().resolves(new Response(null, { status: 503 }));
      fetchStub.onThirdCall().resolves(new Response(null, { status: 200 }));

      const networkResult = await checkSiteAuthRequired('auth-test', 'site');
      expect(networkResult.error).to.be.a('string').and.not.equal('');
      expect(networkResult.status).to.equal(0);
      expect(networkResult.requiresAuth).to.equal(undefined);
      const serverResult = await checkSiteAuthRequired('auth-test', 'site');
      expect(serverResult.error).to.be.a('string').and.not.equal('');
      expect(serverResult.status).to.equal(503);
      expect(serverResult.requiresAuth).to.equal(undefined);
      expect(await checkSiteAuthRequired('auth-test', 'site')).to.deep.equal({
        requiresAuth: false, status: 200,
      });
      expect(localStorage.getItem(cacheKey)).to.equal(null);
    });
  });

  describe('sortMediaData', () => {
    it('sorts by modifiedTimestamp descending (newest first)', () => {
      const data = [
        { name: 'a.png', modifiedTimestamp: 1000 },
        { name: 'b.png', modifiedTimestamp: 3000 },
        { name: 'c.png', modifiedTimestamp: 2000 },
      ];
      const sorted = sortMediaData(data);
      expect(sorted[0].name).to.equal('b.png');
      expect(sorted[1].name).to.equal('c.png');
      expect(sorted[2].name).to.equal('a.png');
    });

    it('falls back to timestamp when modifiedTimestamp is missing', () => {
      const data = [
        { name: 'a.png', timestamp: 1000 },
        { name: 'b.png', timestamp: 3000 },
        { name: 'c.png', timestamp: 2000 },
      ];
      const sorted = sortMediaData(data);
      expect(sorted[0].name).to.equal('b.png');
      expect(sorted[1].name).to.equal('c.png');
      expect(sorted[2].name).to.equal('a.png');
    });

    it('prefers modifiedTimestamp over timestamp', () => {
      const data = [
        { name: 'a.png', timestamp: 5000, modifiedTimestamp: 1000 },
        { name: 'b.png', timestamp: 1000, modifiedTimestamp: 3000 },
      ];
      const sorted = sortMediaData(data);
      expect(sorted[0].name).to.equal('b.png');
      expect(sorted[1].name).to.equal('a.png');
    });

    it('handles string timestamps safely', () => {
      const data = [
        { name: 'a.png', timestamp: '1000' },
        { name: 'b.png', timestamp: '3000' },
        { name: 'c.png', timestamp: '2000' },
      ];
      const sorted = sortMediaData(data);
      expect(sorted[0].name).to.equal('b.png');
      expect(sorted[1].name).to.equal('c.png');
      expect(sorted[2].name).to.equal('a.png');
    });

    it('handles invalid timestamps by treating as 0', () => {
      const data = [
        { name: 'a.png', timestamp: 'invalid' },
        { name: 'b.png', timestamp: 1000 },
      ];
      const sorted = sortMediaData(data);
      expect(sorted[0].name).to.equal('b.png');
      expect(sorted[1].name).to.equal('a.png');
    });

    it('tie-breaks by doc path depth (shallower first)', () => {
      const data = [
        { name: 'a.png', timestamp: 1000, doc: '/docs/guides/tutorial' },
        { name: 'b.png', timestamp: 1000, doc: '/docs/intro' },
        { name: 'c.png', timestamp: 1000, doc: '/about' },
      ];
      const sorted = sortMediaData(data);
      expect(sorted[0].name).to.equal('c.png'); // depth 1
      expect(sorted[1].name).to.equal('b.png'); // depth 2
      expect(sorted[2].name).to.equal('a.png'); // depth 3
    });

    it('sorts items without doc after items with doc', () => {
      const data = [
        { name: 'a.png', timestamp: 1000, doc: '/docs' },
        { name: 'b.png', timestamp: 1000 },
        { name: 'c.png', timestamp: 1000, doc: '/about' },
      ];
      const sorted = sortMediaData(data);
      expect(sorted[0].doc).to.exist;
      expect(sorted[1].doc).to.exist;
      expect(sorted[2].doc).to.be.undefined;
    });

    it('tie-breaks by name alphabetically when depth is equal', () => {
      const data = [
        { name: 'zebra.png', timestamp: 1000, doc: '/docs' },
        { name: 'apple.png', timestamp: 1000, doc: '/blog' },
        { name: 'mango.png', timestamp: 1000, doc: '/news' },
      ];
      const sorted = sortMediaData(data);
      expect(sorted[0].name).to.equal('apple.png');
      expect(sorted[1].name).to.equal('mango.png');
      expect(sorted[2].name).to.equal('zebra.png');
    });

    it('handles empty array', () => {
      const sorted = sortMediaData([]);
      expect(sorted).to.deep.equal([]);
    });

    it('does not mutate original array', () => {
      const data = [
        { name: 'b.png', timestamp: 1000 },
        { name: 'a.png', timestamp: 2000 },
      ];
      const original = [...data];
      sortMediaData(data);
      expect(data).to.deep.equal(original);
    });
  });

  describe('deduplicateMediaByHash', () => {
    it('keeps one entry per hash', () => {
      const data = [
        { hash: 'abc123', name: 'image1.png', timestamp: 1000 },
        { hash: 'abc123', name: 'image2.png', timestamp: 2000 },
        { hash: 'def456', name: 'video.mp4', timestamp: 1500 },
      ];
      const deduped = deduplicateMediaByHash(data);
      expect(deduped).to.have.lengthOf(2);
      const hashes = deduped.map((item) => item.hash);
      expect(hashes).to.include('abc123');
      expect(hashes).to.include('def456');
    });

    it('prefers referenced entry over unused entry', () => {
      const data = [
        { hash: 'abc123', name: 'unused.png', doc: '', timestamp: 2000 },
        { hash: 'abc123', name: 'used.png', doc: '/docs/page', timestamp: 1000 },
      ];
      const deduped = deduplicateMediaByHash(data);
      expect(deduped).to.have.lengthOf(1);
      expect(deduped[0].name).to.equal('used.png');
    });

    it('prefers newer timestamp when both referenced', () => {
      const data = [
        { hash: 'abc123', name: 'old.png', doc: '/docs/page1', timestamp: 1000 },
        { hash: 'abc123', name: 'new.png', doc: '/docs/page2', timestamp: 3000 },
      ];
      const deduped = deduplicateMediaByHash(data);
      expect(deduped).to.have.lengthOf(1);
      expect(deduped[0].name).to.equal('new.png');
    });

    it('prefers newer timestamp when both unused', () => {
      const data = [
        { hash: 'abc123', name: 'old.png', doc: '', timestamp: 1000 },
        { hash: 'abc123', name: 'new.png', doc: '', timestamp: 3000 },
      ];
      const deduped = deduplicateMediaByHash(data);
      expect(deduped).to.have.lengthOf(1);
      expect(deduped[0].name).to.equal('new.png');
    });

    it('uses modifiedTimestamp over timestamp for comparison', () => {
      const data = [
        { hash: 'abc123', name: 'old.png', doc: '/page', timestamp: 5000, modifiedTimestamp: 1000 },
        { hash: 'abc123', name: 'new.png', doc: '/page', timestamp: 1000, modifiedTimestamp: 3000 },
      ];
      const deduped = deduplicateMediaByHash(data);
      expect(deduped).to.have.lengthOf(1);
      expect(deduped[0].name).to.equal('new.png');
    });

    it('skips entries without hash', () => {
      const data = [
        { hash: '', name: 'no-hash.png', timestamp: 1000 },
        { hash: 'abc123', name: 'with-hash.png', timestamp: 2000 },
        { name: 'missing-hash.png', timestamp: 1500 },
      ];
      const deduped = deduplicateMediaByHash(data);
      expect(deduped).to.have.lengthOf(1);
      expect(deduped[0].name).to.equal('with-hash.png');
    });

    it('handles empty array', () => {
      const deduped = deduplicateMediaByHash([]);
      expect(deduped).to.deep.equal([]);
    });

    it('handles null/undefined input', () => {
      expect(deduplicateMediaByHash(null)).to.deep.equal([]);
      expect(deduplicateMediaByHash(undefined)).to.deep.equal([]);
    });

    it('keeps order stable when no duplicates', () => {
      const data = [
        { hash: 'hash1', name: 'a.png', timestamp: 1000 },
        { hash: 'hash2', name: 'b.png', timestamp: 2000 },
        { hash: 'hash3', name: 'c.png', timestamp: 3000 },
      ];
      const deduped = deduplicateMediaByHash(data);
      expect(deduped).to.have.lengthOf(3);
      expect(deduped.map((i) => i.name)).to.deep.equal(['a.png', 'b.png', 'c.png']);
    });
  });
});
