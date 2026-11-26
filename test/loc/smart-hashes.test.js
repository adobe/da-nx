import { expect } from '@esm-bundle/chai';
import { getBlockHashes } from '../../nx/public/loc/regional-diff.js';

const CONFIG = { config: { data: [{ key: 'source.fragment.hostnames', value: 'main--other--org.aem.live' }] } };

const toDoc = (href) => {
  const doc = document.implementation.createHTMLDocument();
  doc.body.innerHTML = `<main><div><p><a href="${href}">Link</a></p></div></main>`;
  return doc;
};

describe('getBlockHashes', () => {
  it('normalizes equivalent site links from the given config', async () => {
    const equivalent = await getBlockHashes({ doc: toDoc('https://main--other--org.aem.page/a'), site: 'site', config: CONFIG });
    const same = await getBlockHashes({ doc: toDoc('https://main--site--org.aem.live/a'), site: 'site', config: CONFIG });
    expect(equivalent).to.deep.equal(same);
  });

  it('does not change the document it hashes', async () => {
    const doc = toDoc('https://main--other--org.aem.page/a');
    await getBlockHashes({ doc, site: 'site', config: CONFIG });
    expect(doc.querySelector('a').href).to.equal('https://main--other--org.aem.page/a');
  });

  it('keeps heading IDs in sync point hashes', async () => {
    const upstream = document.implementation.createHTMLDocument();
    upstream.body.innerHTML = '<main><div><h1 id="welcome">Welcome</h1></div></main>';
    const saved = document.implementation.createHTMLDocument();
    saved.body.innerHTML = '<main><div><h1>Welcome</h1></div></main>';

    expect(await getBlockHashes({ doc: upstream })).not.to.deep.equal(
      await getBlockHashes({ doc: saved }),
    );
  });
});
