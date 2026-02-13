import { expect } from '@esm-bundle/chai';
import { json2html, html2json } from '../../nx/blocks/loc/dnt/json2html.js';
import { singleSheetJson, multiSheetJson } from './glaas/mocks/testData.js';

describe('json2html2json', () => {
  it('should convert single sheet JSON to HTML', async () => {
    const plainHtml = json2html(singleSheetJson);
    const html = new DOMParser().parseFromString(plainHtml, 'text/html');

    const body = html.querySelector('body');
    const sheets = body.querySelectorAll('div[data-type="sheet"]');
    expect(sheets).to.have.lengthOf(1);

    const convertedJson = JSON.parse(html2json(html.documentElement.outerHTML));
    expect(convertedJson).to.deep.equal(singleSheetJson);
  });

  it('should convert multi-sheet JSON to HTML', async () => {
    const plainHtml = json2html(multiSheetJson);
    const html = new DOMParser().parseFromString(plainHtml, 'text/html');

    // eslint-disable-next-line no-use-before-define
    expect(html.body.outerHTML).to.equal(expectedMultiHtml);

    const convertedJson = JSON.parse(html2json(html.documentElement.outerHTML));
    expect(convertedJson).to.deep.equal(multiSheetJson);
  });
});

describe('json2html with dntConfig', () => {
  it('should apply universal column DNT from config', () => {
    const json = {
      ':type': 'sheet',
      total: 2,
      offset: 0,
      limit: 2,
      data: [
        { key: 'config-key', value: 'translatable-value' },
        { key: 'another-key', value: 'another-value' },
      ],
    };

    const dntConfig = {
      dntUniversalColumns: ['key'],
      dntSheets: [],
      dntSheetToColumns: new Map(),
    };

    const plainHtml = json2html(json, dntConfig);
    const html = new DOMParser().parseFromString(plainHtml, 'text/html');

    // Key columns should have translate="no"
    const keyColumns = html.querySelectorAll('div[key="key"]');
    expect(keyColumns.length).to.be.greaterThan(0);
    expect(keyColumns[0].getAttribute('translate')).to.equal('no');

    // Value columns should NOT have translate="no"
    const valueColumns = html.querySelectorAll('div[key="value"]');
    expect(valueColumns.length).to.be.greaterThan(0);
    expect(valueColumns[0].getAttribute('translate')).to.be.null;
  });

  it('should apply sheet-specific column DNT from config', () => {
    const json = {
      ':type': 'multi-sheet',
      ':names': ['products', 'settings'],
      ':version': 1,
      products: {
        total: 1,
        offset: 0,
        limit: 1,
        data: [{ sku: 'ABC123', name: 'Product Name' }],
      },
      settings: {
        total: 1,
        offset: 0,
        limit: 1,
        data: [{ sku: 'SKU-999', name: 'Setting Name' }],
      },
    };

    const dntConfig = {
      dntUniversalColumns: [],
      dntSheets: [],
      dntSheetToColumns: new Map([['products', ['sku']]]),
    };

    const plainHtml = json2html(json, dntConfig);
    const html = new DOMParser().parseFromString(plainHtml, 'text/html');

    // SKU in products sheet should have translate="no"
    const productsSheet = html.querySelector('div[name="products"]');
    const productsSku = productsSheet.querySelector('div[key="sku"]');
    expect(productsSku.getAttribute('translate')).to.equal('no');

    // SKU in settings sheet should NOT have translate="no"
    const settingsSheet = html.querySelector('div[name="settings"]');
    const settingsSku = settingsSheet.querySelector('div[key="sku"]');
    expect(settingsSku.getAttribute('translate')).to.be.null;
  });

  it('should apply entire sheet DNT from config', () => {
    const json = {
      ':type': 'multi-sheet',
      ':names': ['content', 'config'],
      ':version': 1,
      content: {
        total: 1,
        offset: 0,
        limit: 1,
        data: [{ text: 'Hello World' }],
      },
      config: {
        total: 1,
        offset: 0,
        limit: 1,
        data: [{ setting: 'value' }],
      },
    };

    const dntConfig = {
      dntUniversalColumns: [],
      dntSheets: ['config'],
      dntSheetToColumns: new Map(),
    };

    const plainHtml = json2html(json, dntConfig);
    const html = new DOMParser().parseFromString(plainHtml, 'text/html');

    // Config sheet should have translate="no"
    const configSheet = html.querySelector('div[name="config"]');
    expect(configSheet.getAttribute('translate')).to.equal('no');

    // Content sheet should NOT have translate="no"
    const contentSheet = html.querySelector('div[name="content"]');
    expect(contentSheet.getAttribute('translate')).to.be.null;
  });

  it('should merge config DNT with content DNT sheet', () => {
    const json = {
      ':type': 'multi-sheet',
      ':names': ['data', 'dnt'],
      ':version': 1,
      data: {
        total: 1,
        offset: 0,
        limit: 1,
        data: [{ id: '123', title: 'My Title', slug: 'my-slug' }],
      },
      dnt: {
        total: 1,
        offset: 0,
        limit: 1,
        data: [{ 'dnt-sheet': '*', 'dnt-columns': 'slug' }],
      },
    };

    // Config adds 'id' as universal DNT column
    const dntConfig = {
      dntUniversalColumns: ['id'],
      dntSheets: [],
      dntSheetToColumns: new Map(),
    };

    const plainHtml = json2html(json, dntConfig);
    const html = new DOMParser().parseFromString(plainHtml, 'text/html');

    const dataSheet = html.querySelector('div[name="data"]');

    // Both id (from config) and slug (from content dnt sheet) should be DNT
    const idCol = dataSheet.querySelector('div[key="id"]');
    const slugCol = dataSheet.querySelector('div[key="slug"]');
    const titleCol = dataSheet.querySelector('div[key="title"]');

    expect(idCol.getAttribute('translate')).to.equal('no');
    expect(slugCol.getAttribute('translate')).to.equal('no');
    expect(titleCol.getAttribute('translate')).to.be.null;
  });
});

