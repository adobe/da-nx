import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import { removeDnt, addDnt } from '../../../nx/blocks/loc/connectors/glaas/dnt.js';

function collapseWhitespace(str, addEndingNewline = false) {
  const newStr = str.replace(/^\s*$\n/gm, '');
  return addEndingNewline ? `${newStr}\n` : newStr;
}

describe('Glaas DNT', () => {
  it('Converts html to dnt formatted html', async () => {
    const config = JSON.parse((await readFile({ path: './mocks/translate.json' })));
    const expectedHtmlWithDnt = await readFile({ path: './mocks/post-dnt.html' });
    const mockHtml = await readFile({ path: './mocks/pre-dnt.html' });
    const htmlWithDnt = await addDnt(mockHtml, config, { reset: true });
    expect(`${htmlWithDnt}\n`).to.equal(expectedHtmlWithDnt);

    const htmlWithoutDnt = await removeDnt(htmlWithDnt, 'adobecom', 'da-bacom');
    const expectedHtmlWithoutDnt = await readFile({ path: './mocks/dnt-removed.html' });
    expect(`${htmlWithoutDnt}\n`).to.equal(expectedHtmlWithoutDnt);
  });

  it('Converts html to dnt formatted html 2', async () => {
    const config = JSON.parse((await readFile({ path: './mocks/hubspot/translate.json' })));
    const expectedHtmlWithDnt = await readFile({ path: './mocks/hubspot/post-dnt.html' });
    const mockHtml = await readFile({ path: './mocks/hubspot/hubspot.html' });
    const htmlWithDnt = await addDnt(mockHtml, config, { reset: true });
    expect(`${htmlWithDnt}\n`).to.equal(expectedHtmlWithDnt);
  });

  it.only('Converts html to dnt formatted html with icons', async () => {
    const config = JSON.parse((await readFile({ path: './mocks/hubspot/translate.json' })));
    const html = `<body>
  <header></header>
  <main>
    <div>
      <p>Some text with an :happy: icon</p>
    </div>
    <div>
      <img src="https://main--da-bacom--adobecom.aem.live/media_14a4b58fd73d82e553ccb65d5f53c3f5ff552330d.jpeg?optimize=medium" alt="https://a.com | Text here | :play:" loading="lazy" />
    </div>
  </main>
</body>`;
    const htmlWithDnt = await addDnt(html, config, { reset: true });
    expect(htmlWithDnt).to.equal(
      '<html><head></head><body><main><div><p>Some text with an<span class="icon icon-happy"></span>icon</p></div><div><img src="./media_14a4b58fd73d82e553ccb65d5f53c3f5ff552330d.jpeg?optimize=medium" alt="Text here" loading="lazy" dnt-alt-content="https://a.com | *alt-placeholder* | :play:"></div></main></body></html>',
    );

    const htmlWithoutDnt = await removeDnt(htmlWithDnt, 'adobecom', 'da-bacom');
    expect(htmlWithoutDnt).to.equal(
      '<html><head></head><body><main><div><p>Some text with an:happy:icon</p></div><div><img src="https://main--da-bacom--adobecom.aem.live/media_14a4b58fd73d82e553ccb65d5f53c3f5ff552330d.jpeg?optimize=medium" alt="https://a.com | Text here | :play:" loading="lazy"></div></main></body></html>',
    );
  });

  it('Converts json to dnt formatted html and back', async () => {
    const config = JSON.parse((await readFile({ path: './mocks/translate.json' })));
    const expectedHtmlWithDnt = await readFile({ path: './mocks/placeholders.html' });
    const json = await readFile({ path: './mocks/placeholders.json' });
    const htmlWithDnt = await addDnt(json, config, { fileType: 'json', reset: true });
    expect(collapseWhitespace(htmlWithDnt, true)).to.equal(collapseWhitespace(expectedHtmlWithDnt));

    const jsonWithoutDnt = `${await removeDnt(htmlWithDnt, 'adobecom', 'da-bacom', { fileType: 'json' })}\n`;
    expect(JSON.parse(jsonWithoutDnt)).to.deep.equal(JSON.parse(json));
  });
});
