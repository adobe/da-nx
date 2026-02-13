import { expect } from '@esm-bundle/chai';
import HTMLConverter from '../../../nx/blocks/form/utils/html2json.js';
import json2html from '../../../nx/blocks/form/utils/json2html.js';

describe('JSON to HTML Conversion', () => {
  it('should convert simple JSON to HTML', () => {
    const json = {
      metadata: {
        schemaName: 'test-schema',
      },
      data: {
        name: 'John Doe',
        email: 'john@example.com',
      },
    };

    const html = json2html(json);
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const daForm = doc.querySelector('.da-form');
    expect(daForm).to.exist;

    const dataBlock = doc.querySelector('.test-schema');
    expect(dataBlock).to.exist;

    const rows = dataBlock.querySelectorAll(':scope > div');
    expect(rows).to.have.lengthOf(2);
  });

  it('should handle boolean and number values in JSON', () => {
    const json = {
      metadata: {
        schemaName: 'test-schema',
      },
      data: {
        isActive: true,
        count: 42,
        price: 99.99,
      },
    };

    const html = json2html(json);

    expect(html).to.include('true');
    expect(html).to.include('42');
    expect(html).to.include('99.99');
  });

  it('should handle arrays of primitives', () => {
    const json = {
      metadata: {
        schemaName: 'test-schema',
      },
      data: {
        tags: ['tag1', 'tag2', 'tag3'],
      },
    };

    const html = json2html(json);
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const ul = doc.querySelector('ul');
    expect(ul).to.exist;

    const listItems = ul.querySelectorAll('li');
    expect(listItems).to.have.lengthOf(3);
    expect(listItems[0].textContent).to.equal('tag1');
    expect(listItems[1].textContent).to.equal('tag2');
    expect(listItems[2].textContent).to.equal('tag3');
  });

  it('should handle empty arrays', () => {
    const json = {
      metadata: {
        schemaName: 'test-schema',
      },
      data: {
        emptyList: [],
      },
    };

    const html = json2html(json);
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const ul = doc.querySelector('ul');
    expect(ul).to.exist;

    const listItems = ul.querySelectorAll('li');
    expect(listItems).to.have.lengthOf(1);
    expect(listItems[0].textContent).to.equal('');
  });

  it('should create nested blocks for object values', () => {
    const json = {
      metadata: {
        schemaName: 'test-schema',
      },
      data: {
        address: {
          street: '123 Main St',
          city: 'New York',
        },
      },
    };

    const html = json2html(json);
    const doc = new DOMParser().parseFromString(html, 'text/html');

    // Check that a nested address block was created
    const blocks = doc.querySelectorAll('main > div > div');
    const addressBlock = Array.from(blocks).find((block) => block.className.includes('address') && block.className.includes('address-'));
    expect(addressBlock, 'Address block should exist').to.exist;

    // Check that the test-schema block has a reference to the nested block
    const mainContent = doc.body.innerHTML;
    expect(mainContent, 'Should contain self-reference').to.include('self://#address-');
  });

  it('should handle arrays of objects', () => {
    const json = {
      metadata: {
        schemaName: 'test-schema',
      },
      data: {
        items: [
          { name: 'Item 1', value: 100 },
          { name: 'Item 2', value: 200 },
        ],
      },
    };

    const html = json2html(json);
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const itemBlocks = doc.querySelectorAll('[class*="items-"]');
    expect(itemBlocks).to.have.lengthOf(2);

    const ul = doc.querySelector('ul');
    const listItems = ul.querySelectorAll('li');
    expect(listItems).to.have.lengthOf(2);
    expect(listItems[0].textContent).to.match(/self:\/\/#items-/);
    expect(listItems[1].textContent).to.match(/self:\/\/#items-/);
  });

  it('should include metadata in da-form block', () => {
    const json = {
      metadata: {
        schemaName: 'test-schema',
        version: '1.0',
        author: 'Test Author',
      },
      data: {
        field: 'value',
      },
    };

    const html = json2html(json);
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const daForm = doc.querySelector('.da-form');
    const rows = daForm.querySelectorAll(':scope > div');
    expect(rows.length).to.be.at.least(3);
  });
});

describe('Round-trip Conversion', () => {
  it('should handle JSON -> HTML -> JSON conversion', () => {
    const originalJson = {
      metadata: {
        schemaName: 'test-schema',
        version: 1.0,
      },
      data: {
        name: 'John Doe',
        age: 30,
        isActive: true,
        tags: ['tag1', 'tag2'],
      },
    };

    const html = json2html(originalJson);
    const converter = new HTMLConverter(html);
    const convertedJson = converter.json;

    expect(convertedJson.metadata.schemaName).to.equal(originalJson.metadata.schemaName);
    expect(convertedJson.data.name).to.equal(originalJson.data.name);
    expect(convertedJson.data.age).to.equal(originalJson.data.age);
    expect(convertedJson.data.isActive).to.equal(originalJson.data.isActive);
    expect(convertedJson.data.tags).to.deep.equal(originalJson.data.tags);
  });

  it('should handle JSON -> HTML -> JSON with nested objects', () => {
    const originalJson = {
      metadata: {
        schemaName: 'test-schema',
      },
      data: {
        user: {
          name: 'John Doe',
          email: 'john@example.com',
        },
      },
    };

    const html = json2html(originalJson);
    const converter = new HTMLConverter(html);
    const convertedJson = converter.json;

    expect(convertedJson.data.user).to.be.an('object');
    expect(convertedJson.data.user.name).to.equal(originalJson.data.user.name);
    expect(convertedJson.data.user.email).to.equal(originalJson.data.user.email);
  });

  it('should handle JSON -> HTML -> JSON with arrays of objects', () => {
    const originalJson = {
      metadata: {
        schemaName: 'test-schema',
      },
      data: {
        items: [
          { id: 1, name: 'Item 1' },
          { id: 2, name: 'Item 2' },
        ],
      },
    };

    const html = json2html(originalJson);
    const converter = new HTMLConverter(html);
    const convertedJson = converter.json;

    expect(convertedJson.data.items).to.be.an('array');
    expect(convertedJson.data.items).to.have.lengthOf(2);
    expect(convertedJson.data.items[0].id).to.equal(originalJson.data.items[0].id);
    expect(convertedJson.data.items[0].name).to.equal(originalJson.data.items[0].name);
    expect(convertedJson.data.items[1].id).to.equal(originalJson.data.items[1].id);
    expect(convertedJson.data.items[1].name).to.equal(originalJson.data.items[1].name);
  });

  it('should handle complex nested structures', () => {
    const originalJson = {
      metadata: {
        schemaName: 'complex-schema',
        version: 2.0,
      },
      data: {
        title: 'Complex Form',
        settings: {
          enabled: true,
          timeout: 5000,
        },
        users: [
          { name: 'User 1', role: 'admin' },
          { name: 'User 2', role: 'user' },
        ],
        tags: ['important', 'featured'],
      },
    };

    const html = json2html(originalJson);
    const converter = new HTMLConverter(html);
    const convertedJson = converter.json;

    expect(convertedJson.metadata.schemaName).to.equal(originalJson.metadata.schemaName);
    expect(convertedJson.data.title).to.equal(originalJson.data.title);
    expect(convertedJson.data.settings.enabled).to.equal(originalJson.data.settings.enabled);
    expect(convertedJson.data.settings.timeout).to.equal(originalJson.data.settings.timeout);
    expect(convertedJson.data.users).to.have.lengthOf(2);
    expect(convertedJson.data.tags).to.deep.equal(originalJson.data.tags);
  });
});

describe('Edge Cases', () => {
  it('should handle empty data object', () => {
    const json = {
      metadata: {
        schemaName: 'test-schema',
      },
      data: {},
    };

    const html = json2html(json);
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const dataBlock = doc.querySelector('.test-schema');
    expect(dataBlock).to.exist;
  });

  it('should handle special characters in values', () => {
    const json = {
      metadata: {
        schemaName: 'test-schema',
      },
      data: {
        message: 'Hello & "World" <Test>',
      },
    };

    const html = json2html(json);
    const converter = new HTMLConverter(html);
    const convertedJson = converter.json;

    expect(convertedJson.data.message).to.equal(json.data.message);
  });

  it('should handle empty strings', () => {
    const json = {
      metadata: { schemaName: 'test-schema' },
      data: {
        emptyString: '',
        normalString: 'not empty',
      },
    };

    const html = json2html(json);
    const converter = new HTMLConverter(html);
    const convertedJson = converter.json;

    // Empty string should be preserved
    expect(convertedJson.data.emptyString).to.equal('');
    expect(convertedJson.data.normalString).to.equal('not empty');
  });
});
