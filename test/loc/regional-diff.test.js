import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import { regionalDiff, normalizeHTML, normalizeLinks } from '../../nx/blocks/loc/regional-diff/regional-diff.js';

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

describe('normalizeLinks', () => {
  function createDocWithLinks(hrefs) {
    const doc = document.implementation.createHTMLDocument();
    const main = doc.createElement('main');
    hrefs.forEach((href) => {
      const a = doc.createElement('a');
      a.href = href;
      a.textContent = href;
      main.appendChild(a);
    });
    doc.body.appendChild(main);
    return doc;
  }

  it('converts .hlx.page, .hlx.live, .aem.page to .aem.live', async () => {
    const hrefs = [
      'https://main--site--adobecom.hlx.page/foo',
      'https://main--site--adobecom.hlx.live/bar',
      'https://main--site--adobecom.aem.page/baz',
      'https://main--site--adobecom.aem.live/qux',
    ];
    const doc = createDocWithLinks(hrefs);
    const site = 'site';
    const equivalentSites = new Set();
    await normalizeLinks(doc, site, equivalentSites);
    const links = [...doc.querySelectorAll('a')];
    links.forEach((link) => {
      expect(link.href).to.match(/\.aem\.live\//);
      expect(link.href).to.not.match(/\.hlx\.page|\.hlx\.live|\.aem\.page/);
    });
  });

  it('replaces site in URL when equivalentSites contains the link site', async () => {
    const href = 'https://main--foo--adobecom.aem.page/bar';
    const doc = createDocWithLinks([href]);
    const site = 'site';
    const equivalentSites = new Set(['foo']);
    await normalizeLinks(doc, site, equivalentSites);
    const link = doc.querySelector('a');
    expect(link.href).to.include('--site--');
    expect(link.href).to.not.include('--foo--');
    expect(link.href).to.match(/\.aem\.live\//);
  });

  it('does not change links if no matching patterns', async () => {
    const href = 'https://example.com/page';
    const doc = createDocWithLinks([href]);
    const site = 'site';
    const equivalentSites = new Set(['foo']);
    await normalizeLinks(doc, site, equivalentSites);
    const link = doc.querySelector('a');
    expect(link.href).to.equal(href);
  });

  it('handles multiple links with mixed patterns', async () => {
    const hrefs = [
      'https://main--foo--adobecom.hlx.page/foo',
      'https://main--bar--adobecom.aem.page/bar',
      'https://main--baz--adobecom.aem.live/baz',
      'https://example.com/page',
    ];
    const doc = createDocWithLinks(hrefs);
    const site = 'bar';
    const equivalentSites = new Set(['foo', 'bar']);
    await normalizeLinks(doc, site, equivalentSites);
    const links = [...doc.querySelectorAll('a')];
    expect(links[0].href).to.include('--bar--'); // foo replaced by bar
    expect(links[0].href).to.match(/\.aem\.live\//);
    expect(links[1].href).to.not.include('--foo--');
    expect(links[1].href).to.include('--bar--');
    expect(links[1].href).to.match(/\.aem\.live\//);
    expect(links[2].href).to.match(/\.aem\.live\//);
    expect(links[3].href).to.equal('https://example.com/page');
  });
});
