import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import { addDnt, removeDnt } from '../../../nx/blocks/loc/google/dnt.js';

const config = JSON.parse((await readFile({ path: './mocks/translate.json' })));

function collapseWhitespace(str, addEndingNewline = false) {
  const newStr = str.replace(/^\s*$\n/gm, '');
  return addEndingNewline ? `${newStr}\n` : newStr;
}

describe('Google DNT', () => {
  it('Converts html to dnt formatted html', async () => {
    const expectedHtmlWithDnt = await readFile({ path: './mocks/post-dnt.html' });
    const mockHtml = await readFile({ path: './mocks/pre-dnt.html' });
    const htmlWithDnt = await addDnt(mockHtml, config);
    expect(collapseWhitespace(htmlWithDnt, true)).to.equal(collapseWhitespace(expectedHtmlWithDnt));

    const htmlWithoutDnt = `${await removeDnt(htmlWithDnt, 'adobecom', 'da-bacom')}\n`;
    const expectedHtmlWithoutDnt = await readFile({ path: './mocks/dnt-removed.html' });
    expect(htmlWithoutDnt).to.equal(expectedHtmlWithoutDnt);
  });
});
