import { expect } from '@esm-bundle/chai';
import { convertEmbedToWatchUrl } from '../../../nx/blocks/media-library/core/media.js';

describe('media', () => {
  describe('convertEmbedToWatchUrl', () => {
    it('converts YouTube embed URL to watch URL', () => {
      const embedUrl = 'https://www.youtube.com/embed/ABC123';
      const expected = 'https://www.youtube.com/watch?v=ABC123';
      expect(convertEmbedToWatchUrl(embedUrl)).to.equal(expected);
    });

    it('converts YouTube embed URL with query params', () => {
      const embedUrl = 'https://www.youtube.com/embed/ABC123?rel=0&enablejsapi=1';
      const expected = 'https://www.youtube.com/watch?v=ABC123';
      expect(convertEmbedToWatchUrl(embedUrl)).to.equal(expected);
    });

    it('converts Vimeo embed URL to watch URL', () => {
      const embedUrl = 'https://player.vimeo.com/video/123456789';
      const expected = 'https://vimeo.com/123456789';
      expect(convertEmbedToWatchUrl(embedUrl)).to.equal(expected);
    });

    it('converts Vimeo embed URL with query params', () => {
      const embedUrl = 'https://player.vimeo.com/video/123456789?autoplay=1';
      const expected = 'https://vimeo.com/123456789';
      expect(convertEmbedToWatchUrl(embedUrl)).to.equal(expected);
    });

    it('converts Dailymotion embed URL to watch URL', () => {
      const embedUrl = 'https://www.dailymotion.com/embed/video/x8abc123';
      const expected = 'https://www.dailymotion.com/video/x8abc123';
      expect(convertEmbedToWatchUrl(embedUrl)).to.equal(expected);
    });

    it('converts Dailymotion embed URL with query params', () => {
      const embedUrl = 'https://www.dailymotion.com/embed/video/x8abc123?autoplay=1';
      const expected = 'https://www.dailymotion.com/video/x8abc123';
      expect(convertEmbedToWatchUrl(embedUrl)).to.equal(expected);
    });

    it('returns non-embed URL unchanged', () => {
      const regularUrl = 'https://www.youtube.com/watch?v=ABC123';
      expect(convertEmbedToWatchUrl(regularUrl)).to.equal(regularUrl);
    });

    it('returns regular image URL unchanged', () => {
      const imageUrl = 'https://example.com/images/photo.jpg';
      expect(convertEmbedToWatchUrl(imageUrl)).to.equal(imageUrl);
    });

    it('returns regular document URL unchanged', () => {
      const docUrl = 'https://main--site--org.aem.page/docs/guide';
      expect(convertEmbedToWatchUrl(docUrl)).to.equal(docUrl);
    });

    it('returns null for null input', () => {
      expect(convertEmbedToWatchUrl(null)).to.equal(null);
    });

    it('returns undefined for undefined input', () => {
      expect(convertEmbedToWatchUrl(undefined)).to.equal(undefined);
    });

    it('returns empty string for empty string input', () => {
      expect(convertEmbedToWatchUrl('')).to.equal('');
    });
  });
});
