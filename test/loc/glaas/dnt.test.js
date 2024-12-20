import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import { removeDnt, addDnt } from '../../../nx/blocks/loc/glaas/dnt.js';

const config = JSON.parse((await readFile({ path: './mocks/translate.json' })));

describe('Glaas DNT', () => {
  it('Converts html to dnt formatted html', async () => {
    const expectedHtmlWithDnt = await readFile({ path: './mocks/post-dnt.html' });
    const mockHtml = await readFile({ path: './mocks/pre-dnt.html' });
    const htmlWithDnt = addDnt(mockHtml, config);
    expect(htmlWithDnt).to.equal(expectedHtmlWithDnt);

    const htmlWithoutDnt = removeDnt(htmlWithDnt, 'adobecom', 'da-bacom');
    const expectedHtmlWithoutDnt = await readFile({ path: './mocks/dnt-removed.html' });
    expect(htmlWithoutDnt).to.equal(expectedHtmlWithoutDnt);
  });
});
