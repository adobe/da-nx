import sinon from 'sinon';
import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import {
  processSchemaKey,
  fieldNameToKey,
  languageNameToCode,
  parseBlockSchema,
  needsKeywordsMetadata,
  normalizeKeywordsFile,
  fetchBlockSchema,
  loadSeoGlossary,
  addSeoGlossary,
  addTranslationMetadata,
  isUpdatedColumn,
  parseUpdatedFlag,
} from '../../../nx/blocks/loc/connectors/glaas/translationMetadata.js';

const TM_TEST_ORG = 'test-org';
const TM_TEST_SITE = 'test-site';
const TM_PAGE_PATH = '/content/page';

const mockRes = ({ payload, status = 404, ok = false } = {}) => new Promise((resolve) => {
  resolve({
    status,
    ok,
    json: () => payload,
    text: () => payload,
    headers: { get: () => null },
  });
});

function schemaKeyFromBlock({ selector }) {
  const parts = selector.replace(/^\./, '').split('.');
  const [blockType, ...classes] = parts;
  if (classes.length === 0) return blockType;
  return `${blockType} (${[...classes].sort().join(', ')})`;
}

function blockSchemaJsonFromParsed(parsedSchema) {
  if (!parsedSchema || Object.keys(parsedSchema).length === 0) {
    return { ':version': 1 };
  }
  const schemaData = { ':version': 1 };
  Object.values(parsedSchema).forEach((block) => {
    schemaData[schemaKeyFromBlock(block)] = {
      data: block.fields.map((field) => ({
        'field name': field.fieldName,
        'character count': field.charCount || '',
        'keywords injection': field.keywordsInjection ? 'yes' : '',
      })),
    };
  });
  return schemaData;
}

