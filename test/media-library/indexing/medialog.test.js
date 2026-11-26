import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { buildIncrementalIndex } from '../../../nx/blocks/media-library/indexing/worker/incremental.js';
import {
  mergeMedialogChunkIntoMap,
  processStandaloneUploads,
  processPageMediaUpdates,
  removeOrOrphanMedia,
} from '../../../nx/blocks/media-library/indexing/medialog.js';

describe('medialog indexing', () => {
  const org = 'adobe';
  const repo = 'blog';

  [[], [{ mediaHash: 'abc', operation: 'unlink', path: '/media/logo.png' }]].forEach((entries) => {
    it(`processes preview withdrawals with ${entries.length ? 'a named unlink' : 'no medialog activity'}`, async () => {
      const index = [
        { hash: 'abc', url: 'https://main--blog--adobe.aem.page/media_abc.png', doc: '/docs/a.md', type: 'image' },
        { hash: '/media/logo.svg', url: 'https://main--blog--adobe.aem.page/media/logo.svg', doc: '', type: 'image', operation: 'auditlog-parsed' },
      ];
      const fetchStub = sinon.stub(window, 'fetch').callsFake(async (url, options = {}) => {
        if (options.method === 'POST' || options.method === 'PUT') return new Response(null);
        if (url.includes('index-meta.json')) {
          return Response.json({ data: [{ lastFetchTime: 1, schemaVersion: 2 }] });
        }
        if (url.includes('index.json')) return Response.json({ media: { data: index } });
        if (url.includes('/medialog/')) return Response.json({ entries });
        if (url.includes('/log/')) {
          return Response.json({
            entries: [
              { path: '/docs/a', method: 'DELETE', route: 'preview', timestamp: 2, status: 204 },
              { path: '/docs/a', method: 'POST', route: 'preview', timestamp: 1, status: 200 },
              { path: '/docs/a', method: 'POST', route: 'preview', timestamp: 3, status: 500 },
              { path: '/media/logo.svg', method: 'DELETE', route: 'preview', timestamp: 2, status: 204 },
            ],
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      });
      try {
        const result = await buildIncrementalIndex('/adobe/blog', org, repo, 'main', () => {}, () => {}, null, {
          imsToken: 'test',
          daOrigin: 'https://admin.da.live',
          daEtcOrigin: 'https://etc.example',
        });
        expect(result).to.have.lengthOf(1);
        expect(result[0].hash).to.equal('abc');
        expect(result[0].doc).to.equal('');
      } finally {
        fetchStub.restore();
      }
    });
  });

  it('does not remove document references based on missing medialog entries', () => {
    const index = [{
      hash: 'abc',
      url: 'https://main--blog--adobe.aem.page/media_abc.png',
      doc: '/docs/a.md',
      type: 'image',
      operation: 'reuse',
    }];
    processPageMediaUpdates(
      index,
      new Map([['/docs/a.md', [{ timestamp: 1 }]]]),
      [],
      new Map([['/docs/a.md', new Set(['abc'])]]),
      () => {},
      org,
      repo,
    );
    expect(index[0].doc).to.equal('/docs/a.md');
  });

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
    removeOrOrphanMedia(idx, idx[0], '/docs/p');
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
    removeOrOrphanMedia(idx, idx[0], '/docs/p');
    expect(idx[0].doc).to.equal('');
  });
});
