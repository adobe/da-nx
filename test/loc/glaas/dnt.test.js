import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import { removeDnt, addDnt } from '../../../nx/blocks/loc/glaas/dnt.js';

const config = JSON.parse((await readFile({ path: './mocks/translate.json' })));
const mockHtml = await readFile({ path: './mocks/pre-dnt.html' });

describe('Glaas DNT', () => {
  it('Converts html to dnt formatted html', () => {
    const htmlWithDnt = addDnt(config, mockHtml);
    expect(htmlWithDnt).to.exist;

    const htmlWithoutDnt = removeDnt(htmlWithDnt);
    console.log(htmlWithoutDnt);
    expect(htmlWithoutDnt).to.exist;
  });
});
