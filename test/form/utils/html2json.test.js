import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import HTMLConverter from '../../../nx/blocks/form/utils/html2json.js';
import { cleanHtmlWhitespace } from './utils.js';

describe('HTML to JSON Conversion', () => {
  describe('HTMLConverter - Basic Conversions', () => {
    it('should convert simple HTML block to JSON', () => {
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

      const converter = new HTMLConverter(html);
      expect(converter.json.metadata.schemaName).to.equal('test-schema');
      expect(converter.json.data.name).to.equal('John Doe');
      expect(converter.json.data.email).to.equal('john@example.com');
    });

    it('should handle empty values', () => {
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

      const converter = new HTMLConverter(html);
      expect(converter.json.data.emptyField).to.equal('');
    });

    it('should convert boolean values', () => {
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

      const converter = new HTMLConverter(html);
      expect(converter.json.data.isActive).to.equal(true);
      expect(converter.json.data.isDisabled).to.equal(false);
    });

    it('should convert number values', () => {
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

      const converter = new HTMLConverter(html);
      expect(converter.json.data.age).to.equal(25);
      expect(converter.json.data.price).to.equal(99.99);
      expect(converter.json.data.zero).to.equal(0);
    });

    it('should handle metadata properties', () => {
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

      const converter = new HTMLConverter(html);
      expect(converter.json.metadata.schemaName).to.equal('test-schema');
      expect(converter.json.metadata.version).to.equal(1);
      expect(converter.json.metadata.author).to.equal('Test Author');
    });
  });

  describe('Nested Arrays Conversion', () => {
    it('should convert arrays of arrays (primitives) from HTML to JSON', () => {
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

      const converter = new HTMLConverter(html);
      const { json } = converter;

      expect(json.metadata.schemaName).to.equal('test-schema');
      expect(json.data.items).to.be.an('array');
      expect(json.data.items).to.have.lengthOf(2);
      expect(json.data.items[0]).to.deep.equal(['Item 1A', 'Item 1B']);
      expect(json.data.items[1]).to.deep.equal(['Item 2A', 'Item 2B']);
    });

    it('should convert arrays of arrays (objects) from HTML to JSON', () => {
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

      const converter = new HTMLConverter(html);
      const { json } = converter;

      expect(json.metadata.schemaName).to.equal('test-schema');
      expect(json.data.groups).to.be.an('array');
      expect(json.data.groups).to.have.lengthOf(2);
      expect(json.data.groups[0]).to.be.an('array');
      expect(json.data.groups[0]).to.have.lengthOf(2);
      expect(json.data.groups[0][0]).to.deep.equal({ name: 'Item 1', value: 'A' });
      expect(json.data.groups[0][1]).to.deep.equal({ name: 'Item 2', value: 'B' });
      expect(json.data.groups[1][0]).to.deep.equal({ name: 'Item 3', value: 'C' });
    });

    it('should convert arrays within nested objects from HTML to JSON', () => {
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

      const converter = new HTMLConverter(html);
      const { json } = converter;

      expect(json.metadata.schemaName).to.equal('test-schema');
      expect(json.data.records).to.be.an('array');
      expect(json.data.records).to.have.lengthOf(2);
      expect(json.data.records[0].name).to.equal('Record 1');
      expect(json.data.records[0].tags).to.deep.equal(['Tag 1A', 'Tag 1B', 'Tag 1C']);
      expect(json.data.records[1].name).to.equal('Record 2');
      expect(json.data.records[1].tags).to.deep.equal(['Tag 2A', 'Tag 2B']);
    });
  });

  describe('Real-world Examples', () => {
    it('should read simpleForm files', async () => {
      const html = await readFile({ path: './mocks/simpleForm.html' });
      const json = await readFile({ path: './mocks/simpleForm.json' });

      expect(html).to.be.a('string');
      expect(html).to.include('coffee-promotion');
      expect(json).to.be.a('string');
      expect(JSON.parse(json)).to.have.property('metadata');
    });

    it('should convert simpleForm.html to expected JSON', async () => {
      const htmlRaw = await readFile({ path: './mocks/simpleForm.html' });
      const html = cleanHtmlWhitespace(htmlRaw);

      const simpleFormJson = await readFile({ path: './mocks/simpleForm.json' });
      const expectedJson = JSON.parse(simpleFormJson);

      const converter = new HTMLConverter(html);
      const convertedJson = converter.json;

      // Test metadata
      expect(convertedJson.metadata.schemaName).to.equal(expectedJson.metadata.schemaName);
      expect(convertedJson.metadata.title).to.equal(expectedJson.metadata.title);

      // Test simple fields
      expect(convertedJson.data.headline).to.equal(expectedJson.data.headline);
      expect(convertedJson.data.detail).to.equal(expectedJson.data.detail);

      // Test array of primitives
      expect(convertedJson.data.list).to.be.an('array');
      expect(convertedJson.data.list).to.deep.equal(expectedJson.data.list);

      // Test array of objects
      expect(convertedJson.data.ctas).to.be.an('array');
      expect(convertedJson.data.ctas.length).to.equal(expectedJson.data.ctas.length);
      expect(convertedJson.data.ctas).to.deep.equal(expectedJson.data.ctas);
    });

    it('should convert nestedForm.html to expected JSON', async () => {
      const htmlRaw = await readFile({ path: './mocks/nestedForm.html' });
      const html = cleanHtmlWhitespace(htmlRaw);

      const nestedFormJson = await readFile({ path: './mocks/nestedForm.json' });
      const expectedJson = JSON.parse(nestedFormJson);

      const converter = new HTMLConverter(html);
      const convertedJson = converter.json;

      expect(convertedJson.metadata).to.deep.equal(expectedJson.metadata);
      expect(convertedJson.data).to.deep.equal(expectedJson.data);
    });

    it('should convert simpleArray.html to expected JSON', async () => {
      const htmlRaw = await readFile({ path: './mocks/simpleArray.html' });
      const html = cleanHtmlWhitespace(htmlRaw);

      const simpleArrayJson = await readFile({ path: './mocks/simpleArray.json' });
      const expectedJson = JSON.parse(simpleArrayJson);

      const converter = new HTMLConverter(html);

      const convertedJson = converter.json;

      expect(convertedJson.metadata).to.deep.equal(expectedJson.metadata);
      expect(convertedJson.data).to.deep.equal(expectedJson.data);
    });

    it('should convert nestedArrays.html to expected JSON', async () => {
      const htmlRaw = await readFile({ path: './mocks/nestedArrays.html' });
      const html = cleanHtmlWhitespace(htmlRaw);

      const nestedArraysJson = await readFile({ path: './mocks/nestedArrays.json' });
      const expectedJson = JSON.parse(nestedArraysJson);

      const converter = new HTMLConverter(html);
      const convertedJson = converter.json;

      expect(convertedJson.metadata).to.deep.equal(expectedJson.metadata);
      expect(convertedJson.data).to.deep.equal(expectedJson.data);
    });
  });
});