async function runTranslationMetadata({
  html,
  langs = [{ name: 'French', code: 'fr' }],
  blockSchemaJson,
  blockSchema404 = false,
  keywordsData,
  constantsHtml,
  suppliedPath = TM_PAGE_PATH,
}) {
  window.fetch = sinon.stub().callsFake((input) => {
    const urlStr = String(typeof input === 'string' ? input : input.url);

    if (urlStr.includes('/.da/block-schema.json')) {
      if (blockSchema404) return mockRes({ status: 404, ok: false });
      return mockRes({
        payload: blockSchemaJson ?? { ':version': 1 },
        status: 200,
        ok: true,
      });
    }
    if (urlStr.includes('-keywords.json')) {
      if (keywordsData === undefined) return mockRes({ status: 404, ok: false });
      return mockRes({ payload: keywordsData, status: 200, ok: true });
    }
    if (urlStr.includes('-constants.html')) {
      if (!constantsHtml) return mockRes({ status: 404, ok: false });
      return mockRes({ payload: constantsHtml, status: 200, ok: true });
    }
    if (urlStr.includes('/.da/seo/glossary.json')) {
      return mockRes({ status: 404, ok: false });
    }
    return mockRes({ status: 404, ok: false });
  });

  await fetchBlockSchema(TM_TEST_ORG, TM_TEST_SITE, { reset: true });
  await loadSeoGlossary(TM_TEST_ORG, TM_TEST_SITE, { reset: true });

  const urls = [{ suppliedPath, content: html }];
  await addTranslationMetadata(TM_TEST_ORG, TM_TEST_SITE, langs, urls);
  return urls[0];
}

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
      const { fields } = result['aso-app_apple_listing'];

      const subtitle = fields.find((f) => f.fieldName === 'Subtitle');
      expect(subtitle).to.exist;
      expect(subtitle.charCount).to.equal('30');
    });

    it('should include fields with keywords injection', () => {
      const result = parseBlockSchema(mockSchema);
      const { fields } = result['aso-app_apple_listing'];

      const subtitle = fields.find((f) => f.fieldName === 'Subtitle');
      expect(subtitle.keywordsInjection).to.be.true;
    });

    it('should exclude fields without character count and without keywords', () => {
      const result = parseBlockSchema(mockSchema);
      const { fields } = result['aso-app_apple_listing'];

      const icon = fields.find((f) => f.fieldName === 'Icon');
      expect(icon).to.be.undefined;
    });

    it('should handle case-insensitive "Yes" for keywords injection', () => {
      const result = parseBlockSchema(mockSchema);
      const { fields } = result['aso-app_apple_listing'];

      const description = fields.find((f) => f.fieldName === 'Description');
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
        block1: {
          selector: '.block1',
          fields: [
            { fieldName: 'Field1', fieldKey: 'field1', charCount: '30', keywordsInjection: false },
          ],
        },
        block2: {
          selector: '.block2',
          fields: [
            { fieldName: 'Field2', fieldKey: 'field2', charCount: '30', keywordsInjection: true },
          ],
        },
      };
      expect(needsKeywordsMetadata(schema)).to.be.true;
    });
  });

  describe('annotateHTML (via addTranslationMetadata)', () => {
    const originalFetch = window.fetch;
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

    afterEach(() => {
      window.fetch = originalFetch;
    });

    async function annotateUrl(html, schema = parsedSchema, { blockSchema404 = false } = {}) {
      return runTranslationMetadata({
        html,
        blockSchemaJson: blockSchema404 ? undefined : blockSchemaJsonFromParsed(schema),
        blockSchema404,
      });
    }

    it('should add attributes to HTML elements', async () => {
      const html = `
        <div class="aso-app listing apple">
          <div>
            <div>Subtitle</div>
            <div>Adobe Firefly: AI Generator</div>
          </div>
        </div>
      `;

      const { content: result } = await annotateUrl(html);

      expect(result).to.include('its-storage-size="30"');
      expect(result).to.include('its-loc-note="block-name=aso-app_apple_listing_1_subtitle|fieldName=Subtitle|apply-keywords=true"');
      expect(result).to.include('its-loc-note-type="description"');
    });

    it('should return unchanged HTML if parsedSchema is empty', async () => {
      const html = '<div>Test</div>';
      const { content: result } = await annotateUrl(html, {});
      expect(result).to.equal(html);
    });

    it('should return unchanged HTML if htmlContent is empty', async () => {
      const { content: result } = await annotateUrl('');
      expect(result).to.equal('');
    });

    it('should return unchanged HTML if block schema is unavailable', async () => {
      const html = '<div>Test</div>';
      const { content: result } = await annotateUrl(html, null, { blockSchema404: true });
      expect(result).to.equal(html);
    });

    it('should handle multiple blocks of the same type with correct indexing', async () => {
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

      const { content: result } = await annotateUrl(html);

      expect(result).to.include('block-name=aso-app_apple_listing_1_subtitle');
      expect(result).to.include('block-name=aso-app_apple_listing_2_subtitle');
    });

    it('should handle multiple fields in a block', async () => {
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

      const { content: result } = await annotateUrl(html, schemaWithMultipleFields);

      expect(result).to.include('block-name=aso-app_apple_listing_1_subtitle');
      expect(result).to.include('block-name=aso-app_apple_listing_1_description');
      expect(result).to.include('its-storage-size="30"');
      expect(result).to.include('its-storage-size="4000"');
    });

    it('should handle field without charCount (keywords only)', async () => {
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

      const { content: result } = await annotateUrl(html, schemaKeywordsOnly);

      expect(result).to.not.include('its-storage-size');
      expect(result).to.include('its-loc-note="block-name=aso-app_apple_listing_1_subtitle|fieldName=Subtitle|apply-keywords=true"');
    });

    it('should skip field if field name div not found in HTML', async () => {
      const html = `
        <div class="aso-app listing apple">
          <div>
            <div>Wrong Field Name</div>
            <div>Content</div>
          </div>
        </div>
      `;

      const { content: result } = await annotateUrl(html);

      expect(result).to.not.include('its-storage-size');
      expect(result).to.not.include('its-loc-note');
    });

    it('should skip field if next sibling is not a div', async () => {
      const html = `
        <div class="aso-app listing apple">
          <div>
            <div>Subtitle</div>
            <span>Not a div</span>
          </div>
        </div>
      `;

      const { content: result } = await annotateUrl(html);

      expect(result).to.not.include('its-storage-size');
      expect(result).to.not.include('its-loc-note');
    });

    it('should unwrap single <p> tag from label div', async () => {
      const html = `
        <div class="aso-app listing apple">
          <div>
            <div><p>Subtitle</p></div>
            <div>Adobe Firefly</div>
          </div>
        </div>
      `;

      const { content: result } = await annotateUrl(html);

      expect(result).to.include('<div>Subtitle</div>');
      expect(result).to.not.include('<p>Subtitle</p>');
      expect(result).to.include('its-storage-size="30"');
    });

    it('should unwrap single <p> tag from content div', async () => {
      const html = `
        <div class="aso-app listing apple">
          <div>
            <div>Subtitle</div>
            <div><p>Adobe Firefly</p></div>
          </div>
        </div>
      `;

      const { content: result } = await annotateUrl(html);

      expect(result).to.include('<div its-storage-size="30"');
      expect(result).to.include('>Adobe Firefly</div>');
      expect(result).to.not.include('<p>Adobe Firefly</p>');
    });

    it('should not unwrap multiple <p> tags', async () => {
      const html = `
        <div class="aso-app listing apple">
          <div>
            <div>Subtitle</div>
            <div><p>Line 1</p><p>Line 2</p></div>
          </div>
        </div>
      `;

      const { content: result } = await annotateUrl(html);

      expect(result).to.include('<p>Line 1</p>');
      expect(result).to.include('<p>Line 2</p>');
    });

    it('should unwrap <p> tags when schema has no matching fields', async () => {
      const html = `
        <div class="aso-app listing apple">
          <div>
            <div><p>Label</p></div>
            <div><p>Content</p></div>
          </div>
        </div>
      `;

      const { content: result } = await annotateUrl(html, {});

      expect(result).to.include('<div>Label</div>');
      expect(result).to.include('<div>Content</div>');
      expect(result).to.not.include('<p>Label</p>');
      expect(result).to.not.include('<p>Content</p>');
    });

    it('should be resilient to wrapped content - attributes work even with <p> tags', async () => {
      const htmlWithPTags = `
        <div class="aso-app listing apple">
          <div>
            <div><p>Subtitle</p></div>
            <div><p>Adobe Firefly</p></div>
          </div>
        </div>
      `;

      const { content: result } = await annotateUrl(htmlWithPTags);

      expect(result).to.include('its-storage-size="30"');
      expect(result).to.include('block-name=aso-app_apple_listing_1_subtitle');
      expect(result).to.include('apply-keywords=true');
    });

    it('should NOT match label divs with nested elements (prevents false positives)', async () => {
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

      const { content: result } = await annotateUrl(htmlWithNestedElements);

      const parser = new DOMParser();
      const doc = parser.parseFromString(result, 'text/html');

      const rows = doc.querySelectorAll('.aso-app.listing.apple > div');
      const contentA = rows[0].querySelector(':scope > div:nth-child(2)');
      const contentB = rows[1].querySelector(':scope > div:nth-child(2)');

      expect(contentA.hasAttribute('its-storage-size')).to.be.false;
      expect(contentA.hasAttribute('its-loc-note')).to.be.false;
      expect(contentB.hasAttribute('its-storage-size')).to.be.false;
      expect(contentB.hasAttribute('its-loc-note')).to.be.false;

      const validContent = rows[2].querySelector(':scope > div:nth-child(2)');
      expect(validContent.getAttribute('its-storage-size')).to.equal('30');
      expect(validContent.getAttribute('its-loc-note')).to.include('subtitle');
    });

    it('should add attributes to content div (column 2), not label div (column 1)', async () => {
      const html = `
        <div class="aso-app listing apple">
          <div>
            <div>Subtitle</div>
            <div>Adobe Firefly</div>
          </div>
        </div>
      `;

      const { content: result } = await annotateUrl(html);

      const parser = new DOMParser();
      const doc = parser.parseFromString(result, 'text/html');

      const block = doc.querySelector('.aso-app.listing.apple');
      const row = block.querySelector(':scope > div');
      const labelDiv = row.querySelector(':scope > div:nth-child(1)');
      const contentDiv = row.querySelector(':scope > div:nth-child(2)');

      expect(labelDiv.hasAttribute('its-storage-size')).to.be.false;
      expect(labelDiv.hasAttribute('its-loc-note')).to.be.false;

      expect(contentDiv.hasAttribute('its-storage-size')).to.be.true;
      expect(contentDiv.getAttribute('its-storage-size')).to.equal('30');
      expect(contentDiv.hasAttribute('its-loc-note')).to.be.true;
      expect(contentDiv.getAttribute('its-loc-note')).to.include('block-name=aso-app_apple_listing_1_subtitle');
      expect(contentDiv.hasAttribute('its-loc-note-type')).to.be.true;
    });

    it('should handle empty content divs correctly', async () => {
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

      const { content: result } = await annotateUrl(html, schemaWithDescription);

      const parser = new DOMParser();
      const doc = parser.parseFromString(result, 'text/html');

      const block = doc.querySelector('.aso-app.listing.apple');
      const rows = block.querySelectorAll(':scope > div');

      const row1 = rows[0];
      expect(row1.hasAttribute('its-storage-size')).to.be.false;
      expect(row1.hasAttribute('its-loc-note')).to.be.false;

      const row1Content = row1.querySelector(':scope > div:nth-child(2)');
      expect(row1Content.hasAttribute('its-storage-size')).to.be.true;
      expect(row1Content.getAttribute('its-storage-size')).to.equal('30');

      const row2 = rows[1];
      expect(row2.hasAttribute('its-storage-size')).to.be.false;
      expect(row2.hasAttribute('its-loc-note')).to.be.false;

      const row2Content = row2.querySelector(':scope > div:nth-child(2)');
      expect(row2Content.hasAttribute('its-storage-size')).to.be.true;
      expect(row2Content.getAttribute('its-storage-size')).to.equal('4000');
    });
  });

  describe('buildLanguageMetadata (via addTranslationMetadata)', () => {
    let mockKeywords;
    const languageMapping = [
      { name: 'English', code: 'en' },
      { name: 'French', code: 'fr' },
      { name: 'Japanese', code: 'ja' },
    ];
    const originalFetch = window.fetch;

    const keywordsBlockSchemaJson = blockSchemaJsonFromParsed({
      'aso-app_apple_listing': {
        selector: '.aso-app.apple.listing',
        fields: [{
          fieldName: 'Subtitle',
          fieldKey: 'subtitle',
          charCount: '30',
          keywordsInjection: true,
        }],
      },
    });

    const googleKeywordsBlockSchemaJson = blockSchemaJsonFromParsed({
      'aso-app_google_listing': {
        selector: '.aso-app.google.listing',
        fields: [{
          fieldName: 'Short Description',
          fieldKey: 'short-description',
          charCount: '80',
          keywordsInjection: true,
        }],
      },
    });

    afterEach(() => {
      window.fetch = originalFetch;
    });

    async function metadataUrl({
      html = '<div></div>',
      langs,
      blockSchemaJson = keywordsBlockSchemaJson,
      keywordsData,
      constantsHtml,
    }) {
      return runTranslationMetadata({
        html,
        langs,
        blockSchemaJson,
        keywordsData,
        constantsHtml,
      });
    }

    before(async () => {
      mockKeywords = JSON.parse(await readFile({ path: './mocks/page-keywords.json' }));
    });

    it('should build language metadata for target languages only', async () => {
      const frenchAndJapanese = [
        { name: 'French', code: 'fr' },
        { name: 'Japanese', code: 'ja' },
      ];
      const { translationMetadata: result } = await metadataUrl({
        langs: frenchAndJapanese,
        keywordsData: mockKeywords,
      });

      expect(result).to.have.property('fr');
      expect(result).to.have.property('ja');
      expect(result).to.not.have.property('en');
    });

    it('should create correct metadata keys with block ID, index, and field', async () => {
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

      const { translationMetadata: result } = await metadataUrl({
        langs: frenchOnly,
        keywordsData: mockKeywords,
      });

      expect(result.fr).to.have.property('keywords|aso-app_apple_listing_1_subtitle');
      expect(result.fr).to.have.property('keywords|aso-app_apple_listing_1_description');
      expect(result.fr['keywords|aso-app_apple_listing_1_subtitle']).to.deep.equal({
        value: expectedSubtitle,
        updated: true,
      });
      expect(result.fr['keywords|aso-app_apple_listing_1_description']).to.deep.equal({
        value: expectedDescription,
        updated: true,
      });
    });

    it('should handle multiple blocks', async () => {
      const frenchOnly = [{ name: 'French', code: 'fr' }];
      const expectedBlock2Subtitle = 'éditeur de photos pro, montage professionnel, '
        + 'modifier des photos, outils photo, édition d\'image, filtres photo, '
        + 'retoucher des photos, amélioration photo, montage créatif, studio photo';
      const expectedBlock2Description = 'outils d\'édition photo professionnels, '
        + 'filtres et effets avancés, retoucher et améliorer les images, '
        + 'studio photo créatif';

      const { translationMetadata: result } = await metadataUrl({
        langs: frenchOnly,
        keywordsData: mockKeywords,
      });

      expect(result.fr).to.have.property('keywords|aso-app_apple_listing_1_subtitle');
      expect(result.fr).to.have.property('keywords|aso-app_apple_listing_2_subtitle');
      expect(result.fr['keywords|aso-app_apple_listing_2_subtitle']).to.deep.equal({
        value: expectedBlock2Subtitle,
        updated: true,
      });
      expect(result.fr['keywords|aso-app_apple_listing_2_description']).to.deep.equal({
        value: expectedBlock2Description,
        updated: true,
      });
    });

    it('should omit translationMetadata when keywords file is missing', async () => {
      const url = await metadataUrl({
        langs: languageMapping,
        keywordsData: null,
      });
      expect(url.translationMetadata).to.be.undefined;
    });

    it('should skip metadata keys starting with colon', async () => {
      const { translationMetadata: result } = await metadataUrl({
        langs: languageMapping,
        keywordsData: mockKeywords,
      });

      const keys = Object.keys(result.fr || {});
      const hasDescriptionKey = keys.some((key) => key.includes('description'));
      expect(hasDescriptionKey).to.be.true;
    });

    it('should handle language name not found in languageMapping', async () => {
      const keywordsWithUnknownLang = {
        'aso-app (apple, listing) (1)': {
          total: 1,
          data: [
            { language: 'Unknown Language', Subtitle: 'test' },
          ],
        },
      };

      const { translationMetadata: result } = await metadataUrl({
        langs: languageMapping,
        keywordsData: keywordsWithUnknownLang,
      });

      expect(Object.keys(result || {})).to.have.lengthOf(0);
    });

    it('should exclude language field from metadata', async () => {
      const frenchOnly = [{ name: 'French', code: 'fr' }];
      const { translationMetadata: result } = await metadataUrl({
        langs: frenchOnly,
        keywordsData: mockKeywords,
      });

      const keys = Object.keys(result.fr || {});
      const hasLanguageKey = keys.some((key) => key.includes('language'));
      expect(hasLanguageKey).to.be.false;
    });

    it('should send keywords with updated false when flag is empty or no', async () => {
      const keywords = {
        'aso-app (google, listing) (1)': {
          data: [{
            language: 'French',
            'Short Description': 'keyword text',
            'Short Description (updated)': 'no',
            Description: 'other keyword',
            'Description (updated)': '',
          }],
        },
      };
      const { translationMetadata: result } = await metadataUrl({
        langs: [{ name: 'French', code: 'fr' }],
        keywordsData: keywords,
        blockSchemaJson: googleKeywordsBlockSchemaJson,
      });
      expect(result.fr['keywords|aso-app_google_listing_1_short-description']).to.deep.equal({
        value: 'keyword text',
        updated: false,
      });
      expect(result.fr['keywords|aso-app_google_listing_1_description']).to.deep.equal({
        value: 'other keyword',
        updated: false,
      });
    });

    it('should send empty value when updated is yes and keywords were deleted', async () => {
      const keywords = {
        'aso-app (google, listing) (1)': {
          data: [{
            language: 'Japanese',
            'Short Description': '',
            'Short Description (updated)': 'yes',
          }],
        },
      };
      const { translationMetadata: result } = await metadataUrl({
        langs: [{ name: 'Japanese', code: 'ja' }],
        keywordsData: keywords,
        blockSchemaJson: googleKeywordsBlockSchemaJson,
      });
      expect(result.ja['keywords|aso-app_google_listing_1_short-description']).to.deep.equal({
        value: '',
        updated: true,
      });
    });

    it('should trim keyword value before send', async () => {
      const keywords = {
        'aso-app (google, listing) (1)': {
          data: [{
            language: 'French',
            'Short Description': '  keyword text  ',
            'Short Description (updated)': ' yes ',
          }],
        },
      };
      const { translationMetadata: result } = await metadataUrl({
        langs: [{ name: 'French', code: 'fr' }],
        keywordsData: keywords,
        blockSchemaJson: googleKeywordsBlockSchemaJson,
      });
      expect(result.fr['keywords|aso-app_google_listing_1_short-description']).to.deep.equal({
        value: 'keyword text',
        updated: true,
      });
    });

    it('should send legacy keywords with updated false when column is missing', async () => {
      const legacyKeywords = {
        'aso-app (google, listing) (1)': {
          data: [{
            language: 'French',
            'Short Description': 'legacy keyword',
          }],
        },
      };
      const { translationMetadata: result } = await metadataUrl({
        langs: [{ name: 'French', code: 'fr' }],
        keywordsData: legacyKeywords,
        blockSchemaJson: googleKeywordsBlockSchemaJson,
      });
      expect(result.fr['keywords|aso-app_google_listing_1_short-description']).to.deep.equal({
        value: 'legacy keyword',
        updated: false,
      });
    });

    it('should build metadata from single-sheet keywords files with :sheetname', async () => {
      const singleSheetKeywords = {
        total: 2,
        limit: 2,
        offset: 0,
        data: [
          {
            language: 'English',
            Subtitle: '',
            'Subtitle (updated)': '',
            Description: '',
            'Description (updated)': '',
          },
          {
            language: 'French',
            Subtitle: 'mot-clé sous-titre',
            'Subtitle (updated)': 'yes',
            Description: 'mot-clé description',
            'Description (updated)': 'yes',
          },
        ],
        ':sheetname': 'aso-app (apple, listing) (1)',
        ':type': 'sheet',
      };
      const { translationMetadata: result } = await metadataUrl({
        langs: [{ name: 'French', code: 'fr' }],
        keywordsData: singleSheetKeywords,
      });

      expect(result.fr['keywords|aso-app_apple_listing_1_subtitle']).to.deep.equal({
        value: 'mot-clé sous-titre',
        updated: true,
      });
      expect(result.fr['keywords|aso-app_apple_listing_1_description']).to.deep.equal({
        value: 'mot-clé description',
        updated: true,
      });
    });

    it('should skip keyword metadata when single-sheet file has no :sheetname', async () => {
      const singleSheetKeywords = {
        total: 1,
        limit: 1,
        offset: 0,
        data: [{
          language: 'French',
          Subtitle: 'orphaned keyword',
          'Subtitle (updated)': 'yes',
        }],
        ':type': 'sheet',
      };
      const url = await metadataUrl({
        langs: [{ name: 'French', code: 'fr' }],
        keywordsData: singleSheetKeywords,
      });

      expect(url.translationMetadata).to.be.undefined;
    });

    describe('normalizeKeywordsFile', () => {
      it('should convert single-sheet format to multi-sheet using :sheetname', () => {
        const singleSheet = {
          total: 1,
          offset: 0,
          limit: 1,
          data: [{ language: 'French', Subtitle: 'test' }],
          ':sheetname': 'aso-app (apple, listing) (1)',
          ':type': 'sheet',
        };
        const result = normalizeKeywordsFile(singleSheet);

        expect(result[':type']).to.equal('multi-sheet');
        expect(result[':names']).to.deep.equal(['aso-app (apple, listing) (1)']);
        expect(result['aso-app (apple, listing) (1)'].data).to.deep.equal(singleSheet.data);
      });

      it('should return input unchanged for multi-sheet files', () => {
        const multiSheet = {
          ':type': 'multi-sheet',
          ':names': ['aso-app (apple, listing) (1)'],
          'aso-app (apple, listing) (1)': { data: [{ language: 'French' }] },
        };
        expect(normalizeKeywordsFile(multiSheet)).to.equal(multiSheet);
      });
    });

    describe('updated column helpers', () => {
      it('should detect updated columns with surrounding whitespace', () => {
        expect(isUpdatedColumn(' Short Description (updated) ')).to.be.true;
        expect(isUpdatedColumn('Short Description')).to.be.false;
      });

      it('should parse updated flag case-insensitively with trim', () => {
        expect(parseUpdatedFlag(' YES ')).to.be.true;
        expect(parseUpdatedFlag('True')).to.be.true;
        expect(parseUpdatedFlag('')).to.be.false;
        expect(parseUpdatedFlag('no')).to.be.false;
      });
    });

    describe('placeholders from constants metadata file', () => {
      let mockConstantsHtml;
      const listingSchema = {
        'aso-app_apple_listing': {
          selector: '.aso-app.apple.listing',
          fields: [
            {
              fieldName: 'Description',
              fieldKey: 'description',
              charCount: '4000',
              keywordsInjection: true,
            },
          ],
        },
      };
      const listingBlockSchemaJson = blockSchemaJsonFromParsed(listingSchema);
      const listingHtml = `
        <div class="aso-app listing apple">
          <div>
            <div><p>Description</p></div>
            <div><p>Intro copy</p><p>{{legal-terms}}</p></div>
          </div>
        </div>
      `;

      before(async () => {
        mockConstantsHtml = await readFile({ path: './mocks/page-constants.html' });
      });

      it('should add placeholders metadata for target languages only', async () => {
        const { translationMetadata: result } = await metadataUrl({
          html: listingHtml,
          langs: [
            { name: 'Japanese', code: 'ja' },
            { name: 'French', code: 'fr' },
          ],
          constantsHtml: mockConstantsHtml,
          blockSchemaJson: listingBlockSchemaJson,
          keywordsData: null,
        });

        expect(result).to.deep.equal({
          ja: {
            'placeholders|aso-app_apple_listing_1_description': {
              'legal-terms': '<p>[オプションのアクセス権]</p><p>カメラ: ページをスキャン</p>',
            },
          },
        });
      });

      it('should resolve placeholders when slug is one of multiple block classes', async () => {
        const constantsHtml = `
          <body><main><div>
            <div class="legacy-wrapper legal-terms">
              <div>
                <div><p>Japanese</p></div>
                <div><p>LEGACY JA</p></div>
              </div>
            </div>
          </div></main></body>
        `;
        const { translationMetadata: result } = await metadataUrl({
          html: listingHtml,
          langs: [{ name: 'Japanese', code: 'ja' }],
          constantsHtml,
          blockSchemaJson: listingBlockSchemaJson,
          keywordsData: null,
        });

        expect(result).to.deep.equal({
          ja: {
            'placeholders|aso-app_apple_listing_1_description': {
              'legal-terms': '<p>LEGACY JA</p>',
            },
          },
        });
      });

      it('should include both keywords and placeholders for the same locale', async () => {
        const { translationMetadata: result } = await metadataUrl({
          html: listingHtml,
          langs: [{ name: 'Japanese', code: 'ja' }],
          constantsHtml: mockConstantsHtml,
          blockSchemaJson: listingBlockSchemaJson,
          keywordsData: {
            'aso-app (apple, listing) (1)': {
              data: [{
                language: 'Japanese',
                Description: 'keyword string',
                'Description (updated)': 'yes',
              }],
            },
          },
        });

        expect(result).to.deep.equal({
          ja: {
            'keywords|aso-app_apple_listing_1_description': {
              value: 'keyword string',
              updated: true,
            },
            'placeholders|aso-app_apple_listing_1_description': {
              'legal-terms': '<p>[オプションのアクセス権]</p><p>カメラ: ページをスキャン</p>',
            },
          },
        });
      });

      it('should include multiple placeholder slugs in one field when all are mapped', async () => {
        const constantsHtml = `
          <body><main><div>
            <div class="legal-terms">
              <div>
                <div><p>Japanese</p></div>
                <div><p>LEGAL JA</p></div>
              </div>
            </div>
            <div class="privacy-note">
              <div>
                <div><p>Japanese</p></div>
                <div><p>PRIVACY JA</p></div>
              </div>
            </div>
          </div></main></body>
        `;
        const pageHtml = `
          <div class="aso-app listing apple">
            <div>
              <div><p>Description</p></div>
              <div><p>{{legal-terms}}</p><p>{{privacy-note}}</p></div>
            </div>
          </div>
        `;
        const { translationMetadata: result } = await metadataUrl({
          html: pageHtml,
          langs: [{ name: 'Japanese', code: 'ja' }],
          constantsHtml,
          blockSchemaJson: listingBlockSchemaJson,
          keywordsData: null,
        });

        expect(result).to.deep.equal({
          ja: {
            'placeholders|aso-app_apple_listing_1_description': {
              'legal-terms': '<p>LEGAL JA</p>',
              'privacy-note': '<p>PRIVACY JA</p>',
            },
          },
        });
      });

      it('should omit unmapped slugs but keep mapped ones in placeholders metadata', async () => {
        const constantsHtml = `
          <body><main><div>
            <div class="legal-terms">
              <div>
                <div><p>Japanese</p></div>
                <div><p>LEGAL JA</p></div>
              </div>
            </div>
            <div class="privacy-note">
              <div>
                <div><p>Japanese</p></div>
                <div></div>
              </div>
            </div>
          </div></main></body>
        `;
        const pageHtml = `
          <div class="aso-app listing apple">
            <div>
              <div><p>Description</p></div>
              <div><p>{{legal-terms}} and {{privacy-note}}</p></div>
            </div>
          </div>
        `;
        const { translationMetadata: result } = await metadataUrl({
          html: pageHtml,
          langs: [{ name: 'Japanese', code: 'ja' }],
          constantsHtml,
          blockSchemaJson: listingBlockSchemaJson,
          keywordsData: null,
        });

        expect(result).to.deep.equal({
          ja: {
            'placeholders|aso-app_apple_listing_1_description': {
              'legal-terms': '<p>LEGAL JA</p>',
            },
          },
        });
      });

      it('should omit placeholders metadata when no slugs resolve for a target locale', async () => {
        const constantsHtml = `
          <body><main><div>
            <div class="legal-terms">
              <div>
                <div><p>Japanese</p></div>
                <div></div>
              </div>
              <div>
                <div><p>French</p></div>
                <div></div>
              </div>
            </div>
            <div class="privacy-note">
              <div>
                <div><p>Japanese</p></div>
                <div></div>
              </div>
            </div>
          </div></main></body>
        `;
        const pageHtml = `
          <div class="aso-app listing apple">
            <div>
              <div><p>Description</p></div>
              <div><p>{{legal-terms}} {{privacy-note}}</p></div>
            </div>
          </div>
        `;
        const url = await metadataUrl({
          html: pageHtml,
          langs: [
            { name: 'Japanese', code: 'ja' },
            { name: 'French', code: 'fr' },
          ],
          constantsHtml,
          blockSchemaJson: listingBlockSchemaJson,
          keywordsData: null,
        });

        expect(url.translationMetadata).to.be.undefined;
      });

      it('should emit separate placeholders metadata per field with different slug sets', async () => {
        const constantsHtml = `
          <body><main><div>
            <div class="legal-terms">
              <div>
                <div><p>Japanese</p></div>
                <div><p>LEGAL JA</p></div>
              </div>
            </div>
            <div class="promo-disclaimer">
              <div>
                <div><p>Japanese</p></div>
                <div><p>PROMO JA</p></div>
              </div>
            </div>
          </div></main></body>
        `;
        const schema = {
          'aso-app_apple_listing': {
            selector: '.aso-app.apple.listing',
            fields: [
              {
                fieldName: 'Description',
                fieldKey: 'description',
                charCount: '4000',
                keywordsInjection: true,
              },
              {
                fieldName: 'Promotional Text',
                fieldKey: 'promotional-text',
                charCount: '170',
                keywordsInjection: false,
              },
            ],
          },
        };
        const pageHtml = `
          <div class="aso-app listing apple">
            <div>
              <div><p>Description</p></div>
              <div><p>{{legal-terms}}</p></div>
            </div>
            <div>
              <div><p>Promotional Text</p></div>
              <div><p>{{promo-disclaimer}}</p></div>
            </div>
          </div>
        `;
        const { translationMetadata: result } = await metadataUrl({
          html: pageHtml,
          langs: [{ name: 'Japanese', code: 'ja' }],
          constantsHtml,
          blockSchemaJson: blockSchemaJsonFromParsed(schema),
          keywordsData: null,
        });

        expect(result).to.deep.equal({
          ja: {
            'placeholders|aso-app_apple_listing_1_description': {
              'legal-terms': '<p>LEGAL JA</p>',
            },
            'placeholders|aso-app_apple_listing_1_promotional-text': {
              'promo-disclaimer': '<p>PROMO JA</p>',
            },
          },
        });
      });
    });
  });
  describe('addSeoGlossary (languageContext)', () => {
    const org = 'test-org';
    const site = 'test-site';
    const originalFetch = window.fetch;
    let mockSeoGlossary;

    beforeEach(() => {
      mockSeoGlossary = { glossary404: false, glossaryBody: {} };
      window.fetch = sinon.stub().callsFake((input) => {
        const url = typeof input === 'string' ? input : input.url;
        if (!String(url).includes('/.da/seo/glossary.json')) {
          return mockRes({ payload: '', status: 404, ok: false });
        }
        if (mockSeoGlossary.glossary404) {
          return mockRes({ payload: null, status: 404, ok: false });
        }
        return mockRes({ payload: mockSeoGlossary.glossaryBody, status: 200, ok: true });
      });
    });

    afterEach(() => {
      window.fetch = originalFetch;
    });

    async function primeGlossaryFromFetch() {
      await loadSeoGlossary(org, site, { reset: true });
    }

    it('adds languageContext grouped by EN KEYWORDS (canonical rows + :private prefix)', async () => {
      mockSeoGlossary.glossaryBody = {
        de: {
          data: [
            { URL: '/creativecloud/pcx-file.html', 'EN KEYWORDS': 'pcx file', 'TRANSLATED KEYWORDS': 'PCX-Datei', 'LOCAL MSV': '70', 'LOCAL PRIORITY': 'Priority 1' },
            { URL: '/creativecloud/pcx-file.html', 'EN KEYWORDS': 'pcx file', 'TRANSLATED KEYWORDS': 'PCX-Datei alt', 'LOCAL MSV': '10', 'LOCAL PRIORITY': 'Priority 2' },
            { URL: '/creativecloud/pcx-file.html', 'EN KEYWORDS': 'pcx viewer', 'TRANSLATED KEYWORDS': 'PCX öffnen', 'LOCAL MSV': '20', 'LOCAL PRIORITY': '' },
          ],
        },
        ':private': {
          'private-stage-prefixes': {
            total: 1,
            limit: 1,
            offset: 0,
            data: [{ prefixes: '/drafts/seo-test/' }],
          },
        },
      };
      const urls = [{ suppliedPath: '/drafts/seo-test/creativecloud/pcx-file', content: '<p>x</p>' }];
      await primeGlossaryFromFetch();
      addSeoGlossary(urls, [{ code: 'de' }]);
      expect(urls[0].languageContext).to.deep.equal({
        de: {
          keywords: [
            {
              sourceKeyword: 'pcx file',
              targetKeywords: [
                { keyword: 'PCX-Datei', msv: '70', priority: 'Priority 1' },
                { keyword: 'PCX-Datei alt', msv: '10', priority: 'Priority 2' },
              ],
            },
            {
              sourceKeyword: 'pcx viewer',
              targetKeywords: [
                { keyword: 'PCX öffnen', msv: '20', priority: '' },
              ],
            },
          ],
        },
      });
    });

    it('normalizes full URL suppliedPath and matches with :private', async () => {
      mockSeoGlossary.glossaryBody = {
        fr: {
          data: [
            { URL: '/creativecloud/gif-file.html', 'EN KEYWORDS': 'gif', 'TRANSLATED KEYWORDS': 'GIF', 'LOCAL MSV': '100', 'LOCAL PRIORITY': '1' },
          ],
        },
        ':private': {
          'private-stage-prefixes': {
            data: [{ prefixes: '/drafts/seo-test/' }],
          },
        },
      };
      const urls = [{
        suppliedPath: 'https://main--da-cc--adobecom.aem.page/drafts/seo-test/creativecloud/gif-file.html',
        content: '<p>x</p>',
      }];
      await primeGlossaryFromFetch();
      addSeoGlossary(urls, [{ code: 'fr' }]);
      expect(urls[0].languageContext).to.deep.equal({
        fr: {
          keywords: [
            {
              sourceKeyword: 'gif',
              targetKeywords: [
                { keyword: 'GIF', msv: '100', priority: '1' },
              ],
            },
          ],
        },
      });
    });

    it('normalizes langstore/en in suppliedPath (loc pipeline) so glossary rows match', async () => {
      mockSeoGlossary.glossaryBody = {
        fr: {
          data: [
            { URL: '/creativecloud/gif-file.html', 'EN KEYWORDS': 'gif', 'TRANSLATED KEYWORDS': 'GIF', 'LOCAL MSV': '100', 'LOCAL PRIORITY': '1' },
          ],
        },
        ':private': {
          'private-stage-prefixes': {
            data: [{ prefixes: '/drafts/seo-test/' }],
          },
        },
      };
      // Loc puts langstore first (not …/drafts/…/langstore/en/…). Extra `/` after `en` is ok.
      const urls = [{
        suppliedPath: '/langstore/en/drafts/seo-test/creativecloud/gif-file.html',
        content: '<p>x</p>',
      }];
      await primeGlossaryFromFetch();
      addSeoGlossary(urls, [{ code: 'fr' }]);
      expect(urls[0].languageContext).to.deep.equal({
        fr: {
          keywords: [
            {
              sourceKeyword: 'gif',
              targetKeywords: [
                { keyword: 'GIF', msv: '100', priority: '1' },
              ],
            },
          ],
        },
      });
    });

    it('skips locales with no matching rows', async () => {
      mockSeoGlossary.glossaryBody = {
        de: {
          data: [
            { URL: '/other/page.html', 'EN KEYWORDS': 'x', 'TRANSLATED KEYWORDS': 'y', 'LOCAL MSV': '', 'LOCAL PRIORITY': '' },
          ],
        },
        fr: {
          data: [
            { URL: '/creativecloud/gif-file.html', 'EN KEYWORDS': 'gif', 'TRANSLATED KEYWORDS': 'GIF', 'LOCAL MSV': '', 'LOCAL PRIORITY': '' },
          ],
        },
        ':private': {
          'private-stage-prefixes': {
            data: [{ prefixes: '/drafts/seo-test/' }],
          },
        },
      };
      const urls = [{ suppliedPath: '/drafts/seo-test/creativecloud/gif-file', content: '<p>x</p>' }];
      await primeGlossaryFromFetch();
      addSeoGlossary(urls, [{ code: 'de' }, { code: 'fr' }]);
      expect(urls[0].languageContext).to.deep.equal({
        fr: {
          keywords: [
            {
              sourceKeyword: 'gif',
              targetKeywords: [
                { keyword: 'GIF', msv: '', priority: '' },
              ],
            },
          ],
        },
      });
    });

    it('matches without :private when page path equals canonical row path', async () => {
      mockSeoGlossary.glossaryBody = {
        de: {
          data: [
            { URL: '/creativecloud/gif-file.html', 'EN KEYWORDS': 'gif', 'TRANSLATED KEYWORDS': 'GIF', 'LOCAL MSV': '', 'LOCAL PRIORITY': '' },
          ],
        },
      };
      const urls = [{ suppliedPath: '/creativecloud/gif-file', content: '<p>x</p>' }];
      await primeGlossaryFromFetch();
      addSeoGlossary(urls, [{ code: 'de' }]);
      expect(urls[0].languageContext).to.deep.equal({
        de: {
          keywords: [
            {
              sourceKeyword: 'gif',
              targetKeywords: [
                { keyword: 'GIF', msv: '', priority: '' },
              ],
            },
          ],
        },
      });
    });

    it('uses longest matching :private prefix (not a shorter prefix that is a string-prefix of the path)', async () => {
      mockSeoGlossary.glossaryBody = {
        de: {
          data: [
            { URL: '/creativecloud/foo.html', 'EN KEYWORDS': 'canonical', 'TRANSLATED KEYWORDS': 'ok', 'LOCAL MSV': '', 'LOCAL PRIORITY': '' },
            { URL: '/seo-test-stage/creativecloud/foo.html', 'EN KEYWORDS': 'wrong-if-short-prefix', 'TRANSLATED KEYWORDS': 'bad', 'LOCAL MSV': '', 'LOCAL PRIORITY': '' },
          ],
        },
        ':private': {
          'private-stage-prefixes': {
            data: [
              { prefixes: '/drafts/seo-test/' },
              { prefixes: '/drafts/seo-test-stage/' },
            ],
          },
        },
      };
      const urls = [{ suppliedPath: '/drafts/seo-test-stage/creativecloud/foo', content: '<p>x</p>' }];
      await primeGlossaryFromFetch();
      addSeoGlossary(urls, [{ code: 'de' }]);
      expect(urls[0].languageContext).to.deep.equal({
        de: {
          keywords: [
            {
              sourceKeyword: 'canonical',
              targetKeywords: [
                { keyword: 'ok', msv: '', priority: '' },
              ],
            },
          ],
        },
      });
    });

    it('sets a different languageContext per page path when batching multiple urls', async () => {
      // Rows mirror `de` in `.implementation-docs/seo-implementation/glossary-combined.json`.
      mockSeoGlossary.glossaryBody = {
        de: {
          data: [
            { URL: '/creativecloud/file-types/image/raster/pcx-file.html', 'EN KEYWORDS': 'pcx file', 'TRANSLATED KEYWORDS': 'PCX-Datei', 'LOCAL MSV': '70', 'LOCAL PRIORITY': 'Priority 1' },
            { URL: '/creativecloud/illustration/discover/fashion-illustration.html', 'EN KEYWORDS': 'fashion illustration', 'TRANSLATED KEYWORDS': 'Modezeichnung', 'LOCAL MSV': '100', 'LOCAL PRIORITY': 'Priority 2' },
          ],
        },
        ':private': {
          'private-stage-prefixes': {
            data: [{ prefixes: '/drafts/seo-test/' }],
          },
        },
      };
      const urls = [
        { suppliedPath: '/drafts/seo-test/creativecloud/file-types/image/raster/pcx-file', content: '<p>a</p>' },
        { suppliedPath: '/drafts/seo-test/creativecloud/illustration/discover/fashion-illustration', content: '<p>b</p>' },
        { suppliedPath: '/drafts/seo-test/creativecloud/no-glossary-rows', content: '<p>c</p>' },
      ];
      await primeGlossaryFromFetch();
      addSeoGlossary(urls, [{ code: 'de' }]);
      expect(urls[0].languageContext).to.deep.equal({
        de: {
          keywords: [
            {
              sourceKeyword: 'pcx file',
              targetKeywords: [
                { keyword: 'PCX-Datei', msv: '70', priority: 'Priority 1' },
              ],
            },
          ],
        },
      });
      expect(urls[1].languageContext).to.deep.equal({
        de: {
          keywords: [
            {
              sourceKeyword: 'fashion illustration',
              targetKeywords: [
                { keyword: 'Modezeichnung', msv: '100', priority: 'Priority 2' },
              ],
            },
          ],
        },
      });
      expect(urls[2].languageContext).to.equal(undefined);
    });

    it('does not set languageContext when glossary file is missing (404)', async () => {
      mockSeoGlossary.glossary404 = true;
      const urls = [{ suppliedPath: '/any/path', content: '<p>x</p>' }];
      await primeGlossaryFromFetch();
      addSeoGlossary(urls, [{ code: 'de' }]);
      expect(urls[0].languageContext).to.equal(undefined);
    });
  });
});
