import { expect } from '@esm-bundle/chai';
import {
  extractExternalMediaUrls,
  extractFragmentReferences,
  extractLinks,
} from '../../../nx/blocks/media-library/core/parse-utils.js';

describe('parse', () => {
  describe('extractExternalMediaUrls', () => {
    describe('from markdown', () => {
      it('extracts external YouTube URLs', () => {
        const md = '[Video](https://youtube.com/watch?v=abc123)';
        const urls = extractExternalMediaUrls(md, false);
        expect(urls).to.include('https://youtube.com/watch?v=abc123');
      });

      it('extracts external YouTube short URLs', () => {
        const md = '![Video](https://youtu.be/xyz789)';
        const urls = extractExternalMediaUrls(md, false);
        expect(urls).to.include('https://youtu.be/xyz789');
      });

      it('extracts external PDF URLs', () => {
        const md = '[Document](https://example.com/docs/guide.pdf)';
        const urls = extractExternalMediaUrls(md, false);
        expect(urls).to.include('https://example.com/docs/guide.pdf');
      });

      it('extracts external video URLs', () => {
        const md = '![Video](https://vimeo.com/123456789)';
        const urls = extractExternalMediaUrls(md, false);
        expect(urls).to.include('https://vimeo.com/123456789');
      });

      it('does not extract internal AEM URLs', () => {
        const md = '![Image](https://main--blog--adobe.aem.live/media/image.png)';
        const urls = extractExternalMediaUrls(md, false);
        expect(urls).to.be.empty;
      });

      it('does not extract relative paths', () => {
        const md = '![Image](/media/image.png)';
        const urls = extractExternalMediaUrls(md, false);
        expect(urls).to.be.empty;
      });

      it('handles markdown autolinks', () => {
        const md = '<https://youtube.com/watch?v=test>';
        const urls = extractExternalMediaUrls(md, false);
        expect(urls).to.include('https://youtube.com/watch?v=test');
      });

      it('does not treat https:// in URL as colon syntax', () => {
        const md = '[Link](https://example.com/video.mp4)';
        const urls = extractExternalMediaUrls(md, false);
        expect(urls).to.have.lengthOf(1);
        expect(urls[0]).to.equal('https://example.com/video.mp4');
      });

      it('deduplicates URLs', () => {
        const md = `
          [Video1](https://youtube.com/watch?v=abc)
          [Video2](https://youtube.com/watch?v=abc)
        `;
        const urls = extractExternalMediaUrls(md, false);
        expect(urls).to.have.lengthOf(1);
      });

      it('ignores malformed URLs with quotes', () => {
        const md = '[Bad](%22https://example.com/file.pdf%22)';
        const urls = extractExternalMediaUrls(md, false);
        expect(urls).to.be.empty;
      });
    });

    describe('from html', () => {
      it('extracts external media from img tags', () => {
        const html = '<img src="https://youtube.com/thumbnail.jpg">';
        const urls = extractExternalMediaUrls(html, true);
        expect(urls).to.include('https://youtube.com/thumbnail.jpg');
      });

      it('extracts external media from video tags', () => {
        const html = '<video src="https://vimeo.com/video.mp4"></video>';
        const urls = extractExternalMediaUrls(html, true);
        expect(urls).to.include('https://vimeo.com/video.mp4');
      });

      it('extracts from body but not head', () => {
        const html = `
          <html>
            <head>
              <link rel="icon" href="https://example.com/favicon.ico">
              <meta property="og:image" content="https://example.com/og-image.jpg">
            </head>
            <body>
              <img src="https://youtube.com/thumbnail.jpg">
            </body>
          </html>
        `;
        const urls = extractExternalMediaUrls(html, true);
        expect(urls).to.not.include('https://example.com/favicon.ico');
        expect(urls).to.not.include('https://example.com/og-image.jpg');
        expect(urls).to.include('https://youtube.com/thumbnail.jpg');
      });

      it('extracts from anchor tags', () => {
        const html = '<a href="https://youtube.com/watch?v=test">Video</a>';
        const urls = extractExternalMediaUrls(html, true);
        expect(urls).to.include('https://youtube.com/watch?v=test');
      });

      it('does not extract internal URLs', () => {
        const html = '<img src="https://main--blog--adobe.aem.page/media/image.png">';
        const urls = extractExternalMediaUrls(html, true);
        expect(urls).to.be.empty;
      });
    });

    it('returns empty array for empty content', () => {
      expect(extractExternalMediaUrls('', false)).to.be.empty;
      expect(extractExternalMediaUrls(null, false)).to.be.empty;
    });
  });

  describe('extractFragmentReferences', () => {
    describe('from markdown', () => {
      it('extracts fragment references', () => {
        const md = '[Footer](/fragments/footer)';
        const refs = extractFragmentReferences(md, false);
        expect(refs).to.include('/fragments/footer');
      });

      it('extracts multiple fragment references', () => {
        const md = `
          [Header](/fragments/header)
          [Footer](/fragments/footer)
        `;
        const refs = extractFragmentReferences(md, false);
        expect(refs).to.include('/fragments/header');
        expect(refs).to.include('/fragments/footer');
      });

      it('extracts fragments from full URLs', () => {
        const md = '[Nav](https://main--blog--adobe.aem.page/fragments/nav)';
        const refs = extractFragmentReferences(md, false);
        expect(refs).to.include('/fragments/nav');
      });

      it('deduplicates fragment references', () => {
        const md = `
          [Footer1](/fragments/footer)
          [Footer2](/fragments/footer)
        `;
        const refs = extractFragmentReferences(md, false);
        expect(refs).to.have.lengthOf(1);
      });

      it('does not extract non-fragment paths', () => {
        const md = '[Doc](/docs/guide)';
        const refs = extractFragmentReferences(md, false);
        expect(refs).to.be.empty;
      });
    });

    describe('from html', () => {
      it('extracts fragments from anchor tags', () => {
        const html = '<a href="/fragments/footer">Footer</a>';
        const refs = extractFragmentReferences(html, true);
        expect(refs).to.include('/fragments/footer');
      });

      it('extracts fragments from body but not head', () => {
        const html = `
          <html>
            <head>
              <link rel="canonical" href="/fragments/meta">
            </head>
            <body>
              <a href="/fragments/footer">Footer</a>
            </body>
          </html>
        `;
        const refs = extractFragmentReferences(html, true);
        expect(refs).to.not.include('/fragments/meta');
        expect(refs).to.include('/fragments/footer');
      });
    });

    it('returns empty array for empty content', () => {
      expect(extractFragmentReferences('', false)).to.be.empty;
      expect(extractFragmentReferences(null, false)).to.be.empty;
    });
  });

  describe('extractLinks', () => {
    describe('PDF extraction', () => {
      it('extracts PDF links from markdown', () => {
        const md = '[Guide](/docs/guide.pdf)';
        const links = extractLinks(md, /\.pdf$/, false);
        expect(links).to.include('/docs/guide.pdf');
      });

      it('extracts PDF links from HTML', () => {
        const html = '<a href="/docs/manual.pdf">Manual</a>';
        const links = extractLinks(html, /\.pdf$/, true);
        expect(links).to.include('/docs/manual.pdf');
      });

      it('converts full URLs to paths', () => {
        const md = '[Doc](https://main--blog--adobe.aem.page/docs/guide.pdf)';
        const links = extractLinks(md, /\.pdf$/, false);
        expect(links).to.include('/docs/guide.pdf');
      });

      it('does not extract external PDFs', () => {
        const md = '[External](https://example.com/doc.pdf)';
        const links = extractLinks(md, /\.pdf$/, false);
        expect(links).to.be.empty;
      });

      it('deduplicates PDF links', () => {
        const md = `
          [PDF1](/docs/guide.pdf)
          [PDF2](/docs/guide.pdf)
        `;
        const links = extractLinks(md, /\.pdf$/, false);
        expect(links).to.have.lengthOf(1);
      });
    });

    describe('SVG extraction', () => {
      it('extracts SVG links from markdown', () => {
        const md = '![Icon](/icons/logo.svg)';
        const links = extractLinks(md, /\.svg$/, false);
        expect(links).to.include('/icons/logo.svg');
      });

      it('extracts SVG links from HTML', () => {
        const html = '<img src="/assets/icon.svg">';
        const links = extractLinks(html, /\.svg$/, true);
        expect(links).to.include('/assets/icon.svg');
      });

      it('does not extract external SVGs', () => {
        const md = '![Icon](https://cdn.example.com/icon.svg)';
        const links = extractLinks(md, /\.svg$/, false);
        expect(links).to.be.empty;
      });
    });

    describe('icon token regression', () => {
      it('does not create /icons/iconname.svg from :iconname: alone', () => {
        const md = 'Text with :iconname: in it';
        const links = extractLinks(md, /\.svg$/, false);
        expect(links).to.be.empty;
      });

      it('only extracts explicit icon links', () => {
        const md = `
          Text with :iconname: token
          ![Icon](/icons/real-icon.svg)
        `;
        const links = extractLinks(md, /\.svg$/, false);
        expect(links).to.have.lengthOf(1);
        expect(links[0]).to.equal('/icons/real-icon.svg');
      });
    });

    it('returns empty array for empty content', () => {
      expect(extractLinks('', /\.pdf$/, false)).to.be.empty;
      expect(extractLinks(null, /\.pdf$/, false)).to.be.empty;
    });
  });
});
