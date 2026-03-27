import { expect } from '@esm-bundle/chai';
import {
  parseColonSyntax,
  filterMedia,
  getSearchSuggestions,
} from '../../../nx/blocks/media-library/features/filters.js';

describe('filters', () => {
  describe('parseColonSyntax', () => {
    it('parses doc: syntax', () => {
      const result = parseColonSyntax('doc:/path/to/doc');
      expect(result).to.exist;
      expect(result.field).to.equal('doc');
      expect(result.value).to.equal('/path/to/doc');
    });

    it('parses folder: syntax', () => {
      const result = parseColonSyntax('folder:/docs');
      expect(result).to.exist;
      expect(result.field).to.equal('folder');
      expect(result.value).to.equal('/docs');
    });

    it('parses name: syntax', () => {
      const result = parseColonSyntax('name:image.png');
      expect(result).to.exist;
      expect(result.field).to.equal('name');
      expect(result.value).to.equal('image.png');
    });

    it('parses url: syntax', () => {
      const result = parseColonSyntax('url:media/logo');
      expect(result).to.exist;
      expect(result.field).to.equal('url');
      expect(result.value).to.equal('media/logo');
    });

    it('parses user: syntax', () => {
      const result = parseColonSyntax('user:john@example.com');
      expect(result).to.exist;
      expect(result.field).to.equal('user');
      expect(result.value).to.equal('john@example.com');
    });

    it('does not treat https:// as colon syntax', () => {
      const result = parseColonSyntax('https://example.com/video.mp4');
      expect(result).to.be.null;
    });

    it('does not treat http:// as colon syntax', () => {
      const result = parseColonSyntax('http://example.com/file.pdf');
      expect(result).to.be.null;
    });

    it('is case-insensitive for field names', () => {
      const result = parseColonSyntax('DOC:/path');
      expect(result).to.exist;
      expect(result.field).to.equal('doc');
    });

    it('trims whitespace from value', () => {
      const result = parseColonSyntax('name:  image.png  ');
      expect(result).to.exist;
      expect(result.value).to.equal('image.png');
    });

    it('returns null for plain text', () => {
      const result = parseColonSyntax('just some text');
      expect(result).to.be.null;
    });

    it('returns null for empty string', () => {
      const result = parseColonSyntax('');
      expect(result).to.be.null;
    });

    it('returns null for null input', () => {
      const result = parseColonSyntax(null);
      expect(result).to.be.null;
    });
  });

  describe('filterMedia', () => {
    // Sample data fixtures
    const sampleData = [
      {
        url: 'https://main--blog--adobe.aem.live/media/image1.png',
        name: 'image1.png',
        displayName: 'Image 1',
        doc: '/docs/page1',
        status: 'referenced',
        hash: 'hash1',
      },
      {
        url: 'https://main--blog--adobe.aem.live/media/video1.mp4',
        name: 'video1.mp4',
        displayName: 'Video 1',
        doc: '/docs/page2',
        status: 'referenced',
        hash: 'hash2',
      },
      {
        url: 'https://main--blog--adobe.aem.live/media/icon.svg',
        name: 'icon.svg',
        displayName: 'Icon',
        doc: '/docs/page1',
        status: 'referenced',
        hash: 'hash3',
      },
      {
        url: 'https://main--blog--adobe.aem.live/media/document.pdf',
        name: 'document.pdf',
        displayName: 'Document',
        doc: '/docs/guide',
        status: 'referenced',
        hash: 'hash4',
      },
      {
        url: 'https://main--blog--adobe.aem.live/fragments/footer',
        name: 'footer',
        displayName: 'Footer Fragment',
        doc: '/index',
        status: 'referenced',
        hash: 'hash5',
        type: 'fragment',
      },
      {
        url: 'https://youtube.com/watch?v=abc123',
        name: 'External Video',
        displayName: 'External Video',
        doc: '/docs/page3',
        status: 'referenced',
        hash: 'https://youtube.com/watch?v=abc123',
      },
      {
        url: 'https://main--blog--adobe.aem.live/media/unused.png',
        name: 'unused.png',
        displayName: 'Unused Image',
        doc: '',
        status: 'unused',
        hash: 'hash7',
      },
    ];

    describe('type filters', () => {
      it('filters images (excludes SVGs)', () => {
        const options = {
          selectedFilterType: 'images',
          org: 'adobe',
          repo: 'blog',
        };
        const filtered = filterMedia(sampleData, options);
        expect(filtered).to.have.lengthOf(1);
        expect(filtered[0].name).to.equal('image1.png');
      });

      it('filters videos', () => {
        const options = {
          selectedFilterType: 'videos',
          org: 'adobe',
          repo: 'blog',
        };
        const filtered = filterMedia(sampleData, options);
        expect(filtered).to.have.lengthOf(1);
        expect(filtered[0].name).to.equal('video1.mp4');
      });

      it('filters icons (SVGs only)', () => {
        const options = {
          selectedFilterType: 'icons',
          org: 'adobe',
          repo: 'blog',
        };
        const filtered = filterMedia(sampleData, options);
        expect(filtered).to.have.lengthOf(1);
        expect(filtered[0].name).to.equal('icon.svg');
      });

      it('filters documents (PDFs)', () => {
        const options = {
          selectedFilterType: 'documents',
          org: 'adobe',
          repo: 'blog',
        };
        const filtered = filterMedia(sampleData, options);
        expect(filtered).to.have.lengthOf(1);
        expect(filtered[0].name).to.equal('document.pdf');
      });

      it('filters fragments', () => {
        const options = {
          selectedFilterType: 'fragments',
          org: 'adobe',
          repo: 'blog',
        };
        const filtered = filterMedia(sampleData, options);
        expect(filtered).to.have.lengthOf(1);
        expect(filtered[0].displayName).to.equal('Footer Fragment');
      });

      it('filters external links only', () => {
        const options = {
          selectedFilterType: 'links',
          org: 'adobe',
          repo: 'blog',
        };
        const filtered = filterMedia(sampleData, options);
        expect(filtered).to.have.lengthOf(1);
        expect(filtered[0].name).to.equal('External Video');
      });
    });

    describe('noReferences filter', () => {
      it('shows only unused items', () => {
        const options = {
          selectedFilterType: 'noReferences',
          org: 'adobe',
          repo: 'blog',
        };
        const filtered = filterMedia(sampleData, options);
        expect(filtered).to.have.lengthOf(1);
        expect(filtered[0].status).to.equal('unused');
        expect(filtered[0].name).to.equal('unused.png');
      });
    });

    describe('referenced filter behavior', () => {
      it('excludes unused items from images filter', () => {
        const options = {
          selectedFilterType: 'images',
          org: 'adobe',
          repo: 'blog',
        };
        const filtered = filterMedia(sampleData, options);
        const hasUnused = filtered.some((item) => item.status === 'unused');
        expect(hasUnused).to.be.false;
      });

      it('excludes unused items from all non-noReferences filters', () => {
        const filterTypes = ['images', 'videos', 'icons', 'documents', 'fragments', 'links'];
        filterTypes.forEach((filterType) => {
          const options = {
            selectedFilterType: filterType,
            org: 'adobe',
            repo: 'blog',
          };
          const filtered = filterMedia(sampleData, options);
          const hasUnused = filtered.some((item) => item.status === 'unused');
          expect(hasUnused).to.be.false;
        });
      });
    });

    describe('search', () => {
      it('filters by search query in name', () => {
        const options = {
          searchQuery: 'video',
          selectedFilterType: 'all',
          org: 'adobe',
          repo: 'blog',
        };
        const filtered = filterMedia(sampleData, options);
        expect(filtered.length).to.be.greaterThan(0);
        const hasVideo = filtered.some((item) => item.name.toLowerCase().includes('video'));
        expect(hasVideo).to.be.true;
      });

      it('filters by doc: syntax', () => {
        const processedData = {
          docPaths: ['/docs/page1', '/docs/page2'],
          folderPaths: [],
          usageData: {
            hash1: { docs: ['/docs/page1'], folders: [], firstDoc: '/docs/page1', hasRootDoc: false, count: 1 },
            hash2: { docs: ['/docs/page2'], folders: [], firstDoc: '/docs/page2', hasRootDoc: false, count: 1 },
            hash3: { docs: ['/docs/page1'], folders: [], firstDoc: '/docs/page1', hasRootDoc: false, count: 1 },
          },
        };
        const options = {
          searchQuery: 'doc:/docs/page1',
          selectedFilterType: 'all',
          processedData,
          org: 'adobe',
          repo: 'blog',
        };
        const filtered = filterMedia(sampleData, options);
        expect(filtered.length).to.be.greaterThan(0);
        filtered.forEach((item) => {
          expect(item.doc).to.include('/docs/page1');
        });
      });

      it('filters by folder: syntax', () => {
        const processedData = {
          docPaths: ['/docs/page1', '/docs/page2', '/docs/guide'],
          folderPaths: ['/docs'],
          usageData: {
            hash1: { docs: ['/docs/page1'], folders: ['/docs'], firstDoc: '/docs/page1', hasRootDoc: false, count: 1 },
            hash2: { docs: ['/docs/page2'], folders: ['/docs'], firstDoc: '/docs/page2', hasRootDoc: false, count: 1 },
            hash3: { docs: ['/docs/page1'], folders: ['/docs'], firstDoc: '/docs/page1', hasRootDoc: false, count: 1 },
            hash4: { docs: ['/docs/guide'], folders: ['/docs'], firstDoc: '/docs/guide', hasRootDoc: false, count: 1 },
          },
        };
        const options = {
          searchQuery: 'folder:/docs',
          selectedFilterType: 'all',
          processedData,
          org: 'adobe',
          repo: 'blog',
        };
        const filtered = filterMedia(sampleData, options);
        expect(filtered.length).to.be.greaterThan(0);
      });

      it('combines search with type filter', () => {
        const options = {
          searchQuery: 'image',
          selectedFilterType: 'images',
          org: 'adobe',
          repo: 'blog',
        };
        const filtered = filterMedia(sampleData, options);
        expect(filtered).to.have.lengthOf(1);
        expect(filtered[0].name).to.equal('image1.png');
      });
    });

    it('returns empty array for empty source data', () => {
      const options = {
        selectedFilterType: 'images',
        org: 'adobe',
        repo: 'blog',
      };
      expect(filterMedia([], options)).to.be.empty;
      expect(filterMedia(null, options)).to.be.empty;
    });
  });

  describe('getSearchSuggestions', () => {
    const sampleData = [
      {
        url: 'https://main--blog--adobe.aem.live/media/header-image.png',
        name: 'header-image.png',
        displayName: 'Header Image',
        doc: '/docs/page1',
        status: 'referenced',
      },
      {
        url: 'https://main--blog--adobe.aem.live/media/footer-image.png',
        name: 'footer-image.png',
        displayName: 'Footer Image',
        doc: '/docs/page2',
        status: 'referenced',
      },
      {
        url: 'https://youtube.com/watch?v=abc',
        name: 'tutorial.mp4',
        displayName: 'Tutorial Video',
        doc: '/docs/tutorial',
        status: 'referenced',
      },
      {
        url: 'https://main--blog--adobe.aem.live/media/unused.png',
        name: 'unused.png',
        displayName: 'Unused Image',
        doc: '',
        status: 'unused',
      },
    ];

    const createSuggestion = (item) => ({
      type: 'media',
      value: item,
      display: item.displayName,
    });

    it('returns suggestions for plain text query', () => {
      const suggestions = getSearchSuggestions(
        sampleData,
        'image',
        createSuggestion,
        null,
        'images',
        'adobe',
        'blog',
      );
      expect(suggestions.length).to.be.greaterThan(0);
    });

    it('filters suggestions by selectedFilterType', () => {
      const suggestions = getSearchSuggestions(
        sampleData,
        'image',
        createSuggestion,
        null,
        'images',
        'adobe',
        'blog',
      );
      suggestions.forEach((suggestion) => {
        const item = suggestion.value;
        expect(item.displayName).to.include('Image');
      });
    });

    it('external filter suggestions exclude same-repo URLs', () => {
      const suggestions = getSearchSuggestions(
        sampleData,
        'video',
        createSuggestion,
        null,
        'links',
        'adobe',
        'blog',
      );
      if (suggestions.length > 0) {
        suggestions.forEach((suggestion) => {
          const item = suggestion.value;
          expect(item.url).to.not.include('main--blog--adobe');
        });
      }
    });

    it('noReferences filter shows only unused items', () => {
      const suggestions = getSearchSuggestions(
        sampleData,
        'unused',
        createSuggestion,
        null,
        'noReferences',
        'adobe',
        'blog',
      );
      expect(suggestions.length).to.be.greaterThan(0);
      suggestions.forEach((suggestion) => {
        const item = suggestion.value;
        expect(item.status).to.equal('unused');
      });
    });

    it('other filters exclude unused items', () => {
      const suggestions = getSearchSuggestions(
        sampleData,
        'image',
        createSuggestion,
        null,
        'images',
        'adobe',
        'blog',
      );
      suggestions.forEach((suggestion) => {
        const item = suggestion.value;
        expect(item.status).to.not.equal('unused');
      });
    });

    it('limits suggestions to 10 results', () => {
      const largeDataset = Array.from({ length: 50 }, (_, i) => ({
        url: `https://main--blog--adobe.aem.live/media/image${i}.png`,
        name: `image${i}.png`,
        displayName: `Image ${i}`,
        doc: '/docs/page',
        status: 'referenced',
      }));
      const suggestions = getSearchSuggestions(
        largeDataset,
        'image',
        createSuggestion,
        null,
        'images',
        'adobe',
        'blog',
      );
      expect(suggestions).to.have.lengthOf(10);
    });

    it('returns empty array for empty query', () => {
      const suggestions = getSearchSuggestions(
        sampleData,
        '',
        createSuggestion,
        null,
        'images',
        'adobe',
        'blog',
      );
      expect(suggestions).to.be.empty;
    });

    it('returns empty array for null/undefined data', () => {
      expect(getSearchSuggestions(null, 'test', createSuggestion)).to.be.empty;
      expect(getSearchSuggestions(undefined, 'test', createSuggestion)).to.be.empty;
    });
  });
});
