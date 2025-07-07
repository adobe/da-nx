import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import { normalizeHtml } from '../../../nx/utils/testUtils.js';
import { addDnt } from '../../../nx/blocks/loc/connectors/glaas/dnt.js';

describe('Glaas DNT', () => {
  it('Converts html to dnt formatted html', async () => {
    const config = JSON.parse((await readFile({ path: './mocks/translate.json' })));
    const mockHtml = await readFile({ path: './mocks/image-with-link.html' });
    const htmlWithDnt = await addDnt(mockHtml, config, { reset: true });
    expect(normalizeHtml(htmlWithDnt))
      .to.equal(normalizeHtml(mockHtml, { ignoreHeaderAndFooter: true }));
  });
});
