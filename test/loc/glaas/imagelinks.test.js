import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import { removeDnt, addDnt } from '../../../nx/blocks/loc/glaas/dnt.js';

function collapseWhitespace(str, addEndingNewline = false) {
  const newStr = str.replace(/^\s*$\n/gm, '');
  return addEndingNewline ? `${newStr}\n` : newStr;
}

describe('Glaas DNT', () => {
  it('Converts html to dnt formatted html', async () => {
    const config = JSON.parse((await readFile({ path: './mocks/translate.json' })));
    const expectedHtmlWithDnt = await readFile({ path: './mocks/post-dnt.html' });
    const mockHtml = await readFile({ path: './mocks/image-with-link.html' });
    const htmlWithDnt = await addDnt(mockHtml, config, { reset: true });
    expect(collapseWhitespace(htmlWithDnt, true)).to.equal(collapseWhitespace(mockHtml.replaceAll('&#x26;', '&amp;')));

    // const htmlWithoutDnt = `${await removeDnt(htmlWithDnt, 'adobecom', 'da-bacom')}\n`;
    // const expectedHtmlWithoutDnt = await readFile({ path: './mocks/dnt-removed.html' });
    // expect(collapseWhitespace(htmlWithoutDnt)).to.equal(collapseWhitespace(expectedHtmlWithoutDnt));
  });
});
