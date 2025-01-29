import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import { regionalDiff, normalizeHTML } from '../../nx/blocks/loc/regional-diff/regional-diff.js';

function cleanHtmlWhitespace(html) {
  return normalizeHTML(html).replace(/\s+/g, ' ').trim();
}

describe('Regional diff', () => {
  it('Returns html with differences annotated', async () => {
    const original = document.implementation.createHTMLDocument();
    original.body.innerHTML = await readFile({ path: './mocks/lang-content.html' });
    const modified = document.implementation.createHTMLDocument();
    modified.body.innerHTML = await readFile({ path: './mocks/regional-content.html' });
    const mainEl = await regionalDiff(original, modified);
    const expectedDiffedMain = await readFile({ path: './mocks/diffedMain.html' });
    expect(cleanHtmlWhitespace(mainEl.outerHTML)).to.equal(cleanHtmlWhitespace(expectedDiffedMain));
  });
});
