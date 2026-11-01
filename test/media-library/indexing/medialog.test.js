import { expect } from '@esm-bundle/chai';
import {
  buildPageMediaFromMedialog,
  mergeMedialogChunkIntoMap,
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

  it('processStandaloneUploads names rows of the image that only have its hash as name', () => {
    const idx = [{
      hash: '1a2b',
      url: 'https://main--blog--adobe.aem.page/media_1a2b.png',
      doc: '/drafts/post.md',
      displayName: 'media_1a2b.png',
      type: 'image',
    }, {
      hash: '1a2b',
      url: 'https://main--blog--adobe.aem.page/media_1a2b.png',
      doc: '/drafts/other.md',
      displayName: 'hero.png',
      type: 'image',
    }];
    const medialogEntries = [{
      path: 'https://main--blog--adobe.aem.page/media_1a2b.png',
      mediaHash: '1a2b',
      originalFilename: '/drafts/.post/photo.png',
      resourcePath: null,
      timestamp: 1,
    }];
    processStandaloneUploads(idx, medialogEntries, new Set(['1a2b']), org, repo);
    expect(idx).to.have.lengthOf(2);
    expect(idx[0].displayName).to.equal('photo.png');
    expect(idx[1].displayName).to.equal('hero.png');
  });

  it('processStandaloneUploads keeps a hash name the row has from its own file', () => {
    const idx = [{
      hash: '1a2b',
      url: 'https://main--blog--adobe.aem.page/media_1a2b.png',
      originalPath: '/drafts/.post/media_1a2b.png',
      doc: '/drafts/post.md',
      displayName: 'media_1a2b.png',
      type: 'image',
    }];
    const medialogEntries = [{
      path: 'https://main--blog--adobe.aem.page/media_1a2b.png',
      mediaHash: '1a2b',
      originalFilename: '/drafts/.post/photo.png',
      resourcePath: null,
      timestamp: 1,
    }];
    processStandaloneUploads(idx, medialogEntries, new Set(['1a2b']), org, repo);
    expect(idx[0].displayName).to.equal('media_1a2b.png');
  });

  it('processStandaloneUploads names rows after the first upload', () => {
    const idx = [{
      hash: '1a2b',
      url: 'https://main--blog--adobe.aem.page/media_1a2b.png',
      doc: '/drafts/post.md',
      displayName: 'media_1a2b.png',
      type: 'image',
    }];
    const medialogEntries = [{
      path: 'https://main--blog--adobe.aem.page/media_1a2b.png',
      mediaHash: '1a2b',
      originalFilename: '/img/copy.png',
      resourcePath: null,
      timestamp: 2,
    }, {
      path: 'https://main--blog--adobe.aem.page/media_1a2b.png',
      mediaHash: '1a2b',
      originalFilename: '/drafts/.post/photo.png',
      resourcePath: null,
      timestamp: 1,
    }];
    processStandaloneUploads(idx, medialogEntries, new Set(['1a2b']), org, repo);
    expect(idx[0].displayName).to.equal('photo.png');
  });

  it('processStandaloneUploads adds the unused row from the first upload', () => {
    const idx = [];
    const medialogEntries = [{
      path: 'https://main--blog--adobe.aem.page/media_1a2b.png',
      mediaHash: '1a2b',
      originalFilename: '/img/copy.png',
      resourcePath: null,
      timestamp: 2,
    }, {
      path: 'https://main--blog--adobe.aem.page/media_1a2b.png',
      mediaHash: '1a2b',
      originalFilename: '/drafts/.post/photo.png',
      resourcePath: null,
      timestamp: 1,
    }];
    processStandaloneUploads(idx, medialogEntries, new Set(), org, repo);
    expect(idx).to.have.lengthOf(1);
    expect(idx[0].displayName).to.equal('photo.png');
    expect(idx[0].originalPath).to.equal('/drafts/.post/photo.png');
  });

  it('processStandaloneUploads matches rows by URL, not by their hash field', () => {
    const idx = [{
      hash: '1a2b',
      url: 'https://main--blog--adobe.aem.page/media_3c4d.png',
      doc: '/drafts/post.md',
      displayName: 'media_3c4d.png',
      type: 'image',
    }, {
      hash: '1a2b',
      url: 'https://main--blog--adobe.aem.page/media_1a2b.png',
      doc: '/drafts/other.md',
      displayName: 'media_1a2b.png',
      type: 'image',
    }];
    const medialogEntries = [{
      path: 'https://main--blog--adobe.aem.page/media_1a2b.png',
      originalFilename: '/drafts/.post/photo.png',
      resourcePath: null,
      timestamp: 1,
    }];
    processStandaloneUploads(idx, medialogEntries, new Set(['1a2b']), org, repo);
    expect(idx[0].displayName).to.equal('media_3c4d.png');
    expect(idx[1].displayName).to.equal('photo.png');
  });

  it('processStandaloneUploads does not scan the index once per upload', () => {
    let reads = 0;
    const idx = Array.from({ length: 100 }, (_, i) => ({
      get hash() {
        reads += 1;
        return `${i}`;
      },
      doc: '/drafts/post.md',
      displayName: 'photo.png',
    }));
    const medialogEntries = Array.from({ length: 100 }, (_, i) => ({
      path: `https://main--blog--adobe.aem.page/media_${i}a.png`,
      mediaHash: `${i}`,
      originalFilename: '/drafts/.post/photo.png',
      resourcePath: null,
      timestamp: 1,
    }));
    processStandaloneUploads(idx, medialogEntries, new Set(idx.map((_, i) => `${i}`)), org, repo);
    expect(reads).to.be.at.most(100);
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

  it('buildPageMediaFromMedialog names a page row after the upload of the same image', () => {
    const { pageMediaMap } = buildPageMediaFromMedialog([{
      path: 'https://main--blog--adobe.aem.page/media_1a2b.png#width=800&height=600',
      mediaHash: '1a2b',
      originalFilename: '/drafts/.post/photo.png',
      operation: 'ingest',
      timestamp: 1,
    }, {
      path: 'https://main--blog--adobe.aem.page/media_1a2b.png#width=800&height=600',
      mediaHash: '1a2b',
      resourcePath: '/drafts/post.md',
      operation: 'reuse',
      timestamp: 2,
    }], org, repo);
    expect(pageMediaMap.get('/drafts/post.md').entries[0].displayName).to.equal('photo.png');
  });

  it('buildPageMediaFromMedialog keeps the name a page row has from its own entry', () => {
    const { pageMediaMap } = buildPageMediaFromMedialog([{
      path: 'https://main--blog--adobe.aem.page/media_1a2b.png',
      mediaHash: '1a2b',
      originalFilename: '/drafts/.post/photo.png',
      operation: 'ingest',
      timestamp: 1,
    }, {
      path: 'https://main--blog--adobe.aem.page/media_1a2b.png',
      mediaHash: '1a2b',
      originalFilename: 'https://content.da.live/adobe/blog/drafts/.post/hero.png',
      resourcePath: '/drafts/post.md',
      operation: 'reuse',
      timestamp: 2,
    }], org, repo);
    expect(pageMediaMap.get('/drafts/post.md').entries[0].displayName).to.equal('hero.png');
  });

  it('buildPageMediaFromMedialog keeps a hash name the page row has from its own entry', () => {
    const { pageMediaMap } = buildPageMediaFromMedialog([{
      path: 'https://main--blog--adobe.aem.page/media_1a2b.png',
      mediaHash: '1a2b',
      originalFilename: '/drafts/.post/photo.png',
      operation: 'ingest',
      timestamp: 1,
    }, {
      path: 'https://main--blog--adobe.aem.page/media_1a2b.png',
      mediaHash: '1a2b',
      originalFilename: 'https://content.da.live/adobe/blog/drafts/.post/media_1a2b.png',
      resourcePath: '/drafts/post.md',
      operation: 'reuse',
      timestamp: 2,
    }], org, repo);
    expect(pageMediaMap.get('/drafts/post.md').entries[0].displayName).to.equal('media_1a2b.png');
  });

  it('buildPageMediaFromMedialog keeps the name of the existing index row', () => {
    const { pageMediaMap } = buildPageMediaFromMedialog([{
      path: 'https://main--blog--adobe.aem.page/media_1a2b.png',
      mediaHash: '1a2b',
      originalFilename: '/drafts/.post/photo.png',
      operation: 'ingest',
      timestamp: 3,
    }, {
      path: 'https://main--blog--adobe.aem.page/media_1a2b.png',
      mediaHash: '1a2b',
      resourcePath: '/drafts/post.md',
      operation: 'reuse',
      timestamp: 4,
    }], org, repo, new Map([['media_1a2b.png', { displayName: 'kept.png' }]]));
    expect(pageMediaMap.get('/drafts/post.md').entries[0].displayName).to.equal('kept.png');
  });

  it('buildPageMediaFromMedialog uses the name of the first upload', () => {
    const { pageMediaMap } = buildPageMediaFromMedialog([{
      path: 'https://main--blog--adobe.aem.page/media_1a2b.png',
      mediaHash: '1a2b',
      originalFilename: '/img/copy.png',
      operation: 'ingest',
      timestamp: 2,
    }, {
      path: 'https://main--blog--adobe.aem.page/media_1a2b.png',
      mediaHash: '1a2b',
      originalFilename: '/drafts/.post/photo.png',
      operation: 'ingest',
      timestamp: 1,
    }, {
      path: 'https://main--blog--adobe.aem.page/media_1a2b.png',
      mediaHash: '1a2b',
      resourcePath: '/drafts/post.md',
      operation: 'reuse',
      timestamp: 3,
    }], org, repo);
    expect(pageMediaMap.get('/drafts/post.md').entries[0].displayName).to.equal('photo.png');
  });

  it('buildPageMediaFromMedialog ignores uploads named after their hash', () => {
    const { pageMediaMap } = buildPageMediaFromMedialog([{
      path: 'https://main--blog--adobe.aem.page/media_1a2b.png',
      mediaHash: '1a2b',
      originalFilename: '/media_1a2b.png',
      operation: 'ingest',
      timestamp: 1,
    }, {
      path: 'https://main--blog--adobe.aem.page/media_1a2b.png',
      mediaHash: '1a2b',
      resourcePath: '/drafts/post.md',
      operation: 'reuse',
      timestamp: 2,
    }], org, repo);
    expect(pageMediaMap.get('/drafts/post.md').entries[0].displayName).to.equal('media_1a2b.png');
  });
});
