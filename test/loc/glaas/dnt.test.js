import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import { convertToHtml } from '../../../nx/blocks/loc/glaas/dnt.js';

describe('Glaas DNT', () => {
  it('Converts html to dnt formatted html', async () => {
    const html = await readFile('./mocks/dnt-config.json');
    const expectedDntHtml = await readFile('./mocks/post-dnt.html');
    const dntHtml = await convertToHtml(html);
    expect(dntHtml).to.equal(expectedDntHtml);
  });
});
