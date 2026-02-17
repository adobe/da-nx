import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import json2html from '../../../nx/blocks/form/utils/json2html.js';
import { normalizeHtml } from './utils.js';

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

    // Check that the .test-schema block exists
    const testSchemaBlock = doc.querySelector('.test-schema');
    expect(testSchemaBlock, 'The .test-schema block should exist').to.exist;

    // Empty arrays should not create any HTML row
    const rows = testSchemaBlock.querySelectorAll(':scope > div');
    expect(rows, 'Empty array should not create any rows').to.have.lengthOf(0);
  });

  it('should handle empty objects', () => {
    const json = {
      metadata: {
        schemaName: 'test-schema',
      },
      data: {
        emptyObject: {},
      },
    };

    const html = json2html(json);
    const doc = new DOMParser().parseFromString(html, 'text/html');

    // Check that the .test-schema block exists
    const testSchemaBlock = doc.querySelector('.test-schema');
    expect(testSchemaBlock, 'The .test-schema block should exist').to.exist;

    // Empty objects should not create any HTML row
    const rows = testSchemaBlock.querySelectorAll(':scope > div');
    expect(rows, 'Empty object should not create any rows').to.have.lengthOf(0);

    // No nested blocks should be created for empty objects
    const blocks = doc.querySelectorAll('main > div > div');
    const emptyObjectBlocks = Array.from(blocks).filter((block) => block.className.includes('emptyObject'));
    expect(emptyObjectBlocks, 'No nested blocks should exist for empty object').to.have.lengthOf(0);
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

    // Check that the .test-schema block exists
    const testSchemaBlock = doc.querySelector('.test-schema');
    expect(testSchemaBlock, 'The .test-schema block should exist').to.exist;

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

    // Check that the .test-schema block exists
    const testSchemaBlock = doc.querySelector('.test-schema');
    expect(testSchemaBlock, 'The .test-schema block should exist').to.exist;

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

  it('should handle arrays of arrays (primitives)', () => {
    const json = {
      metadata: {
        schemaName: 'test-schema',
      },
      data: {
        items: [
          ['Item 1A', 'Item 1B', 'Item 1C'],
          ['Item 2A', 'Item 2B'],
        ],
      },
    };

    const html = json2html(json);
    const doc = new DOMParser().parseFromString(html, 'text/html');

    // Check main schema block
    const testSchemaBlock = doc.querySelector('.test-schema');
    expect(testSchemaBlock, 'The .test-schema block should exist').to.exist;

    // Check that there are references to nested array blocks
    const mainUl = testSchemaBlock.querySelector('ul');
    expect(mainUl, 'Main ul should exist').to.exist;
    const mainListItems = mainUl.querySelectorAll('li');
    expect(mainListItems).to.have.lengthOf(2);
    expect(mainListItems[0].textContent).to.match(/self:\/\/#items-/);

    // Check that nested array blocks were created with @items key
    const arrayBlocks = doc.querySelectorAll('[class*="items-"]');
    expect(arrayBlocks.length).to.be.at.least(2);

    // Verify @items key exists in array block
    const firstArrayBlock = arrayBlocks[0];
    const itemsKey = Array.from(firstArrayBlock.querySelectorAll('p')).find((p) => p.textContent === '@items');
    expect(itemsKey, '@items key should exist in array block').to.exist;

    // Verify the nested array contains the primitive values
    const nestedUl = firstArrayBlock.querySelector('ul');
    expect(nestedUl, 'Nested ul should exist').to.exist;
    const nestedItems = nestedUl.querySelectorAll('li');
    expect(nestedItems.length).to.be.at.least(1);
  });

  it('should handle arrays of arrays (objects)', () => {
    const json = {
      metadata: {
        schemaName: 'test-schema',
      },
      data: {
        groups: [
          [
            { name: 'Item 1', value: 'A' },
            { name: 'Item 2', value: 'B' },
          ],
          [
            { name: 'Item 3', value: 'C' },
          ],
        ],
      },
    };

    const html = json2html(json);
    const doc = new DOMParser().parseFromString(html, 'text/html');

    // Check main schema block
    const testSchemaBlock = doc.querySelector('.test-schema');
    expect(testSchemaBlock, 'The .test-schema block should exist').to.exist;

    // Check that nested array blocks were created
    const arrayBlocks = doc.querySelectorAll('[class*="groups-"]');
    expect(arrayBlocks.length).to.be.at.least(2);

    // Verify @items key exists in array blocks
    const itemsKeys = Array.from(doc.querySelectorAll('p')).filter((p) => p.textContent === '@items');
    expect(itemsKeys.length).to.be.at.least(2, '@items keys should exist for each array block');

    // Verify object blocks were created for the items
    const itemBlocks = Array.from(arrayBlocks).filter((block) => {
      const rows = block.querySelectorAll(':scope > div');
      // Object blocks have multiple rows with actual keys like 'name', 'value'
      // Array blocks have just one row with '@items'
      return rows.length > 1 || (rows.length === 1 && !block.innerHTML.includes('@items'));
    });
    expect(itemBlocks.length).to.be.at.least(1, 'Item object blocks should exist');
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

    const doc = new DOMParser().parseFromString(html, 'text/html');

    // Check that the .test-schema block exists
    const testSchemaBlock = doc.querySelector('.test-schema');
    expect(testSchemaBlock, 'The .test-schema block should exist').to.exist;

    expect(testSchemaBlock.textContent).to.include(json.data.message);
    expect(testSchemaBlock.innerHTML).to.include('Hello &amp; "World" &lt;Test&gt;');
  });

  // it('should handle empty strings', () => {
  //   const json = {
  //     metadata: { schemaName: 'test-schema' },
  //     data: {
  //       emptyString: '',
  //       normalString: 'not empty',
  //     },
  //   };

  //   const html = json2html(json);
  //   const converter = new HTMLConverter(html);
  //   const convertedJson = converter.json;

  //   // Empty string should be preserved
  //   expect(convertedJson.data.emptyString).to.equal('');
  //   expect(convertedJson.data.normalString).to.equal('not empty');
  // });
});

describe('Real-world Examples', () => {
  it('should convert simpleForm.json to HTML', async () => {
    const jsonContent = await readFile({ path: './mocks/simpleForm.json' });
    const json = JSON.parse(jsonContent);

    const generatedHtml = json2html(json);
    const expectedHtml = await readFile({ path: './mocks/simpleForm.html' });

    expect(normalizeHtml(generatedHtml)).to.equal(normalizeHtml(expectedHtml));
  });

  it('should convert nestedForm.json to HTML', async () => {
    const jsonContent = await readFile({ path: './mocks/nestedForm.json' });
    const json = JSON.parse(jsonContent);

    const generatedHtml = json2html(json);
    const expectedHtml = await readFile({ path: './mocks/nestedForm.html' });

    expect(normalizeHtml(generatedHtml)).to.equal(normalizeHtml(expectedHtml));
  });

  it('should convert nestedArrays.json to HTML', async () => {
    const jsonContent = await readFile({ path: './mocks/nestedArrays.json' });
    const json = JSON.parse(jsonContent);

    const generatedHtml = json2html(json);
    const expectedHtml = await readFile({ path: './mocks/nestedArrays.html' });

    expect(normalizeHtml(generatedHtml)).to.equal(normalizeHtml(expectedHtml));
  });
});
