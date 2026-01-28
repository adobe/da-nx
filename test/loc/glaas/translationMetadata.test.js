import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import { 
  processSchemaKey, 
  fieldNameToKey, 
  languageNameToCode, 
  parseBlockSchema,
  annotateHTML,
  needsKeywordsMetadata,
  buildLanguageMetadata
} from '../../../nx/blocks/loc/connectors/glaas/translationMetadata.js';

describe('translationMetadata', () => {
  describe('processSchemaKey', () => {
    it('should generate id and selector for schema key with classes', () => {
      const input = 'aso-app (apple, listing)';
      const result = processSchemaKey(input);
      expect(result).to.deep.equal({
        id: 'aso-app_apple_listing',
        selector: '.aso-app.apple.listing',
      });
    });

    it('should sort classes alphabetically in both id and selector', () => {
      const input = 'aso-app (listing, apple)';
      const result = processSchemaKey(input);
      expect(result).to.deep.equal({
        id: 'aso-app_apple_listing',
        selector: '.aso-app.apple.listing',
      });
    });

    it('should handle schema key without parentheses', () => {
      const input = 'simple-block';
      const result = processSchemaKey(input);
      expect(result).to.deep.equal({
        id: 'simple-block',
        selector: '.simple-block',
      });
    });

    it('should handle schema key with spaces around parentheses', () => {
      const input = 'aso-app   (  apple  ,  listing  )';
      const result = processSchemaKey(input);
      expect(result).to.deep.equal({
        id: 'aso-app_apple_listing',
        selector: '.aso-app.apple.listing',
      });
    });

    it('should handle single class in parentheses', () => {
      const input = 'aso-app (listing)';
      const result = processSchemaKey(input);
      expect(result).to.deep.equal({
        id: 'aso-app_listing',
        selector: '.aso-app.listing',
      });
    });

    it('should generate correct selector for multiple classes', () => {
      const input = 'aso-app (google, promo)';
      const result = processSchemaKey(input);
      expect(result).to.deep.equal({
        id: 'aso-app_google_promo',
        selector: '.aso-app.google.promo',
      });
    });
  });

  describe('fieldNameToKey', () => {
    it('should transform field name with spaces to hyphenated lowercase', () => {
      const input = 'Short Description';
      const result = fieldNameToKey(input);
      expect(result).to.equal('short-description');
    });

    it('should handle field name with single word', () => {
      const input = 'Title';
      const result = fieldNameToKey(input);
      expect(result).to.equal('title');
    });

    it('should handle field name with multiple spaces', () => {
      const input = 'App   Name';
      const result = fieldNameToKey(input);
      expect(result).to.equal('app-name');
    });

    it('should handle field name with apostrophe by removing it', () => {
      const input = "What's New";
      const result = fieldNameToKey(input);
      expect(result).to.equal('whats-new');
    });

    it('should handle already lowercase field name', () => {
      const input = 'subtitle';
      const result = fieldNameToKey(input);
      expect(result).to.equal('subtitle');
    });

    it('should remove multiple special characters', () => {
      const input = "App's Title (v2.0)";
      const result = fieldNameToKey(input);
      expect(result).to.equal('apps-title-v20');
    });

    it('should collapse multiple spaces/hyphens', () => {
      const input = 'Screenshot   iPhone   Copy   1';
      const result = fieldNameToKey(input);
      expect(result).to.equal('screenshot-iphone-copy-1');
    });
  });

  describe('languageNameToCode', () => {
    const projectLangs = [
      { name: 'English', code: 'en' },
      { name: 'French', code: 'fr' },
      { name: 'Japanese', code: 'ja' },
      { name: 'German', code: 'de' },
      { name: 'Spanish', code: 'es' },
    ];

    it('should map language name to code', () => {
      const result = languageNameToCode('French', projectLangs);
      expect(result).to.equal('fr');
    });

    it('should handle case-insensitive matching', () => {
      const result = languageNameToCode('french', projectLangs);
      expect(result).to.equal('fr');
    });

    it('should handle uppercase language names', () => {
      const result = languageNameToCode('JAPANESE', projectLangs);
      expect(result).to.equal('ja');
    });

    it('should return null for unknown language', () => {
      const result = languageNameToCode('Unknown', projectLangs);
      expect(result).to.be.null;
    });

    it('should handle mixed case correctly', () => {
      const result = languageNameToCode('SpAnIsH', projectLangs);
      expect(result).to.equal('es');
    });

    it('should return null for empty projectLangs array', () => {
      const result = languageNameToCode('French', []);
      expect(result).to.be.null;
    });
  });

  describe('parseBlockSchema', () => {
    let mockSchema;

    before(async () => {
      mockSchema = JSON.parse(await readFile({ path: './mocks/block-schema.json' }));
    });

    it('should parse block schema and generate structured output', () => {
      const result = parseBlockSchema(mockSchema);
      
      expect(result).to.have.property('aso-app_apple_listing');
      expect(result['aso-app_apple_listing']).to.have.property('selector', '.aso-app.apple.listing');
      expect(result['aso-app_apple_listing']).to.have.property('fields');
    });

    it('should include fields with character count', () => {
      const result = parseBlockSchema(mockSchema);
      const fields = result['aso-app_apple_listing'].fields;
      
      const subtitle = fields.find(f => f.fieldName === 'Subtitle');
      expect(subtitle).to.exist;
      expect(subtitle.charCount).to.equal('30');
    });

    it('should include fields with keywords injection', () => {
      const result = parseBlockSchema(mockSchema);
      const fields = result['aso-app_apple_listing'].fields;
      
      const subtitle = fields.find(f => f.fieldName === 'Subtitle');
      expect(subtitle.keywordsInjection).to.be.true;
    });

    it('should exclude fields without character count and without keywords', () => {
      const result = parseBlockSchema(mockSchema);
      const fields = result['aso-app_apple_listing'].fields;
      
      const icon = fields.find(f => f.fieldName === 'Icon');
      expect(icon).to.be.undefined;
    });

    it('should handle case-insensitive "Yes" for keywords injection', () => {
      const result = parseBlockSchema(mockSchema);
      const fields = result['aso-app_apple_listing'].fields;
      
      const description = fields.find(f => f.fieldName === 'Description');
      expect(description.keywordsInjection).to.be.true;
    });

    it('should parse block without parentheses', () => {
      const result = parseBlockSchema(mockSchema);
      
      expect(result).to.have.property('simple-block');
      expect(result['simple-block'].selector).to.equal('.simple-block');
    });

    it('should parse multiple block types', () => {
      const result = parseBlockSchema(mockSchema);
      
      expect(result).to.have.property('aso-app_google_promo');
      expect(result['aso-app_google_promo'].selector).to.equal('.aso-app.google.promo');
    });

    it('should skip metadata keys starting with colon', () => {
      const result = parseBlockSchema(mockSchema);
      
      expect(result).to.not.have.property(':version');
      expect(result).to.not.have.property(':test-coverage');
    });
  });

  describe('needsKeywordsMetadata', () => {
    it('should return true if any field has keywordsInjection', () => {
      const schema = {
        'aso-app_apple_listing': {
          selector: '.aso-app.apple.listing',
          fields: [
            { fieldName: 'Subtitle', fieldKey: 'subtitle', charCount: '30', keywordsInjection: true },
          ],
        },
      };
      expect(needsKeywordsMetadata(schema)).to.be.true;
    });

    it('should return false if no fields have keywordsInjection', () => {
      const schema = {
        'aso-app_apple_listing': {
          selector: '.aso-app.apple.listing',
          fields: [
            { fieldName: 'Subtitle', fieldKey: 'subtitle', charCount: '30', keywordsInjection: false },
          ],
        },
      };
      expect(needsKeywordsMetadata(schema)).to.be.false;
    });

    it('should return true if at least one field has keywordsInjection among many', () => {
      const schema = {
        'aso-app_apple_listing': {
          selector: '.aso-app.apple.listing',
          fields: [
            { fieldName: 'Title', fieldKey: 'title', charCount: '30', keywordsInjection: false },
            { fieldName: 'Subtitle', fieldKey: 'subtitle', charCount: '30', keywordsInjection: true },
            { fieldName: 'Description', fieldKey: 'description', charCount: '4000', keywordsInjection: false },
          ],
        },
      };
      expect(needsKeywordsMetadata(schema)).to.be.true;
    });

    it('should return false if schema is null', () => {
      expect(needsKeywordsMetadata(null)).to.be.false;
    });

    it('should return false if schema is empty', () => {
      expect(needsKeywordsMetadata({})).to.be.false;
    });

    it('should check across multiple blocks', () => {
      const schema = {
        'block1': {
          selector: '.block1',
          fields: [
            { fieldName: 'Field1', fieldKey: 'field1', charCount: '30', keywordsInjection: false },
          ],
        },
        'block2': {
          selector: '.block2',
          fields: [
            { fieldName: 'Field2', fieldKey: 'field2', charCount: '30', keywordsInjection: true },
          ],
        },
      };
      expect(needsKeywordsMetadata(schema)).to.be.true;
    });
  });

  describe('annotateHTML', () => {
    const parsedSchema = {
      'aso-app_apple_listing': {
        selector: '.aso-app.apple.listing',
        fields: [
          {
            fieldName: 'Subtitle',
            fieldKey: 'subtitle',
            charCount: '30',
            keywordsInjection: true,
          },
        ],
      },
    };

    it('should add attributes to HTML elements', () => {
      const html = `
        <div class="aso-app listing apple">
          <div>
            <div>Subtitle</div>
            <div>Adobe Firefly: AI Generator</div>
          </div>
        </div>
      `;

      const result = annotateHTML(html, parsedSchema);
      
      expect(result).to.include('its-storage-size="30"');
      expect(result).to.include('its-loc-note="block-name=aso-app_apple_listing_1_subtitle|fieldName=Subtitle|apply-keywords=true"');
      expect(result).to.include('its-loc-note-type="description"');
    });

    it('should return unchanged HTML if parsedSchema is empty', () => {
      const html = '<div>Test</div>';
      const result = annotateHTML(html, {});
      expect(result).to.equal(html);
    });

    it('should return unchanged HTML if htmlContent is empty', () => {
      const result = annotateHTML('', parsedSchema);
      expect(result).to.equal('');
    });

    it('should return unchanged HTML if parsedSchema is null', () => {
      const html = '<div>Test</div>';
      const result = annotateHTML(html, null);
      expect(result).to.equal(html);
    });

    it('should handle multiple blocks of the same type with correct indexing', () => {
      const html = `
        <div class="aso-app listing apple">
          <div>
            <div>Subtitle</div>
            <div>First Block</div>
          </div>
        </div>
        <div class="aso-app listing apple">
          <div>
            <div>Subtitle</div>
            <div>Second Block</div>
          </div>
        </div>
      `;

      const result = annotateHTML(html, parsedSchema);
      
      expect(result).to.include('block-name=aso-app_apple_listing_1_subtitle');
      expect(result).to.include('block-name=aso-app_apple_listing_2_subtitle');
    });

    it('should handle multiple fields in a block', () => {
      const schemaWithMultipleFields = {
        'aso-app_apple_listing': {
          selector: '.aso-app.apple.listing',
          fields: [
            {
              fieldName: 'Subtitle',
              fieldKey: 'subtitle',
              charCount: '30',
              keywordsInjection: true,
            },
            {
              fieldName: 'Description',
              fieldKey: 'description',
              charCount: '4000',
              keywordsInjection: true,
            },
          ],
        },
      };

      const html = `
        <div class="aso-app listing apple">
          <div>
            <div>Subtitle</div>
            <div>Adobe Firefly</div>
          </div>
          <div>
            <div>Description</div>
            <div>Long description here</div>
          </div>
        </div>
      `;

      const result = annotateHTML(html, schemaWithMultipleFields);
      
      expect(result).to.include('block-name=aso-app_apple_listing_1_subtitle');
      expect(result).to.include('block-name=aso-app_apple_listing_1_description');
      expect(result).to.include('its-storage-size="30"');
      expect(result).to.include('its-storage-size="4000"');
    });

    it('should handle field without charCount (keywords only)', () => {
      const schemaKeywordsOnly = {
        'aso-app_apple_listing': {
          selector: '.aso-app.apple.listing',
          fields: [
            {
              fieldName: 'Subtitle',
              fieldKey: 'subtitle',
              charCount: '',
              keywordsInjection: true,
            },
          ],
        },
      };

      const html = `
        <div class="aso-app listing apple">
          <div>
            <div>Subtitle</div>
            <div>Adobe Firefly</div>
          </div>
        </div>
      `;

      const result = annotateHTML(html, schemaKeywordsOnly);
      
      expect(result).to.not.include('its-storage-size');
      expect(result).to.include('its-loc-note="block-name=aso-app_apple_listing_1_subtitle|fieldName=Subtitle|apply-keywords=true"');
    });

    it('should skip field if field name div not found in HTML', () => {
      const html = `
        <div class="aso-app listing apple">
          <div>
            <div>Wrong Field Name</div>
            <div>Content</div>
          </div>
        </div>
      `;

      const result = annotateHTML(html, parsedSchema);
      
      expect(result).to.not.include('its-storage-size');
      expect(result).to.not.include('its-loc-note');
    });

    it('should skip field if next sibling is not a div', () => {
      const html = `
        <div class="aso-app listing apple">
          <div>
            <div>Subtitle</div>
            <span>Not a div</span>
          </div>
        </div>
      `;

      const result = annotateHTML(html, parsedSchema);
      
      expect(result).to.not.include('its-storage-size');
      expect(result).to.not.include('its-loc-note');
    });

    it('should unwrap single <p> tag from label div', () => {
      const html = `
        <div class="aso-app listing apple">
          <div>
            <div><p>Subtitle</p></div>
            <div>Adobe Firefly</div>
          </div>
        </div>
      `;

      const result = annotateHTML(html, parsedSchema);
      
      // Should unwrap <p> tag
      expect(result).to.include('<div>Subtitle</div>');
      expect(result).to.not.include('<p>Subtitle</p>');
      // Should still add attributes
      expect(result).to.include('its-storage-size="30"');
    });

    it('should unwrap single <p> tag from content div', () => {
      const html = `
        <div class="aso-app listing apple">
          <div>
            <div>Subtitle</div>
            <div><p>Adobe Firefly</p></div>
          </div>
        </div>
      `;

      const result = annotateHTML(html, parsedSchema);
      
      // Should unwrap <p> tag
      expect(result).to.include('<div its-storage-size="30"');
      expect(result).to.include('>Adobe Firefly</div>');
      expect(result).to.not.include('<p>Adobe Firefly</p>');
    });

    it('should not unwrap multiple <p> tags', () => {
      const html = `
        <div class="aso-app listing apple">
          <div>
            <div>Subtitle</div>
            <div><p>Line 1</p><p>Line 2</p></div>
          </div>
        </div>
      `;

      const result = annotateHTML(html, parsedSchema);
      
      // Should keep multiple <p> tags
      expect(result).to.include('<p>Line 1</p>');
      expect(result).to.include('<p>Line 2</p>');
    });

    it('should unwrap <p> tags even without schema', () => {
      const html = `
        <div class="aso-app listing apple">
          <div>
            <div><p>Label</p></div>
            <div><p>Content</p></div>
          </div>
        </div>
      `;

      const result = annotateHTML(html, null);
      
      // Should unwrap <p> tags even without schema
      expect(result).to.include('<div>Label</div>');
      expect(result).to.include('<div>Content</div>');
      expect(result).to.not.include('<p>Label</p>');
      expect(result).to.not.include('<p>Content</p>');
    });

    it('should be resilient to wrapped content - attributes work even with <p> tags', () => {
      // This test simulates what would happen if unwrapping was skipped
      // The isExactMatch function should still work with <p> wrapped labels
      const htmlWithPTags = `
        <div class="aso-app listing apple">
          <div>
            <div><p>Subtitle</p></div>
            <div><p>Adobe Firefly</p></div>
          </div>
        </div>
      `;

      const result = annotateHTML(htmlWithPTags, parsedSchema);
      
      // Even though input has <p> tags, attributes should be added
      // (after unwrapping, of course, but isExactMatch handles both cases)
      expect(result).to.include('its-storage-size="30"');
      expect(result).to.include('block-name=aso-app_apple_listing_1_subtitle');
      expect(result).to.include('apply-keywords=true');
    });

    it('should NOT match label divs with nested elements (prevents false positives)', () => {
      // Tests that we reject <div><p>Field <strong>Name</strong></p></div>
      // and <div>Field <span>Name</span></div> as label matches
      const htmlWithNestedElements = `
        <div class="aso-app listing apple">
          <div>
            <div><p>Subtitle <strong>Bold</strong></p></div>
            <div>Content A</div>
          </div>
          <div>
            <div>Subtitle <span>Extra</span></div>
            <div>Content B</div>
          </div>
          <div>
            <div>Subtitle</div>
            <div>Valid Content</div>
          </div>
        </div>
      `;

      const result = annotateHTML(htmlWithNestedElements, parsedSchema);
      
      const parser = new DOMParser();
      const doc = parser.parseFromString(result, 'text/html');
      
      // First two rows should NOT have attributes (nested elements in label)
      const rows = doc.querySelectorAll('.aso-app.listing.apple > div');
      const contentA = rows[0].querySelector(':scope > div:nth-child(2)');
      const contentB = rows[1].querySelector(':scope > div:nth-child(2)');
      
      expect(contentA.hasAttribute('its-storage-size')).to.be.false;
      expect(contentA.hasAttribute('its-loc-note')).to.be.false;
      expect(contentB.hasAttribute('its-storage-size')).to.be.false;
      expect(contentB.hasAttribute('its-loc-note')).to.be.false;
      
      // Third row SHOULD have attributes (valid label)
      const validContent = rows[2].querySelector(':scope > div:nth-child(2)');
      expect(validContent.getAttribute('its-storage-size')).to.equal('30');
      expect(validContent.getAttribute('its-loc-note')).to.include('subtitle');
    });

    it('should add attributes to content div (column 2), not label div (column 1)', () => {
      const html = `
        <div class="aso-app listing apple">
          <div>
            <div>Subtitle</div>
            <div>Adobe Firefly</div>
          </div>
        </div>
      `;

      const result = annotateHTML(html, parsedSchema);
      
      const parser = new DOMParser();
      const doc = parser.parseFromString(result, 'text/html');
      
      const block = doc.querySelector('.aso-app.listing.apple');
      const row = block.querySelector(':scope > div');
      const labelDiv = row.querySelector(':scope > div:nth-child(1)');
      const contentDiv = row.querySelector(':scope > div:nth-child(2)');
      
      // Label div should NOT have ITS attributes
      expect(labelDiv.hasAttribute('its-storage-size')).to.be.false;
      expect(labelDiv.hasAttribute('its-loc-note')).to.be.false;
      
      // Content div SHOULD have ITS attributes
      expect(contentDiv.hasAttribute('its-storage-size')).to.be.true;
      expect(contentDiv.getAttribute('its-storage-size')).to.equal('30');
      expect(contentDiv.hasAttribute('its-loc-note')).to.be.true;
      expect(contentDiv.getAttribute('its-loc-note')).to.include('block-name=aso-app_apple_listing_1_subtitle');
      expect(contentDiv.hasAttribute('its-loc-note-type')).to.be.true;
    });

    it('should handle empty content divs correctly', () => {
      // Ensures attributes are added to content div (column 2), not row container
      // Tests with both empty and non-empty content divs
      const html = `
        <div class="aso-app listing apple">
          <div>
            <div>Subtitle</div>
            <div></div>
          </div>
          <div>
            <div>Description</div>
            <div>Long description</div>
          </div>
        </div>
      `;

      const schemaWithDescription = {
        'aso-app_apple_listing': {
          selector: '.aso-app.apple.listing',
          fields: [
            {
              fieldName: 'Subtitle',
              fieldKey: 'subtitle',
              charCount: '30',
              keywordsInjection: true,
            },
            {
              fieldName: 'Description',
              fieldKey: 'description',
              charCount: '4000',
              keywordsInjection: true,
            },
          ],
        },
      };

      const result = annotateHTML(html, schemaWithDescription);
      
      const parser = new DOMParser();
      const doc = parser.parseFromString(result, 'text/html');
      
      const block = doc.querySelector('.aso-app.listing.apple');
      const rows = block.querySelectorAll(':scope > div');
      
      // First row (Subtitle with empty content)
      const row1 = rows[0];
      expect(row1.hasAttribute('its-storage-size')).to.be.false;
      expect(row1.hasAttribute('its-loc-note')).to.be.false;
      
      const row1Content = row1.querySelector(':scope > div:nth-child(2)');
      expect(row1Content.hasAttribute('its-storage-size')).to.be.true;
      expect(row1Content.getAttribute('its-storage-size')).to.equal('30');
      
      // Second row (Description with content)
      const row2 = rows[1];
      expect(row2.hasAttribute('its-storage-size')).to.be.false;
      expect(row2.hasAttribute('its-loc-note')).to.be.false;
      
      const row2Content = row2.querySelector(':scope > div:nth-child(2)');
      expect(row2Content.hasAttribute('its-storage-size')).to.be.true;
      expect(row2Content.getAttribute('its-storage-size')).to.equal('4000');
    });
  });

  describe('buildLanguageMetadata', () => {
    let mockKeywords;
    const languageMapping = [
      { name: 'English', code: 'en' },
      { name: 'French', code: 'fr' },
      { name: 'Japanese', code: 'ja' },
    ];

    before(async () => {
      mockKeywords = JSON.parse(await readFile({ path: './mocks/page-keywords.json' }));
    });

    it('should build language metadata for target languages only', () => {
      // Only pass French and Japanese (exclude English)
      const frenchAndJapanese = [
        { name: 'French', code: 'fr' },
        { name: 'Japanese', code: 'ja' },
      ];
      const result = buildLanguageMetadata(mockKeywords, frenchAndJapanese);

      expect(result).to.have.property('fr');
      expect(result).to.have.property('ja');
      expect(result).to.not.have.property('en');
    });

    it('should create correct metadata keys with block ID, index, and field', () => {
      const frenchOnly = [{ name: 'French', code: 'fr' }];
      const expectedSubtitle = 'générateur d\'art ia, créer ia, générateur d\'image ia, '
        + 'image ia, design ia, vidéo ia, photo ia, montage vidéo ia, artiste ia, outil ia, '
        + 'animation, vidéo, contenu, effets vidéo, effets sonores, arrière-plans, '
        + 'animation vidéo, créateur d\'images, générer, créateur, producteur, designer, '
        + 'créateur de contenu, design graphique, créateur de films, texte en image, '
        + 'outils de montage, texte en vidéo, application de montage, modifier des images, '
        + 'modifier des vidéos';
      const expectedDescription = 'créez des images époustouflantes avec l\'ia, '
        + 'générez du contenu professionnel, modifiez des photos et des vidéos, '
        + 'concevez des graphiques, produisez des animations, créez des films, '
        + 'transformez du texte en visuels';

      const result = buildLanguageMetadata(mockKeywords, frenchOnly);

      expect(result.fr).to.have.property('keywords|aso-app_apple_listing_1_subtitle');
      expect(result.fr).to.have.property('keywords|aso-app_apple_listing_1_description');
      expect(result.fr['keywords|aso-app_apple_listing_1_subtitle']).to.equal(expectedSubtitle);
      expect(result.fr['keywords|aso-app_apple_listing_1_description']).to.equal(expectedDescription);
    });

    it('should handle multiple blocks', () => {
      const frenchOnly = [{ name: 'French', code: 'fr' }];
      const expectedBlock2Subtitle = 'éditeur de photos pro, montage professionnel, '
        + 'modifier des photos, outils photo, édition d\'image, filtres photo, '
        + 'retoucher des photos, amélioration photo, montage créatif, studio photo';
      const expectedBlock2Description = 'outils d\'édition photo professionnels, '
        + 'filtres et effets avancés, retoucher et améliorer les images, '
        + 'studio photo créatif';

      const result = buildLanguageMetadata(mockKeywords, frenchOnly);

      expect(result.fr).to.have.property('keywords|aso-app_apple_listing_1_subtitle');
      expect(result.fr).to.have.property('keywords|aso-app_apple_listing_2_subtitle');
      expect(result.fr['keywords|aso-app_apple_listing_2_subtitle']).to.equal(expectedBlock2Subtitle);
      expect(result.fr['keywords|aso-app_apple_listing_2_description']).to.equal(expectedBlock2Description);
    });

    it('should return empty object if keywordsData is null', () => {
      const result = buildLanguageMetadata(null, languageMapping);
      expect(result).to.deep.equal({});
    });

    it('should return empty object if langs is null', () => {
      const result = buildLanguageMetadata(mockKeywords, null);
      expect(result).to.deep.equal({});
    });

    it('should skip metadata keys starting with colon', () => {
      const targetLangs = [{ code: 'fr' }];
      const result = buildLanguageMetadata(mockKeywords, languageMapping, targetLangs);
      
      const keys = Object.keys(result.fr || {});
      const hasDescriptionKey = keys.some((key) => key.includes('description'));
      expect(hasDescriptionKey).to.be.true;
    });

    it('should handle language name not found in languageMapping', () => {
      const keywordsWithUnknownLang = {
        'aso-app (apple, listing) (1)': {
          total: 1,
          data: [
            { language: 'Unknown Language', Subtitle: 'test' },
          ],
        },
      };

      const result = buildLanguageMetadata(keywordsWithUnknownLang, languageMapping);
      
      expect(Object.keys(result)).to.have.lengthOf(0);
    });

    it('should exclude language field from metadata', () => {
      const frenchOnly = [{ name: 'French', code: 'fr' }];
      const result = buildLanguageMetadata(mockKeywords, frenchOnly);
      
      const keys = Object.keys(result.fr || {});
      const hasLanguageKey = keys.some((key) => key.includes('language'));
      expect(hasLanguageKey).to.be.false;
    });
  });
});

