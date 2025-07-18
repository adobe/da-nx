import { expect } from '@esm-bundle/chai';
import { getImageAltFragmentUrls, getFragmentUrls } from '../../nx/blocks/loc/views/validate/validate-utils.js';

describe('validate-utils', () => {
  describe('getImageAltFragmentUrls', () => {
    it('extracts fragment URLs from image alt attributes', () => {
      const parser = new DOMParser();
      const html = `
        <html>
          <body>
            <img alt="https://main--site--adobecom.aem.page/fragments/video#xf | Video description | :play-medium:" />
            <img alt="https://main--site--adobecom.aem.page/fragments/banner#xf | Banner description" />
            <img alt="Regular image description" />
          </body>
        </html>
      `;
      const dom = parser.parseFromString(html, 'text/html');
      const urls = getImageAltFragmentUrls(dom);
      expect(urls).to.have.length(2);
      expect(urls[0]).to.include('/fragments/video');
      expect(urls[1]).to.include('/fragments/banner');
    });

    it('returns empty array if no image alts with fragments', () => {
      const parser = new DOMParser();
      const html = '<html><body><img alt="No fragment here" /></body></html>';
      const dom = parser.parseFromString(html, 'text/html');
      const urls = getImageAltFragmentUrls(dom);
      expect(urls).to.have.length(0);
    });
  });

  describe('extractFragmentUrls', () => {
    it('extracts fragment URLs from anchors and image alts', () => {
      const html = `
        <html>
          <body>
            <a href="https://main--site--adobecom.aem.page/fragments/header">Header</a>
            <a href="https://main--site--adobecom.aem.page/fragments/footer">Footer</a>
            <img alt="https://main--site--adobecom.aem.page/fragments/video#xf | Video description" />
            <img alt="Regular image description" />
          </body>
        </html>
      `;
      const urls = getFragmentUrls(html);
      expect(urls).to.include('https://main--site--adobecom.aem.page/fragments/header');
      expect(urls).to.include('https://main--site--adobecom.aem.page/fragments/footer');
      expect(urls).to.include('https://main--site--adobecom.aem.page/fragments/video#xf ');
      expect(urls).to.have.length(3);
    });

    it('returns empty array if no fragments found', () => {
      const html = '<html><body><a href="/not-a-fragment">Not a fragment</a></body></html>';
      const urls = getFragmentUrls(html);
      expect(urls).to.have.length(0);
    });
  });
});
