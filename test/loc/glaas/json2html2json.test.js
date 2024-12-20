import { expect } from '@esm-bundle/chai';
import { json2html, html2json } from '../../../nx/blocks/loc/glaas/json2html.js';
import { singleSheetJson, multiSheetJson } from './mocks/testData.js';

describe('json2html2json', () => {
  it('should convert single sheet JSON to HTML', async () => {
    const html = json2html(singleSheetJson);
    const body = html.querySelector('body');
    const sheets = body.querySelectorAll('div[data-type="sheet"]');
    expect(sheets).to.have.lengthOf(1);

    const convertedJson = JSON.parse(html2json(html.outerHTML));
    expect(convertedJson).to.deep.equal(singleSheetJson);
  });

  it('should convert multi-sheet JSON to HTML', async () => {
    const html = json2html(multiSheetJson);

    // eslint-disable-next-line no-use-before-define
    expect(html.outerHTML).to.equal(expectedMultiHtml);

    const convertedJson = JSON.parse(html2json(html.outerHTML));
    expect(convertedJson).to.deep.equal(multiSheetJson);
  });
});

const expectedMultiHtml = '<html><body top-attrs="{&quot;:version&quot;:3}"><div sheet-attrs="{&quot;total&quot;:2,&quot;limit&quot;:2,&quot;offset&quot;:0,&quot;:colWidths&quot;:[50,98,227,174]}" name="data" data-type="sheet"><div data-type="row" translate="no"><div key="key" data-type="col">hello</div><div key="val" data-type="col">world</div><div key="no-translate" data-type="col">still in english</div><div key="translate" data-type="col">back to</div></div><div data-type="row" translate="no"><div key="key" data-type="col">use</div><div key="val" data-type="col">firefly</div><div key="no-translate" data-type="col">inside this column</div><div key="translate" data-type="col">translating here</div></div></div><div sheet-attrs="{&quot;total&quot;:1,&quot;limit&quot;:1,&quot;offset&quot;:0,&quot;:colWidths&quot;:[114,125]}" name="dnt" data-type="sheet"><div data-type="row" translate="no"><div key="dnt-sheet" data-type="col">no-dnt-for-me</div><div key="dnt-columns" data-type="col">no-translate</div></div></div><div sheet-attrs="{&quot;total&quot;:3,&quot;limit&quot;:3,&quot;offset&quot;:0,&quot;:colWidths&quot;:[136,134]}" name="no-dnt-for-me" data-type="sheet"><div data-type="row" translate="no"><div key="mykey" data-type="col">this</div><div key="myval" data-type="col">sheet</div></div><div data-type="row" translate="no"><div key="mykey" data-type="col">will</div><div key="myval" data-type="col">not</div></div><div data-type="row" translate="no"><div key="mykey" data-type="col">be</div><div key="myval" data-type="col">translated</div></div></div></body></html>';
