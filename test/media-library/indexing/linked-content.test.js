import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { toExternalMediaEntry, toLinkedContentEntry } from '../../../nx/blocks/media-library/indexing/parse.js';
import { processLinkedContent } from '../../../nx/blocks/media-library/indexing/worker/linked-content.js';
import { processLinkedContent as processMainLinkedContent } from '../../../nx/blocks/media-library/indexing/linked-content.js';

describe('verified linked references', () => {
  [['worker', processLinkedContent], ['main', processMainLinkedContent]].forEach(([mode, process]) => {
    it(`${mode}: reconciles reused media from verified pages and retains unreferenced assets`, async () => {
      const index = [
        { hash: 'abc', url: 'https://main--blog--adobe.aem.live/media_abc.png', doc: '/docs/a.md', type: 'image', operation: 'reuse' },
        { hash: 'def', url: 'https://main--blog--adobe.aem.page/media_def.jpg', doc: '', type: 'image', operation: 'upload' },
      ];
      const usage = {
        images: new Map([
          ['/media_abc.png', ['/docs/b', '/docs/b.md', '/docs/failed.md']],
          ['/media_def.jpg', ['/docs/b.md']],
        ]),
        videos: new Map(),
        svgs: new Map(),
        pdfs: new Map(),
        fragments: new Map(),
        externalMedia: new Map(),
        successfulPages: new Set(['/docs/b.md']),
      };
      const fetchStub = sinon.stub(window, 'fetch').resolves(new Response(null, { status: 200 }));
      const reconcile = () => process(index, [], [], 'adobe', 'blog', 'main', () => {}, () => {}, usage);
      try {
        await reconcile();
        await reconcile();
        expect(index.filter((row) => row.hash === 'abc').map((row) => row.doc))
          .to.have.members(['/docs/a.md', '/docs/b.md']);
        expect(index.filter((row) => row.hash === 'def' && row.doc).map((row) => row.doc))
          .to.deep.equal(['/docs/b.md']);
        usage.images.clear();
        usage.videos.clear();
        await reconcile();
        expect(index.filter((row) => row.doc).map((row) => row.doc)).to.deep.equal(['/docs/a.md']);
        usage.successfulPages = new Set(['/docs/a.md']);
        await reconcile();
        expect(index).to.have.lengthOf(2);
        expect(index.every((row) => row.doc === '')).to.equal(true);
      } finally {
        fetchStub.restore();
      }
    });

    it(`${mode}: uses the latest named preview event without removing hashed media`, async () => {
      const index = [
        toLinkedContentEntry('/media/logo.svg', '', { timestamp: 0 }, 'adobe', 'blog'),
        { hash: 'named-png', url: 'https://main--blog--adobe.aem.page/media/logo.png', doc: '', type: 'image', operation: 'upload' },
        { hash: 'abc', url: 'https://main--blog--adobe.aem.page/media_abc.svg', doc: '/docs/a.md', type: 'image', operation: 'reuse' },
      ];
      const files = [
        { path: '/media/logo.svg', method: 'POST', timestamp: 1 },
        { path: '/media/logo.svg', method: 'DELETE', timestamp: 2 },
        { path: '/media/logo.svg', method: 'POST', timestamp: 3 },
        { path: '/media/logo.png', method: 'POST', timestamp: 1 },
        { path: '/media/logo.png', method: 'DELETE', timestamp: 2 },
        { path: '/media/logo.png', method: 'POST', timestamp: 3 },
        { path: '/media/logo.svg', method: 'DELETE', timestamp: 5, status: 500 },
        { path: '/media/logo.png', method: 'DELETE', timestamp: 5, status: 500 },
      ];
      const usage = {
        images: new Map(),
        videos: new Map(),
        svgs: new Map(),
        pdfs: new Map(),
        fragments: new Map(),
        externalMedia: new Map(),
        successfulPages: new Set(),
      };
      const fetchStub = sinon.stub(window, 'fetch').resolves(new Response(null, { status: 200 }));
      try {
        await process(index, files, [], 'adobe', 'blog', 'main', () => {}, () => {}, usage);
        expect(index).to.have.lengthOf(3);
        files.push({ path: '/media/logo.svg', method: 'DELETE', timestamp: 4 });
        files.push({ path: '/media/logo.png', method: 'DELETE', timestamp: 4 });
        await process(index, files, [], 'adobe', 'blog', 'main', () => {}, () => {}, usage);
        expect(index).to.have.lengthOf(1);
        expect(index[0].doc).to.equal('/docs/a.md');
      } finally {
        fetchStub.restore();
      }
    });

    it(`${mode}: preserves failed/unparsed references and removes a successfully verified empty page`, async () => {
      const updatedIndex = ['/media/logo.svg', '/media_abc123.svg'].flatMap((path) => (
        ['failed', 'empty', 'unchanged'].map((name) => toLinkedContentEntry(path, `/docs/${name}.md`, { timestamp: 0 }, 'adobe', 'blog'))
      ));
      updatedIndex.push(toLinkedContentEntry('/media_def456.svg', '/docs/used.md', { timestamp: 0 }, 'adobe', 'blog'));
      const usageMap = {
        pdfs: new Map(),
        svgs: new Map([['/media_def456.svg', ['/docs/used.md']]]),
        videos: new Map(),
        fragments: new Map(),
        externalMedia: new Map(),
        successfulPages: new Set(['/docs/empty.md', '/docs/used.md']),
      };
      const fetchStub = sinon.stub(window, 'fetch').resolves(new Response(null, { status: 200 }));
      try {
        await process(
          updatedIndex,
          [],
          [{ path: '/docs/failed.md' }, { path: '/docs/empty.md' }],
          'adobe',
          'blog',
          'main',
          () => {},
          () => {},
          usageMap,
        );
        expect(updatedIndex.map((row) => row.doc)).to.have.members([
          '/docs/failed.md', '/docs/unchanged.md', '/docs/failed.md', '/docs/unchanged.md', '/docs/used.md',
        ]);
      } finally {
        fetchStub.restore();
      }
    });
  });
});