const expectedMultiHtml = '<body top-attrs="{&quot;:version&quot;:3}"><div sheet-attrs="{&quot;total&quot;:2,&quot;limit&quot;:2,&quot;offset&quot;:0,&quot;:colWidths&quot;:[50,98,227,174]}" name="data" data-type="sheet"><div data-type="row"><div key="key" data-type="col">hello</div><div key="val" data-type="col">world</div><div key="no-translate" data-type="col">still in english</div><div key="translate" data-type="col">back to</div></div><div data-type="row"><div key="key" data-type="col">use</div><div key="val" data-type="col">firefly</div><div key="no-translate" data-type="col">inside this column</div><div key="translate" data-type="col">translating here</div></div></div><div sheet-attrs="{&quot;total&quot;:1,&quot;limit&quot;:1,&quot;offset&quot;:0,&quot;:colWidths&quot;:[114,125]}" name="dnt" data-type="sheet" translate="no"><div data-type="row"><div key="dnt-sheet" data-type="col">no-dnt-for-me</div><div key="dnt-columns" data-type="col">no-translate</div></div></div><div sheet-attrs="{&quot;total&quot;:3,&quot;limit&quot;:3,&quot;offset&quot;:0,&quot;:colWidths&quot;:[136,134]}" name="no-dnt-for-me" data-type="sheet"><div data-type="row"><div key="mykey" data-type="col">this</div><div key="myval" data-type="col">sheet</div></div><div data-type="row"><div key="mykey" data-type="col">will</div><div key="myval" data-type="col">not</div></div><div data-type="row"><div key="mykey" data-type="col">be</div><div key="myval" data-type="col">translated</div></div></div></body>';
