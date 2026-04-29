import { expect } from '@esm-bundle/chai';
import { toExternalMediaEntry } from '../../../nx/blocks/media-library/indexing/parse.js';

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
});