describe('external media deduplication', () => {
  describe('toExternalMediaEntry', () => {
    it('creates entry for YouTube video', () => {
      const result = toExternalMediaEntry(
        'https://youtube.com/watch?v=abc123',
        '/path/to/page1',
        1234567890,
        'adobe',
        'da-nx',
      );

      expect(result).to.not.be.null;
      expect(result.hash).to.equal('https://www.youtube.com/watch?v=abc123'); // Normalized
      expect(result.url).to.equal('https://youtube.com/watch?v=abc123'); // Canonical (no normalization for external)
      expect(result.doc).to.equal('/path/to/page1');
      expect(result.type).to.equal('video');
      expect(result.timestamp).to.equal(1234567890);
      expect(result.modifiedTimestamp).to.equal(1234567890);
      expect(result.operation).to.equal('extlinks-parsed');
    });

    it('creates entry for Vimeo video', () => {
      const result = toExternalMediaEntry(
        'https://vimeo.com/123456789',
        '/path/to/page2',
        9876543210,
      );

      expect(result).to.not.be.null;
      expect(result.type).to.equal('video');
      expect(result.hash).to.include('vimeo.com');
      expect(result.doc).to.equal('/path/to/page2');
    });

    it('creates entry for external PDF', () => {
      const result = toExternalMediaEntry(
        'https://example.com/docs/guide.pdf',
        '/path/to/page3',
        1111111111,
      );

      expect(result).to.not.be.null;
      expect(result.type).to.equal('document');
      expect(result.hash).to.include('guide.pdf');
      expect(result.doc).to.equal('/path/to/page3');
    });

    it('returns null for internal AEM URLs', () => {
      const result = toExternalMediaEntry(
        'https://main--blog--adobe.aem.live/media/image.png',
        '/path/to/page',
        1234567890,
      );

      expect(result).to.be.null;
    });

    it('returns null for non-media URLs', () => {
      const result = toExternalMediaEntry(
        'https://adobe.com/products',
        '/path/to/page',
        1234567890,
      );

      expect(result).to.be.null;
    });

    it('handles missing doc parameter', () => {
      const result = toExternalMediaEntry(
        'https://youtube.com/watch?v=test',
        null,
        1234567890,
      );

      expect(result).to.not.be.null;
      expect(result.doc).to.equal('');
    });

    it('handles null/undefined/empty timestamps', () => {
      const result1 = toExternalMediaEntry('https://youtube.com/watch?v=test', '/page', null);
      const result2 = toExternalMediaEntry('https://youtube.com/watch?v=test', '/page', '');

      expect(result1.modifiedTimestamp).to.be.null;
      expect(result2.modifiedTimestamp).to.be.null;
    });

    it('decodes URL-encoded display name', () => {
      const result = toExternalMediaEntry(
        'https://example.com/file%20with%20spaces.pdf',
        '/page',
        1234567890,
      );

      expect(result).to.not.be.null;
      expect(result.displayName).to.equal('file with spaces.pdf');
    });

    it('uses full URL as display name for extension-less videos', () => {
      const result = toExternalMediaEntry(
        'https://youtube.com/watch?v=abc123',
        '/page',
        1234567890,
      );

      expect(result).to.not.be.null;
      // For videos without extension, full URL is used as name
      expect(result.displayName).to.include('youtube.com/watch');
    });

    it('uses consistent hash for deduplication', () => {
      // Same video should produce same hash regardless of minor URL differences
      const result1 = toExternalMediaEntry(
        'https://youtube.com/watch?v=abc123',
        '/page1',
        1111111111,
      );

      const result2 = toExternalMediaEntry(
        'https://www.youtube.com/watch?v=abc123',
        '/page2',
        2222222222,
      );

      expect(result1.hash).to.equal(result2.hash);
    });

    it('normalizes YouTube short URLs for deduplication', () => {
      const result = toExternalMediaEntry(
        'https://youtu.be/xyz789',
        '/page',
        1234567890,
      );

      expect(result).to.not.be.null;
      // Hash normalized to standard youtube.com/watch format for deduplication
      expect(result.hash).to.include('youtube.com/watch');
      expect(result.hash).to.include('xyz789');
    });
  });

  describe('processLinkedContent - incremental external media deduplication', () => {
    it('updates existing entries, removes obsolete ones, avoids duplicates', async () => {
      const youtubeUrl = 'https://youtube.com/watch?v=abc123';
      const normalizedUrl = 'https://www.youtube.com/watch?v=abc123';
      const existingEntry = toExternalMediaEntry(youtubeUrl, '/docs/page1', 1111111111, 'adobe', 'da-nx');
      const obsoleteEntry = toExternalMediaEntry(youtubeUrl, '/docs/old-page', 1111111111, 'adobe', 'da-nx');

      const updatedIndex = [
        existingEntry,
        obsoleteEntry,
      ];

      const usageMap = {
        successfulPages: new Set(['/docs/page1.md', '/docs/page2.md', '/docs/old-page.md']),
        pdfs: new Map(),
        svgs: new Map(),
        videos: new Map(),
        fragments: new Map(),
        externalMedia: new Map([
          [normalizedUrl, {
            pages: ['/docs/page1', '/docs/page2'],
            firstDiscoveredTimestamp: 1111111111,
          }],
        ]),
      };

      // Incremental build: only page1, page2, and old-page were parsed
      // page1: still has reference (update in place)
      // page2: new reference (add)
      // old-page: no longer has reference (remove)
      const pages = [
        { path: '/docs/page1' },
        { path: '/docs/page2' },
        { path: '/docs/old-page' },
      ];

      const result = await processLinkedContent(
        updatedIndex,
        [],
        pages,
        'adobe',
        'da-nx',
        'main',
        null,
        null,
        usageMap,
      );

      expect(result.added).to.equal(1);
      expect(result.removed).to.equal(1);

      const entriesForUrl = updatedIndex.filter((e) => e.hash === normalizedUrl);
      expect(entriesForUrl.length).to.equal(2);

      const page1Entries = updatedIndex.filter((e) => e.hash === normalizedUrl && e.doc === '/docs/page1');
      expect(page1Entries.length).to.equal(1);

      const page2Entries = updatedIndex.filter((e) => e.hash === normalizedUrl && e.doc === '/docs/page2');
      expect(page2Entries.length).to.equal(1);

      const oldPageEntries = updatedIndex.filter((e) => e.hash === normalizedUrl && e.doc === '/docs/old-page');
      expect(oldPageEntries.length).to.equal(0);

      entriesForUrl.forEach((entry) => {
        expect(entry.hash).to.equal(normalizedUrl);
        expect(entry.type).to.equal('video');
        expect(entry.operation).to.equal('extlinks-parsed');
        expect(['/docs/page1', '/docs/page2']).to.include(entry.doc);
      });
    });

    it('preserves entries for unparsed pages in incremental builds', async () => {
      const youtubeUrl = 'https://youtube.com/watch?v=xyz789';
      const normalizedUrl = 'https://www.youtube.com/watch?v=xyz789';

      // Existing entries: page1 and page2 both have the video
      const page1Entry = toExternalMediaEntry(youtubeUrl, '/docs/page1', 1111111111, 'adobe', 'da-nx');
      const page2Entry = toExternalMediaEntry(youtubeUrl, '/docs/page2', 2222222222, 'adobe', 'da-nx');

      const updatedIndex = [page1Entry, page2Entry];

      // Incremental build: only page1 was modified and parsed
      // page1 no longer has the video reference
      // page2 was NOT parsed (unchanged)
      const usageMap = {
        successfulPages: new Set(['/docs/page1.md']),
        pdfs: new Map(),
        svgs: new Map(),
        videos: new Map(),
        fragments: new Map(),
        externalMedia: new Map(),
      };

      const pages = [{ path: '/docs/page1' }];

      const result = await processLinkedContent(
        updatedIndex,
        [],
        pages,
        'adobe',
        'da-nx',
        'main',
        null,
        null,
        usageMap,
      );

      // Should NOT remove page2 entry (page2 was not parsed)
      // Should only remove page1 entry
      expect(result.removed).to.equal(1);

      const remainingEntries = updatedIndex.filter((e) => e.hash === normalizedUrl);
      expect(remainingEntries.length).to.equal(1);
      expect(remainingEntries[0].doc).to.equal('/docs/page2');
    });
  });
});
