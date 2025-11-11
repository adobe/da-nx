import sinon from 'sinon';
import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import { regionalDiff, normalizeLinks } from '../../nx/blocks/loc/regional-diff/regional-diff.js';

function cleanHtmlWhitespace(html) {
  return html.replace(/>\s+</g, '><').trim().replace(/\s+/g, ' ').trim();
}

const mockRes = ({ payload, status = 404, ok = false } = {}) => new Promise((resolve) => {
  resolve({
    status,
    ok,
    json: () => payload,
    text: () => payload,
  });
});

const originalFetch = window.fetch;
describe('Regional diff', () => {
  beforeEach(() => {
    window.fetch = sinon.stub().callsFake(() => mockRes(''));
  });

  afterEach(() => {
    // Do not build up any test state - reset window.fetch to it's original state
    window.fetch = originalFetch;
  });

  it('Returns html with differences annotated', async () => {
    const original = document.implementation.createHTMLDocument();
    original.body.innerHTML = await readFile({ path: './mocks/lang-content.html' });
    const modified = document.implementation.createHTMLDocument();
    modified.body.innerHTML = await readFile({ path: './mocks/regional-content.html' });
    const mainEl = await regionalDiff(original, modified);
    const expectedDiffedMain = await readFile({ path: './mocks/diffedMain.html' });
    expect(cleanHtmlWhitespace(mainEl.outerHTML))
      .to.equal(cleanHtmlWhitespace(expectedDiffedMain));
  });

  it('Returns html with differences annotated when hash metadata is present', async () => {
    const original = document.implementation.createHTMLDocument();
    original.body.innerHTML = await readFile({ path: './mocks/lang-content.html' });
    const modified = document.implementation.createHTMLDocument();
    modified.body.innerHTML = await readFile({ path: './mocks/regional-content-metadata.html' });
    const acceptedHashes = ['9cf95b80d46d'];
    const rejectedHashes = ['66962da704a6', '89071ca4be97'];
    const mainEl = await regionalDiff(original, modified, acceptedHashes, rejectedHashes);
    const expectedDiffedMain = await readFile({ path: './mocks/diffedMain-metadata.html' });
    expect(cleanHtmlWhitespace(mainEl.outerHTML))
      .to.equal(cleanHtmlWhitespace(expectedDiffedMain));
  });

  it('Returns html with differences annotated when only rejected hashes are present', async () => {
    const original = document.implementation.createHTMLDocument();
    original.body.innerHTML = await readFile({ path: './mocks/lang-content.html' });
    const modified = document.implementation.createHTMLDocument();
    modified.body.innerHTML = await readFile({ path: './mocks/regional-content-metadata.html' });
    // Replace metadata with only rejected hashes
    const metadata = modified.querySelector('.da-metadata');
    metadata.innerHTML = `
      <div>
        <div>rejectedHashes</div>
        <div>9cf95b80d46d</div>
      </div>
    `;
    const mainEl = await regionalDiff(original, modified, [], ['9cf95b80d46d']);
    // The block with hash 9cf95b80d46d should be removed from the output
    expect(mainEl.innerHTML).to.not.include('9cf95b80d46d');
  });

  it('Returns html with differences annotated when metadata is malformed', async () => {
    const original = document.implementation.createHTMLDocument();
    original.body.innerHTML = await readFile({ path: './mocks/lang-content.html' });
    const modified = document.implementation.createHTMLDocument();
    // modified.body.innerHTML = await readFile({ path: './mocks/regional-content-metadata.html' });
    modified.body.innerHTML = await readFile({ path: './mocks/regional-content.html' });
    // Add malformed metadata
    const body = modified.querySelector('body');
    const metadata = document.createElement('div');
    metadata.className = 'da-metadata';
    body.appendChild(metadata);
    metadata.innerHTML = `
      <div>
        <div>acceptedHashes</div>
        <div></div>
      </div>
      <div>
        <div>rejectedHashes</div>
        <div>invalid,hash,format</div>
      </div>
    `;
    const mainEl = await regionalDiff(original, modified);
    // Should behave same as no metadata case since hashes are invalid
    const expectedDiffedMain = await readFile({ path: './mocks/diffedMain.html' });
    expect(cleanHtmlWhitespace(mainEl.outerHTML))
      .to.equal(cleanHtmlWhitespace(expectedDiffedMain));
  });

  it('Correctly handles list modifications with additions and deletions', async () => {
    const original = document.implementation.createHTMLDocument();
    original.body.innerHTML = await readFile({ path: './mocks/list-content-original.html' });
    const modified = document.implementation.createHTMLDocument();
    modified.body.innerHTML = await readFile({ path: './mocks/list-content-modified.html' });
    const mainEl = await regionalDiff(original, modified);
    const expectedDiffedMain = await readFile({ path: './mocks/list-content-diffed.html' });
    expect(cleanHtmlWhitespace(mainEl.outerHTML))
      .to.equal(cleanHtmlWhitespace(expectedDiffedMain));
  });

  it('Returns html with us/en vs au/en differences annotated', async () => {
    const original = document.implementation.createHTMLDocument();
    original.body.innerHTML = await readFile({ path: './mocks/financial-services-us-en.html' });
    const modified = document.implementation.createHTMLDocument();
    modified.body.innerHTML = await readFile({ path: './mocks/financial-services-au-en.html' });
    const mainEl = await regionalDiff(original, modified);
    const expectedDiffedMain = await readFile({ path: './mocks/financial-services-merged.html' });
    expect(cleanHtmlWhitespace(mainEl.outerHTML))
      .to.equal(cleanHtmlWhitespace(expectedDiffedMain));
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
