import { expect } from '@esm-bundle/chai';
import {
  LOC_IMAGES_KEY,
  isEligibleMultimodalImageUrl,
  parseSelections,
  writeSelections,
  mergeSelections,
} from '../../../nx/blocks/loc/connectors/glaas/imageSelections.js';

describe('imageSelections', () => {
  describe('isEligibleMultimodalImageUrl', () => {
    it('accepts absolute http(s) png/jpg/jpeg urls, any host', () => {
      expect(isEligibleMultimodalImageUrl('https://content.da.live/org/site/media_abc.png')).to.be.true;
      expect(isEligibleMultimodalImageUrl('https://main--site--org.aem.live/media_def.jpg')).to.be.true;
      expect(isEligibleMultimodalImageUrl('http://example.com/foo.jpeg')).to.be.true;
    });

    it('excludes extensions outside the allowlist (svg, gif, webp, avif, ...)', () => {
      expect(isEligibleMultimodalImageUrl('https://content.da.live/org/site/icon.svg')).to.be.false;
      expect(isEligibleMultimodalImageUrl('https://content.da.live/org/site/ICON.SVG')).to.be.false;
      expect(isEligibleMultimodalImageUrl('https://content.da.live/org/site/anim.gif')).to.be.false;
      expect(isEligibleMultimodalImageUrl('https://content.da.live/org/site/modern.webp')).to.be.false;
      expect(isEligibleMultimodalImageUrl('https://content.da.live/org/site/next.avif')).to.be.false;
    });

    it('excludes relative and non-http(s) urls', () => {
      expect(isEligibleMultimodalImageUrl('./media_abc.png')).to.be.false;
      expect(isEligibleMultimodalImageUrl('/media_abc.png')).to.be.false;
      expect(isEligibleMultimodalImageUrl('data:image/png;base64,abc')).to.be.false;
      expect(isEligibleMultimodalImageUrl('')).to.be.false;
      expect(isEligibleMultimodalImageUrl(undefined)).to.be.false;
    });
  });

  describe('parseSelections', () => {
    it('returns an empty set when there is no da-metadata block', () => {
      const html = '<body><main><p>Hi</p></main></body>';
      expect(parseSelections(html).size).to.equal(0);
    });

    it('returns an empty set when there is no loc-images row', () => {
      const html = `<body><main></main><div class="da-metadata">
        <div><div>acceptedhashes</div><div>abc123</div></div>
      </div></body>`;
      expect(parseSelections(html).size).to.equal(0);
    });

    it('parses marked srcs, preserving mixed-case paths (the getElementMetadata .text lowercasing gotcha)', () => {
      const mixedCaseSrc = 'https://content.da.live/org/site/Media_Abc.png';
      const rows = [
        { src: mixedCaseSrc, translate: 'true' },
        { src: 'https://content.da.live/org/site/skip.png', translate: 'false' },
      ];
      const html = `<body><main></main><div class="da-metadata">
        <div><div>loc-images</div><div>${JSON.stringify(rows)}</div></div>
      </div></body>`;
      const selections = parseSelections(html);
      expect(selections.size).to.equal(1);
      expect(selections.has(new URL(mixedCaseSrc).href)).to.be.true;
    });

    it('is case-insensitive on the row key', () => {
      const src = 'https://content.da.live/org/site/media_abc.png';
      const html = `<body><main></main><div class="da-metadata">
        <div><div>Loc-Images</div><div>${JSON.stringify([{ src, translate: 'true' }])}</div></div>
      </div></body>`;
      expect(parseSelections(html).has(new URL(src).href)).to.be.true;
    });

    it('returns an empty set for malformed JSON rather than throwing', () => {
      const html = `<body><main></main><div class="da-metadata">
        <div><div>loc-images</div><div>not json</div></div>
      </div></body>`;
      expect(parseSelections(html).size).to.equal(0);
    });
  });

  describe('writeSelections', () => {
    it('creates da-metadata and the loc-images row when neither exists', () => {
      const html = '<body><main><p>Hi</p></main></body>';
      const rows = [{ src: 'https://content.da.live/org/site/media_abc.png', translate: 'true' }];
      const result = writeSelections(html, rows);
      const selections = parseSelections(result);
      expect(selections.has('https://content.da.live/org/site/media_abc.png')).to.be.true;
      expect(result).to.include('<p>Hi</p>');
    });

    it('updates an existing loc-images row without touching other rows', () => {
      const html = `<body><main><p>Hi</p></main><div class="da-metadata">
        <div><div>${LOC_IMAGES_KEY}</div><div>[]</div></div>
        <div><div>acceptedhashes</div><div>abc123</div></div>
      </div></body>`;
      const rows = [{ src: 'https://content.da.live/org/site/media_abc.png', translate: 'true' }];
      const result = writeSelections(html, rows);
      expect(parseSelections(result).has('https://content.da.live/org/site/media_abc.png')).to.be.true;
      expect(result).to.include('<div>acceptedhashes</div><div>abc123</div>');
    });

    it('removes the row (and the block, if now empty) when writing an empty selection', () => {
      const html = `<body><main></main><div class="da-metadata">
        <div><div>${LOC_IMAGES_KEY}</div><div>[{"src":"https://content.da.live/org/site/media_abc.png","translate":"true"}]</div></div>
      </div></body>`;
      const result = writeSelections(html, []);
      expect(result).to.not.include('loc-images');
      expect(result).to.not.include('da-metadata');
    });

    it('removes only the loc-images row when other rows remain', () => {
      const html = `<body><main></main><div class="da-metadata">
        <div><div>${LOC_IMAGES_KEY}</div><div>[{"src":"https://content.da.live/org/site/media_abc.png","translate":"true"}]</div></div>
        <div><div>acceptedhashes</div><div>abc123</div></div>
      </div></body>`;
      const result = writeSelections(html, []);
      expect(result).to.not.include('loc-images');
      expect(result).to.include('<div>acceptedhashes</div><div>abc123</div>');
    });
  });

  describe('mergeSelections', () => {
    const srcA = 'https://content.da.live/org/site/a.png';
    const srcB = 'https://content.da.live/org/site/b.png';
    const srcC = 'https://content.da.live/org/site/c.png';

    it('applies this session\'s changes on top of the latest state', () => {
      const initialRows = [{ src: srcA, translate: 'false' }, { src: srcB, translate: 'true' }];
      const currentRows = [{ src: srcA, translate: 'true' }, { src: srcB, translate: 'true' }];
      const latestRows = [{ src: srcB, translate: 'true' }];
      const merged = mergeSelections(latestRows, initialRows, currentRows);
      expect(merged).to.deep.equal([{ src: srcB, translate: 'true' }, { src: srcA, translate: 'true' }]);
    });

    it('preserves a concurrent change to a different image made by another session', () => {
      // This session only knows about A and B; another session marked C true
      // in the meantime, reflected in latestRows but not in initial/current.
      const initialRows = [{ src: srcA, translate: 'false' }, { src: srcB, translate: 'false' }];
      const currentRows = [{ src: srcA, translate: 'true' }, { src: srcB, translate: 'false' }, { src: srcC, translate: 'false' }];
      const latestRows = [{ src: srcC, translate: 'true' }];
      const merged = mergeSelections(latestRows, initialRows, currentRows);
      expect(merged).to.deep.equal([{ src: srcC, translate: 'true' }, { src: srcA, translate: 'true' }]);
    });

    it('prunes a latest row whose image is no longer present on the page', () => {
      const initialRows = [];
      const currentRows = [{ src: srcA, translate: 'false' }];
      // srcB was marked true previously but the image has since been deleted
      // from the page - it's absent from currentRows entirely.
      const latestRows = [{ src: srcA, translate: 'false' }, { src: srcB, translate: 'true' }];
      const merged = mergeSelections(latestRows, initialRows, currentRows);
      expect(merged).to.deep.equal([]);
    });

    it('unmarking an image removes it even if it is still present on the page', () => {
      const initialRows = [{ src: srcA, translate: 'true' }];
      const currentRows = [{ src: srcA, translate: 'false' }];
      const latestRows = [{ src: srcA, translate: 'true' }];
      const merged = mergeSelections(latestRows, initialRows, currentRows);
      expect(merged).to.deep.equal([]);
    });
  });
});
