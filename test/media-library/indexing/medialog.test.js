import { expect } from '@esm-bundle/chai';
import {
  buildCanonicalTimestampMap,
  buildPageMediaFromMedialog,
  isSourcePageEntry,
  mergeMedialogChunkIntoMap,
  processPageMediaUpdates,
  processSourceMediaUpdates,
  processStandaloneUploads,
  removeOrOrphanMedia,
} from '../../../nx/blocks/media-library/indexing/medialog.js';

describe('medialog indexing', () => {
  const org = 'adobe';
  const repo = 'blog';

  it('mergeMedialogChunkIntoMap marks same-site rows without doc as unused', () => {
    const mediaMap = new Map();
    const rows = mergeMedialogChunkIntoMap(
      [{
        path: 'https://main--blog--adobe.aem.page/media/media_test123.png',
        mediaHash: 'mh1',
        timestamp: 1,
        user: '',
        operation: 'upload',
      }],
      mediaMap,
      org,
      repo,
      '',
    );
    expect(rows).to.have.lengthOf(1);
    expect(rows[0].doc).to.equal('');
  });

  it('mergeMedialogChunkIntoMap marks external rows without doc as unused', () => {
    const mediaMap = new Map();
    const rows = mergeMedialogChunkIntoMap(
      [{
        path: 'https://cdn.example.net/assets/foo.png',
        mediaHash: 'mh2',
        timestamp: 1,
      }],
      mediaMap,
      org,
      repo,
      '',
    );
    expect(rows[0].doc).to.equal('');
  });

  it('processStandaloneUploads records unused for same-site DA upload', () => {
    const idx = [];
    const medialogEntries = [{
      path: 'https://main--blog--adobe.aem.page/media/media_standalone.png',
      mediaHash: 'u1',
      originalFilename: '/assets/products/standalone.png',
      resourcePath: null,
      timestamp: 1,
    }];
    const added = processStandaloneUploads(idx, medialogEntries, new Set(), org, repo);
    expect(added).to.equal(1);
    expect(idx[0].doc).to.equal('');
    expect(idx[0].originalPath).to.equal('/assets/products/standalone.png');
  });

  it('processStandaloneUploads records unused for off-site upload', () => {
    const idx = [];
    const medialogEntries = [{
      path: 'https://othersite.com/blob.png',
      mediaHash: 'u2',
      originalFilename: 'blob.png',
      resourcePath: null,
      timestamp: 1,
    }];
    processStandaloneUploads(idx, medialogEntries, new Set(), org, repo);
    expect(idx[0].doc).to.equal('');
  });

  it('removeOrOrphanMedia re-homes same-site row as unused', () => {
    const idx = [{
      hash: 'h1',
      url: 'https://main--blog--adobe.aem.page/media/orphan.png',
      originalPath: '/assets/icons/orphan.png',
      doc: '/docs/p',
      type: 'image',
    }];
    removeOrOrphanMedia(idx, idx[0], '/docs/p', []);
    expect(idx).to.have.lengthOf(1);
    expect(idx[0].doc).to.equal('');
    expect(idx[0].originalPath).to.equal('/assets/icons/orphan.png');
  });

  it('removeOrOrphanMedia re-homes external row as unused', () => {
    const idx = [{
      hash: 'h2',
      url: 'https://remote.example/p.png',
      doc: '/docs/p',
      type: 'image',
    }];
    removeOrOrphanMedia(idx, idx[0], '/docs/p', []);
    expect(idx[0].doc).to.equal('');
  });

  describe('saved pages (stage source)', () => {
    const img = (hash) => `https://main--blog--adobe.aem.page/media_${hash}.png`;
    const entry = (hash, timestamp, fields = {}) => ({
      operation: 'reuse',
      path: img(hash),
      mediaHash: hash,
      contentType: 'image/png',
      resourcePath: '/post.md',
      timestamp,
      user: 'author@example.com',
      ...fields,
    });
    const saved = (hash, timestamp, fields = {}) => entry(hash, timestamp, { stage: 'source', ...fields });
    const sourceRow = (hash, timestamp) => ({
      hash, url: img(hash), doc: '/post.md', timestamp, type: 'image', stage: 'source',
    });
    const previewRow = (hash, timestamp) => ({
      hash, url: img(hash), doc: '/post.md', timestamp, type: 'image', operation: 'reuse',
    });
    const rows = (idx) => idx
      .map(({ hash, doc, stage, timestamp }) => `${hash} ${doc} ${stage || 'preview'} ${timestamp}`)
      .sort();
    const update = (index, medialog, { existingIndex } = {}) => processSourceMediaUpdates({
      index, medialog, org, repo, existingIndex,
    });

    it('tells page entries of saved sources from the others', () => {
      expect(isSourcePageEntry(saved('1a', 5))).to.equal(true);
      expect(isSourcePageEntry(entry('1a', 5))).to.equal(false);
      expect(isSourcePageEntry(saved('1a', 5, { resourcePath: undefined }))).to.equal(false);
    });

    it('leaves saved pages out of the preview page media', () => {
      const { pageMediaMap } = buildPageMediaFromMedialog([saved('1a', 5), entry('1b', 5)], org, repo);
      expect(pageMediaMap.get('/post.md').entries.map(({ hash }) => hash)).to.deep.equal(['1b']);
      const progressive = mergeMedialogChunkIntoMap([saved('1a', 5), entry('1b', 5)], new Map(), org, repo);
      expect(progressive.map(({ hash }) => hash)).to.deep.equal(['1b']);
    });

    it('lists the images of a saved page that is not previewed', () => {
      const idx = [];
      update(idx, [saved('1a', 5, { operation: 'ingest' }), saved('1b', 5)]);
      expect(rows(idx)).to.deep.equal(['1a /post.md source 5', '1b /post.md source 5']);
      expect(idx[0]).to.include({ type: 'image', user: 'author@example.com', operation: 'ingest' });
      expect(idx[0].url).to.match(/\/media_1a\.png$/);
    });

    it('keeps only the newest save of a page', () => {
      const idx = [sourceRow('1c', 2), { ...previewRow('1c', 1), doc: '/other.md' }];
      update(idx, [saved('1a', 5), saved('1b', 5), saved('1b', 8)]);
      expect(rows(idx)).to.deep.equal(['1a  preview 5', '1b /post.md source 8', '1c /other.md preview 1']);
    });

    it('keeps an image as unused when the newest save removed it from its only page', () => {
      const idx = [sourceRow('1a', 5)];
      update(idx, [saved('1a', 8, { operation: 'unlink', contentType: undefined })]);
      expect(rows(idx)).to.deep.equal(['1a  preview 5']);
    });

    it('keeps an image as unused that an earlier save logged and a later one removed', () => {
      const idx = [];
      update(idx, [
        saved('1a', 5, { operation: 'ingest', originalFilename: 'https://example.com/hero.png' }),
        saved('1b', 8),
        saved('1a', 8, { operation: 'unlink' }),
      ]);
      expect(rows(idx)).to.deep.equal(['1a  preview 5', '1b /post.md source 8']);
      expect(idx.find(({ hash }) => hash === '1a')).to.include({ displayName: 'hero.png' });
    });

    it('keeps the original name of an image from the save that copied it', () => {
      const idx = [];
      update(idx, [
        saved('1a', 5, { operation: 'ingest', originalFilename: 'https://example.com/hero.png' }),
        saved('1a', 8),
        saved('1b', 8),
      ]);
      expect(idx.find(({ hash }) => hash === '1a')).to.include({ displayName: 'hero.png', originalPath: '/hero.png' });
    });

    it('keeps the original name of an image from its existing row', () => {
      const idx = [];
      update(idx, [saved('1a', 8)], {
        existingIndex: new Map([['media_1a.png', { displayName: 'hero.png', originalPath: '/hero.png' }]]),
      });
      expect(idx[0]).to.include({ displayName: 'hero.png', originalPath: '/hero.png' });
    });

    it('leaves out images the preview of the page already has', () => {
      const idx = [previewRow('1a', 3)];
      update(idx, [saved('1a', 5), saved('1b', 5), entry('1a', 3)]);
      expect(rows(idx)).to.deep.equal(['1a /post.md preview 3', '1b /post.md source 5']);
    });

    it('drops saves that a newer preview of the page replaced', () => {
      const idx = [sourceRow('1a', 5), previewRow('1a', 9), { ...sourceRow('1z', 5), doc: '/other.md' }];
      update(idx, [saved('1b', 7), entry('1a', 9)]);
      expect(rows(idx)).to.deep.equal(['1a /post.md preview 9', '1b  preview 7', '1z /other.md source 5']);
    });

    it('gives a previewed image a preview row although it had a source row', () => {
      const idx = [sourceRow('1a', 5)];
      const previewEntries = [entry('1a', 9)];
      processPageMediaUpdates(
        idx,
        new Map([['/post.md', [{ path: '/post', timestamp: 9 }]]]),
        previewEntries,
        new Map([['/post.md', new Set(['1a'])]]),
        () => {},
        org,
        repo,
      );
      update(idx, previewEntries);
      expect(rows(idx)).to.deep.equal(['1a /post.md preview 9']);
    });

    it('keeps an image as unused when a preview removed it, despite an unlink from a save', () => {
      const idx = [previewRow('1a', 3)];
      removeOrOrphanMedia(idx, idx[0], '/post.md', [saved('1a', 8, { operation: 'unlink' })]);
      expect(rows(idx)).to.deep.equal(['1a  preview 3']);
    });

    it('replaces the source row, not the preview row before it', () => {
      const idx = [previewRow('1a', 3), sourceRow('1a', 5)];
      update(idx, [entry('1a', 9)]);
      expect(rows(idx)).to.deep.equal(['1a /post.md preview 3']);
    });

    it('does not count an unlink from a save as activity for the modified time', () => {
      const timestamps = buildCanonicalTimestampMap([
        saved('1a', 5),
        saved('1a', 9, { operation: 'unlink' }),
        entry('1b', 5),
        entry('1b', 9, { operation: 'unlink', resourcePath: undefined }),
      ]);
      expect(timestamps.get('1a')).to.equal(5);
      expect(timestamps.get('1b')).to.equal(9);
    });
  });
});
