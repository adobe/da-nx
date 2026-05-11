import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import { convertHtmlToJson } from '../../../nx/blocks/form/app/html2json.js';
import { cleanHtmlWhitespace } from './test-utils.js';

describe('HTML to JSON Conversion', () => {
  describe('Basic conversions', () => {
    it('converts a simple block to JSON', () => {
      const html = `
        <main>
          <div>
            <div class="da-form">
              <div><div><p>x-schema-name</p></div><div><p>test-schema</p></div></div>
            </div>
            <div class="test-schema">
              <div><div><p>name</p></div><div><p>John Doe</p></div></div>
              <div><div><p>email</p></div><div><p>john@example.com</p></div></div>
            </div>
          </div>
        </main>
      `;

      const json = convertHtmlToJson(html);
      expect(json.metadata.schemaName).to.equal('test-schema');
      expect(json.data.name).to.equal('John Doe');
      expect(json.data.email).to.equal('john@example.com');
    });

    it('handles empty values', () => {
      const html = `
        <main>
          <div>
            <div class="da-form">
              <div><div><p>x-schema-name</p></div><div><p>test-schema</p></div></div>
            </div>
            <div class="test-schema">
              <div><div><p>emptyField</p></div><div></div></div>
            </div>
          </div>
        </main>
      `;

      const json = convertHtmlToJson(html);
      expect(json.data.emptyField).to.equal('');
    });

    it('converts boolean values', () => {
      const html = `
        <main>
          <div>
            <div class="da-form">
              <div><div><p>x-schema-name</p></div><div><p>test-schema</p></div></div>
            </div>
            <div class="test-schema">
              <div><div><p>isActive</p></div><div><p>true</p></div></div>
              <div><div><p>isDisabled</p></div><div><p>false</p></div></div>
            </div>
          </div>
        </main>
      `;

      const json = convertHtmlToJson(html);
      expect(json.data.isActive).to.equal(true);
      expect(json.data.isDisabled).to.equal(false);
    });

    it('converts number values', () => {
      const html = `
        <main>
          <div>
            <div class="da-form">
              <div><div><p>x-schema-name</p></div><div><p>test-schema</p></div></div>
            </div>
            <div class="test-schema">
              <div><div><p>age</p></div><div><p>25</p></div></div>
              <div><div><p>price</p></div><div><p>99.99</p></div></div>
              <div><div><p>zero</p></div><div><p>0</p></div></div>
            </div>
          </div>
        </main>
      `;

      const json = convertHtmlToJson(html);
      expect(json.data.age).to.equal(25);
      expect(json.data.price).to.equal(99.99);
      expect(json.data.zero).to.equal(0);
    });

    it('handles metadata properties', () => {
      const html = `
        <main>
          <div>
            <div class="da-form">
              <div><div><p>x-schema-name</p></div><div><p>test-schema</p></div></div>
              <div><div><p>version</p></div><div><p>1.0</p></div></div>
              <div><div><p>author</p></div><div><p>Test Author</p></div></div>
            </div>
            <div class="test-schema">
              <div><div><p>field</p></div><div><p>value</p></div></div>
            </div>
          </div>
        </main>
      `;

      const json = convertHtmlToJson(html);
      expect(json.metadata.schemaName).to.equal('test-schema');
      expect(json.metadata.version).to.equal(1);
      expect(json.metadata.author).to.equal('Test Author');
    });

    it('returns null for empty or non-string input', () => {
      expect(convertHtmlToJson('')).to.equal(null);
      expect(convertHtmlToJson('   ')).to.equal(null);
      expect(convertHtmlToJson(null)).to.equal(null);
      expect(convertHtmlToJson(undefined)).to.equal(null);
    });
  });

  describe('Nested arrays', () => {
    it('converts arrays of arrays (primitives)', () => {
      const html = `
        <main>
          <div>
            <div class="da-form">
              <div><div><p>x-schema-name</p></div><div><p>test-schema</p></div></div>
            </div>
            <div class="test-schema">
              <div><div><p>items</p></div><div><ul><li>self://#items-abc123</li><li>self://#items-def456</li></ul></div></div>
            </div>
            <div class="items items-abc123">
              <div><div><p>@items</p></div><div><ul><li>Item 1A</li><li>Item 1B</li></ul></div></div>
            </div>
            <div class="items items-def456">
              <div><div><p>@items</p></div><div><ul><li>Item 2A</li><li>Item 2B</li></ul></div></div>
            </div>
          </div>
        </main>
      `;

      const json = convertHtmlToJson(html);
      expect(json.metadata.schemaName).to.equal('test-schema');
      expect(json.data.items).to.be.an('array').with.lengthOf(2);
      expect(json.data.items[0]).to.deep.equal(['Item 1A', 'Item 1B']);
      expect(json.data.items[1]).to.deep.equal(['Item 2A', 'Item 2B']);
    });

    it('converts arrays of arrays (objects)', () => {
      const html = `
        <main>
          <div>
            <div class="da-form">
              <div><div><p>x-schema-name</p></div><div><p>test-schema</p></div></div>
            </div>
            <div class="test-schema">
              <div><div><p>groups</p></div><div><ul><li>self://#groups-abc123</li><li>self://#groups-def456</li></ul></div></div>
            </div>
            <div class="groups groups-abc123">
              <div><div><p>@items</p></div><div><ul><li>self://#groups-obj1</li><li>self://#groups-obj2</li></ul></div></div>
            </div>
            <div class="groups groups-def456">
              <div><div><p>@items</p></div><div><ul><li>self://#groups-obj3</li></ul></div></div>
            </div>
            <div class="groups groups-obj1">
              <div><div><p>name</p></div><div><p>Item 1</p></div></div>
              <div><div><p>value</p></div><div><p>A</p></div></div>
            </div>
            <div class="groups groups-obj2">
              <div><div><p>name</p></div><div><p>Item 2</p></div></div>
              <div><div><p>value</p></div><div><p>B</p></div></div>
            </div>
            <div class="groups groups-obj3">
              <div><div><p>name</p></div><div><p>Item 3</p></div></div>
              <div><div><p>value</p></div><div><p>C</p></div></div>
            </div>
          </div>
        </main>
      `;

      const json = convertHtmlToJson(html);
      expect(json.data.groups).to.be.an('array').with.lengthOf(2);
      expect(json.data.groups[0][0]).to.deep.equal({ name: 'Item 1', value: 'A' });
      expect(json.data.groups[0][1]).to.deep.equal({ name: 'Item 2', value: 'B' });
      expect(json.data.groups[1][0]).to.deep.equal({ name: 'Item 3', value: 'C' });
    });

    it('converts arrays within nested objects', () => {
      const html = `
        <main>
          <div>
            <div class="da-form">
              <div><div><p>x-schema-name</p></div><div><p>test-schema</p></div></div>
            </div>
            <div class="test-schema">
              <div><div><p>records</p></div><div><ul><li>self://#records-abc123</li><li>self://#records-def456</li></ul></div></div>
            </div>
            <div class="records records-abc123">
              <div><div><p>name</p></div><div><p>Record 1</p></div></div>
              <div><div><p>tags</p></div><div><ul><li>Tag 1A</li><li>Tag 1B</li><li>Tag 1C</li></ul></div></div>
            </div>
            <div class="records records-def456">
              <div><div><p>name</p></div><div><p>Record 2</p></div></div>
              <div><div><p>tags</p></div><div><ul><li>Tag 2A</li><li>Tag 2B</li></ul></div></div>
            </div>
          </div>
        </main>
      `;

      const json = convertHtmlToJson(html);
      expect(json.data.records).to.be.an('array').with.lengthOf(2);
      expect(json.data.records[0].name).to.equal('Record 1');
      expect(json.data.records[0].tags).to.deep.equal(['Tag 1A', 'Tag 1B', 'Tag 1C']);
      expect(json.data.records[1].name).to.equal('Record 2');
      expect(json.data.records[1].tags).to.deep.equal(['Tag 2A', 'Tag 2B']);
    });
  });

  describe('Real-world fixtures', () => {
    async function compareFixture(name) {
      const htmlRaw = await readFile({ path: `./mocks/${name}.html` });
      const expectedJson = JSON.parse(await readFile({ path: `./mocks/${name}.json` }));
      const json = convertHtmlToJson(cleanHtmlWhitespace(htmlRaw));
      expect(json.metadata).to.deep.equal(expectedJson.metadata);
      expect(json.data).to.deep.equal(expectedJson.data);
    }

    it('converts simpleForm.html', () => compareFixture('simpleForm'));
    it('converts nestedForm.html', () => compareFixture('nestedForm'));
    it('converts simpleArray.html', () => compareFixture('simpleArray'));
    it('converts nestedArrays.html', () => compareFixture('nestedArrays'));
    it('converts rootArray.html', () => compareFixture('rootArray'));
    it('converts invalidForm.html', () => compareFixture('invalidForm'));
  });
});
