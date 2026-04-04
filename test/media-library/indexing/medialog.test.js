import { expect } from '@esm-bundle/chai';
import {
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
});
