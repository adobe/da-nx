import { expect } from '@esm-bundle/chai';
import { isInternalToSite, getDedupeKey } from '../../../nx/blocks/media-library/core/urls.js';

describe('urls', () => {
  describe('isInternalToSite', () => {
    const org = 'adobe';
    const repo = 'blog';

    it('returns true for repo-relative path', () => {
      expect(isInternalToSite('/docs/guide', org, repo)).to.be.true;
    });

    it('returns true for same org/repo .aem.page URL', () => {
      expect(isInternalToSite('https://main--blog--adobe.aem.page/docs', org, repo)).to.be.true;
    });

    it('returns true for same org/repo .aem.live URL', () => {
      expect(isInternalToSite('https://main--blog--adobe.aem.live/media/image.png', org, repo)).to.be.true;
    });

    it('returns true for URL with org/repo in path', () => {
      expect(isInternalToSite('https://example.com/adobe/blog/media/image.png', org, repo)).to.be.true;
    });

    it('returns true for www.adobe.com internal paths', () => {
      expect(isInternalToSite('https://www.adobe.com/products/photoshop.html', org, repo)).to.be.true;
    });

    it('returns false for www.adobe.com /etc/ paths', () => {
      expect(isInternalToSite('https://www.adobe.com/etc/designs/image.png', org, repo)).to.be.false;
    });

    it('returns false for www.adobe.com /content/dam/ paths', () => {
      expect(isInternalToSite('https://www.adobe.com/content/dam/image.png', org, repo)).to.be.false;
    });

    it('returns false for different repo on .aem.page', () => {
      expect(isInternalToSite('https://main--other--adobe.aem.page/docs', org, repo)).to.be.false;
    });

    it('returns false for different org on .aem.page', () => {
      expect(isInternalToSite('https://main--blog--other.aem.page/docs', org, repo)).to.be.false;
    });

    it('returns false for third-party URL', () => {
      expect(isInternalToSite('https://youtube.com/watch?v=abc', org, repo)).to.be.false;
    });

    it('returns false for protocol-relative URL', () => {
      expect(isInternalToSite('//cdn.example.com/image.png', org, repo)).to.be.false;
    });

    it('returns false when missing org or repo', () => {
      expect(isInternalToSite('/docs/guide', null, repo)).to.be.false;
      expect(isInternalToSite('/docs/guide', org, null)).to.be.false;
      expect(isInternalToSite('/docs/guide', '', repo)).to.be.false;
    });

    it('returns false for empty or null URL', () => {
      expect(isInternalToSite('', org, repo)).to.be.false;
      expect(isInternalToSite(null, org, repo)).to.be.false;
    });
  });

  describe('getDedupeKey', () => {
    it('returns media hash basename for hashed media URL', () => {
      const url = 'https://main--blog--adobe.aem.live/media/media_123abc456def.png';
      const key = getDedupeKey(url);
      expect(key).to.equal('media_123abc456def.png');
    });

    it('returns media hash basename with query params', () => {
      const url = 'https://main--blog--adobe.aem.live/media/media_abc123.png?width=2000';
      const key = getDedupeKey(url);
      expect(key).to.equal('media_abc123.png');
    });

    it('returns pathname for non-hashed internal path', () => {
      const url = 'https://main--blog--adobe.aem.live/docs/image.png';
      const key = getDedupeKey(url);
      expect(key).to.equal('/docs/image.png');
    });

    it('returns pathname for relative path', () => {
      const url = '/media/logo.svg';
      const key = getDedupeKey(url);
      expect(key).to.equal('/media/logo.svg');
    });

    it('returns pathname without query params for non-hashed URLs', () => {
      const url = 'https://example.com/assets/video.mp4?autoplay=1';
      const key = getDedupeKey(url);
      expect(key).to.equal('/assets/video.mp4');
    });

    it('returns empty string for empty URL', () => {
      expect(getDedupeKey('')).to.equal('');
      expect(getDedupeKey(null)).to.equal('');
    });

    it('handles malformed URLs gracefully', () => {
      const url = 'not-a-valid-url';
      const key = getDedupeKey(url);
      expect(key).to.equal('not-a-valid-url');
    });
  });
});
