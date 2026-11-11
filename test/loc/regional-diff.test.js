import sinon from 'sinon';
import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import {
  regionalDiff,
  normalizeLinks,
  removeLocTags,
  getBlockHashes,
  smartMerge,
  removeRejectedBlocks,
} from '../../nx/public/loc/regional-diff.js';
import { getDiffHash } from '../../nx/public/loc/index.js';

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

  it('uses explicit destination configuration without legacy fetch or page context', async () => {
    window.fetch = sinon.stub().throws(new Error('Unexpected legacy fetch'));
    const original = document.implementation.createHTMLDocument();
    original.body.innerHTML = '<main><div><p><a href="https://main--source--org.aem.live/page">Link</a></p></div></main>';
    const modified = document.implementation.createHTMLDocument();
    modified.body.innerHTML = '<main><div><p><a href="https://main--target--org.aem.live/page">Link</a></p></div></main>';
    const main = await regionalDiff(original, modified, [], [], {
      site: 'target',
      config: {
        config: { data: [{ key: 'source.fragment.hostnames', value: 'main--source--org.aem.live' }] },
      },
    });
    expect(main.innerHTML).to.include('main--target--org.aem.live');
    expect(main.innerHTML).not.to.include('da-diff-added');
    expect(main.innerHTML).not.to.include('da-diff-deleted');
    expect(window.fetch.called).to.equal(false);
  });

  it('Returns html with differences annotated when both have diffs', async () => {
    const original = document.implementation.createHTMLDocument();
    original.body.innerHTML = await readFile({ path: './mocks/diff-compare.html' });
    const modified = document.implementation.createHTMLDocument();
    modified.body.innerHTML = await readFile({ path: './mocks/diff-compare-modified.html' });

    // Removal of diff tags happens in mergeCopy and rolloutCopy so we have to call it directly here
    removeLocTags(modified);
    removeLocTags(original);

    const mainEl = await regionalDiff(original, modified);
    const expectedDiffedMain = await readFile({ path: './mocks/diff-compare-diffed.html' });
    expect(cleanHtmlWhitespace(mainEl.outerHTML))
      .to.equal(cleanHtmlWhitespace(expectedDiffedMain));
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
    const ownHero = mainEl.querySelector('.hero-marquee[da-diff-added]');
    expect(ownHero?.textContent).to.include('Welcome to Canada.');
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

  it('Handle block group differences with sections', async () => {
    const original = document.implementation.createHTMLDocument();
    original.body.innerHTML = await readFile({ path: './mocks/block-group-us.html' });
    const modified = document.implementation.createHTMLDocument();
    modified.body.innerHTML = await readFile({ path: './mocks/block-group-au.html' });
    const mainEl = await regionalDiff(original, modified);
    const expectedDiffedMain = await readFile({ path: './mocks/block-group-merged.html' });
    expect(cleanHtmlWhitespace(mainEl.outerHTML))
      .to.equal(cleanHtmlWhitespace(expectedDiffedMain));
  });

  it('Handle block group only added in modified document', async () => {
    const original = document.implementation.createHTMLDocument();
    original.body.innerHTML = await readFile({ path: './mocks/block-group-added-only-us.html' });
    const modified = document.implementation.createHTMLDocument();
    modified.body.innerHTML = await readFile({ path: './mocks/block-group-added-only-au.html' });
    const mainEl = await regionalDiff(original, modified);
    const expectedDiffedMain = await readFile({ path: './mocks/block-group-added-only-merged.html' });
    expect(cleanHtmlWhitespace(mainEl.outerHTML))
      .to.equal(cleanHtmlWhitespace(expectedDiffedMain));
  });

  it('Handle block group only deleted from modified document', async () => {
    const original = document.implementation.createHTMLDocument();
    original.body.innerHTML = await readFile({ path: './mocks/block-group-deleted-only-us.html' });
    const modified = document.implementation.createHTMLDocument();
    modified.body.innerHTML = await readFile({ path: './mocks/block-group-deleted-only-au.html' });
    const mainEl = await regionalDiff(original, modified);
    const expectedDiffedMain = await readFile({ path: './mocks/block-group-deleted-only-merged.html' });
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

describe('regionalDiff normalizeImages hook', () => {
  beforeEach(() => {
    window.fetch = sinon.stub().callsFake(() => mockRes(''));
  });

  afterEach(() => {
    window.fetch = originalFetch;
  });

  it('is a no-op when no normalizeImages option is passed (other connectors unaffected)', async () => {
    const original = document.implementation.createHTMLDocument();
    original.body.innerHTML = '<main><div><img src="https://example.com/a.png"></div></main>';
    const modified = document.implementation.createHTMLDocument();
    modified.body.innerHTML = '<main><div><img src="https://example.com/b.png"></div></main>';
    const mainEl = await regionalDiff(original, modified);
    // no hook - both differing images show up in the diff
    expect(mainEl.innerHTML).to.include('a.png');
    expect(mainEl.innerHTML).to.include('b.png');
  });

  it('calls the supplied normalizeImages hook with the normalized documents before diffing', async () => {
    const original = document.implementation.createHTMLDocument();
    original.body.innerHTML = '<main><div><img src="https://example.com/a.png"></div></main>';
    const modified = document.implementation.createHTMLDocument();
    modified.body.innerHTML = '<main><div><img src="https://example.com/a.png"></div></main>';
    const normalizeImages = sinon.spy((normOriginal, normModified) => {
      expect(normOriginal.querySelector('img').src).to.equal('https://example.com/a.png');
      expect(normModified.querySelector('img').src).to.equal('https://example.com/a.png');
    });
    await regionalDiff(original, modified, undefined, undefined, { normalizeImages });
    expect(normalizeImages.calledOnce).to.be.true;
  });
});

describe('regionalDiff with hashes from an earlier review', () => {
  const toDoc = (mainHtml) => {
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = `<main><div>${mainHtml}</div></main>`;
    return doc;
  };
  const ownHeadings = (main) => [...main.querySelectorAll('h1')]
    .filter((h1) => !h1.closest('da-diff-deleted'))
    .map((h1) => h1.outerHTML);

  beforeEach(() => {
    window.fetch = sinon.stub().callsFake(() => mockRes(''));
  });

  afterEach(() => {
    window.fetch = originalFetch;
  });

  it('keeps an own block that equals a rejected incoming block apart from its id', async () => {
    const incoming = toDoc('<h1 id="welcome">Welcome</h1><p>Check the options online.</p>');
    const target = toDoc('<h1>Welcome</h1><p>Check the options.</p>');
    const main = await regionalDiff(incoming, target, [], [getDiffHash('<h1>Welcome</h1>')]);
    expect(ownHeadings(main)).to.deep.equal(['<h1 da-diff-added="">Welcome</h1>']);
    expect(main.querySelector('da-diff-deleted > h1#welcome')).to.exist;
  });

  it('keeps an own block whose hash is in the rejected hashes', async () => {
    const incoming = toDoc('<h1>Hello</h1>');
    const target = toDoc('<h1>Welcome</h1>');
    const main = await regionalDiff(incoming, target, [], [getDiffHash('<h1>Welcome</h1>')]);
    expect(ownHeadings(main)).to.deep.equal(['<h1 da-diff-added="">Welcome</h1>']);
    expect(main.querySelector('da-diff-deleted > h1').outerHTML).to.equal('<h1>Hello</h1>');
  });

  it('marks both blocks when there are no hashes from an earlier review', async () => {
    const incoming = toDoc('<h1 id="welcome">Welcome</h1><p>Check the options online.</p>');
    const target = toDoc('<h1>Welcome</h1><p>Check the options.</p>');
    const main = await regionalDiff(incoming, target, [], []);
    expect(ownHeadings(main)).to.deep.equal(['<h1 da-diff-added="">Welcome</h1>']);
    expect(main.querySelector('da-diff-deleted > h1#welcome')).to.exist;
  });

  it('keeps an own block whose hash is both accepted and rejected', async () => {
    const incoming = toDoc('<h1 id="welcome">Welcome</h1>');
    const target = toDoc('<h1>Welcome</h1>');
    const ownHash = getDiffHash('<h1>Welcome</h1>');
    const main = await regionalDiff(incoming, target, [ownHash], [ownHash]);
    expect(ownHeadings(main)).to.deep.equal(['<h1>Welcome</h1>']);
  });

  it('leaves out an incoming block whose hash is in the rejected hashes', async () => {
    const incoming = toDoc('<h1>Hello</h1>');
    const target = toDoc('<h1>Welcome</h1>');
    const main = await regionalDiff(incoming, target, [], [getDiffHash('<h1>Hello</h1>')]);
    expect(ownHeadings(main)).to.deep.equal(['<h1 da-diff-added="">Welcome</h1>']);
    expect(main.querySelector('da-diff-deleted')).to.be.null;
  });
});

describe('smartMerge', () => {
  const toDoc = (sections) => {
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = `<main>${[].concat(sections).map((s) => `<div>${s}</div>`).join('')}</main>`;
    return doc;
  };
  const hashes = (doc) => getBlockHashes({ doc, site: 'site', config: {} });
  const merge = async ({ base, source, dest }) => smartMerge({
    site: 'site',
    config: {},
    base: await hashes(toDoc(base)),
    source: toDoc(source),
    dest: toDoc(dest),
  });

  beforeEach(() => {
    window.fetch = sinon.stub().callsFake(() => mockRes(''));
  });

  afterEach(() => {
    window.fetch = originalFetch;
  });

  const mainDoc = (main) => {
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = `<main>${main}</main>`;
    return doc;
  };
  const mergeMains = async ({ base, source, dest }) => smartMerge({
    site: 'site',
    config: {},
    base: await hashes(mainDoc(base)),
    source: mainDoc(source),
    dest: mainDoc(dest),
  });

  it('keeps section boundaries when upstream reorders a section and changes its wrapper', async () => {
    const { html, skipped } = await mergeMains({
      base: '<div id="a"><p>A</p></div><div id="b"><p>B</p></div>',
      source: '<div id="b-new"><p>B</p></div><div id="a"><p>A</p></div>',
      dest: '<div id="a"><p>A localized</p></div><div id="b"><p>B</p></div>',
    });
    expect(html).to.equal('<div id="a"><p>A localized</p></div><div id="b-new"><p>B</p></div>');
    expect(skipped).to.equal(0);
  });

  it('keeps the local wrapper when both sides changed it and upstream also reordered', async () => {
    const { html, skipped } = await mergeMains({
      base: '<div id="a"><p>A</p></div><div id="b"><p>B</p></div>',
      source: '<div id="b-new"><p>B</p></div><div id="a"><p>A</p></div>',
      dest: '<div id="a"><p>A localized</p></div><div id="b-apac"><p>B</p></div>',
    });
    expect(html).to.equal('<div id="a"><p>A localized</p></div><div id="b-apac"><p>B</p></div>');
    expect(skipped).to.equal(1);
  });

  it('applies global edits and keeps local edits to other blocks', async () => {
    const { html, skipped } = await merge({
      base: '<h1>A</h1><p>B</p><p>C</p>',
      source: '<h1>A</h1><p>B2</p><p>C</p>',
      dest: '<h1>A local</h1><p>B</p><p>C</p>',
    });
    expect(html).to.equal('<div><h1>A local</h1><p>B2</p><p>C</p></div>');
    expect(skipped).to.equal(0);
  });

  it('keeps the local version and counts a skip when both edited the same block', async () => {
    const { html, skipped } = await merge({
      base: '<h1>A</h1><p>B</p><p>C</p>',
      source: '<h1>A</h1><p>B global</p><p>C</p>',
      dest: '<h1>A</h1><p>B local</p><p>C</p>',
    });
    expect(html).to.equal('<div><h1>A</h1><p>B local</p><p>C</p></div>');
    expect(skipped).to.equal(1);
  });

  it('does not count a skip when both sides made the same edit', async () => {
    const { html, skipped } = await merge({
      base: '<p>A</p><p>B</p>',
      source: '<p>A</p><p>B2</p>',
      dest: '<p>A</p><p>B2</p>',
    });
    expect(html).to.equal('<div><p>A</p><p>B2</p></div>');
    expect(skipped).to.equal(0);
  });

  it('applies global inserts and deletes while keeping local inserts', async () => {
    const { html, skipped } = await merge({
      base: '<p>A</p><p>B</p><p>C</p><p>D</p>',
      source: '<p>A</p><p>New</p><p>B</p><p>D</p>',
      dest: '<p>A</p><p>B</p><p>C</p><p>D</p><p>Local</p>',
    });
    expect(html).to.equal('<div><p>A</p><p>New</p><p>B</p><p>D</p><p>Local</p></div>');
    expect(skipped).to.equal(0);
  });

  it('keeps a locally edited block that global deleted', async () => {
    const { html, skipped } = await merge({
      base: '<p>A</p><p>B</p><p>C</p>',
      source: '<p>A</p><p>C</p>',
      dest: '<p>A</p><p>B local</p><p>C</p>',
    });
    expect(html).to.equal('<div><p>A</p><p>B local</p><p>C</p></div>');
    expect(skipped).to.equal(1);
  });

  it('applies a global reorder when the destination is unchanged', async () => {
    const { html } = await merge({
      base: '<p>A</p><p>B</p><p>C</p>',
      source: '<p>B</p><p>A</p><p>C</p>',
      dest: '<p>A</p><p>B</p><p>C</p>',
    });
    expect(html).to.equal('<div><p>B</p><p>A</p><p>C</p></div>');
  });

  it('preserves sections and blocks', async () => {
    const block = '<div class="hero"><div><div>Hero</div></div></div>';
    const { html, skipped } = await merge({
      base: [`${block}<p>A</p>`, '<p>B</p>'],
      source: [`${block}<p>A2</p>`, '<p>B</p>'],
      dest: [`${block}<p>A</p>`, '<p>B local</p>'],
    });
    expect(html).to.equal(`<div>${block}<p>A2</p></div><div><p>B local</p></div>`);
    expect(skipped).to.equal(0);
  });

  it('does not duplicate a localized block that global moved', async () => {
    const { html, skipped } = await merge({
      base: '<p>A</p><p>B</p><p>C</p>',
      source: '<p>B</p><p>A</p><p>C</p>',
      dest: '<p>A local</p><p>B</p><p>C</p>',
    });
    expect(html).to.not.include('<p>A</p>');
    expect(html.match(/A local/g)).to.have.length(1);
    expect(html).to.include('<p>B</p>');
    expect(skipped).to.equal(0);
  });

  it('applies a global insert next to a localized block', async () => {
    const { html, skipped } = await merge({
      base: '<p>A</p><p>B</p><p>C</p>',
      source: '<p>A</p><p>X</p><p>B</p><p>C</p>',
      dest: '<p>A</p><p>B local</p><p>C</p>',
    });
    expect(html).to.equal('<div><p>A</p><p>X</p><p>B local</p><p>C</p></div>');
    expect(skipped).to.equal(0);
  });

  it('keeps both a local and a global insert at the same spot', async () => {
    const { html, skipped } = await merge({
      base: '<p>A</p><p>C</p>',
      source: '<p>A</p><p>X</p><p>C</p>',
      dest: '<p>A</p><p>Y</p><p>C</p>',
    });
    expect(html).to.equal('<div><p>A</p><p>Y</p><p>X</p><p>C</p></div>');
    expect(skipped).to.equal(0);
  });

  it('applies non-conflicting global edits in a region with a conflict', async () => {
    const { html, skipped } = await merge({
      base: '<p>A</p><p>B</p><p>C</p>',
      source: '<p>A2</p><p>B2</p><p>C</p>',
      dest: '<p>A local</p><p>B</p><p>C</p>',
    });
    expect(html).to.equal('<div><p>A local</p><p>B2</p><p>C</p></div>');
    expect(skipped).to.equal(1);
  });

  it('keeps destination blocks in a conflicted region instead of dropping them', async () => {
    const { html, skipped } = await merge({
      base: '<p>A</p><p>B</p><p>C</p>',
      source: '<p>A2</p><p>X</p><p>B2</p><p>C</p>',
      dest: '<p>A local</p><p>B</p><p>C</p>',
    });
    expect(html).to.equal('<div><p>A local</p><p>B</p><p>C</p></div>');
    expect(skipped).to.equal(1);
  });

  it('does not duplicate a global insert the destination already has', async () => {
    const { html, skipped } = await merge({
      base: '<p>A</p><p>C</p>',
      source: '<p>A</p><p>X</p><p>C</p>',
      dest: '<p>A</p><p>X</p><p>Y</p><p>C</p>',
    });
    expect(html).to.equal('<div><p>A</p><p>X</p><p>Y</p><p>C</p></div>');
    expect(skipped).to.equal(0);
  });

  it('applies a new duplicate of a block the destination localized', async () => {
    const { html, skipped } = await merge({
      base: '<p>A</p><p>B</p><p>C</p>',
      source: '<p>A</p><p>A</p><p>B</p><p>C</p>',
      dest: '<p>A local</p><p>B</p><p>C</p>',
    });
    expect(html).to.equal('<div><p>A local</p><p>A</p><p>B</p><p>C</p></div>');
    expect(skipped).to.equal(0);
  });

  it('keeps section boundaries when both sides added a section', async () => {
    const meta = (style) => `<div class="section-metadata"><div><div>style</div><div>${style}</div></div></div>`;
    const { html, skipped } = await merge({
      base: '<p>A</p>',
      source: ['<p>A</p>', `<p>Global</p>${meta('dark')}`],
      dest: ['<p>A</p>', `<p>Local</p>${meta('light')}`],
    });
    expect(html).to.equal(`<div><p>A</p></div><div><p>Local</p>${meta('light')}</div><div><p>Global</p>${meta('dark')}</div>`);
    expect(skipped).to.equal(0);
  });

  it('keeps the destination order when upstream moved a section', async () => {
    const { html, skipped } = await merge({
      base: ['<p>A</p>', '<p>B</p>'],
      source: ['<p>B</p>', '<p>A</p>'],
      dest: ['<p>A local</p>', '<p>B</p>'],
    });
    expect(html).to.equal('<div><p>A local</p></div><div><p>B</p></div>');
    expect(skipped).to.equal(0);
  });

  it('keeps section metadata with its section when both sides prepended a section', async () => {
    const meta = (style) => `<div class="section-metadata"><div><div>style</div><div>${style}</div></div></div>`;
    const { html, skipped } = await merge({
      base: '<p>A</p>',
      source: [`<p>Global</p>${meta('dark')}`, '<p>A</p>'],
      dest: [`<p>Local</p>${meta('light')}`, '<p>A</p>'],
    });
    expect(html).to.equal(`<div><p>Local</p>${meta('light')}</div><div><p>Global</p>${meta('dark')}</div><div><p>A</p></div>`);
    expect(skipped).to.equal(0);
  });

  it('preserves a leading empty section in the destination', async () => {
    const { html, skipped } = await merge({
      base: '<p>A</p>',
      source: '<p>A</p>',
      dest: ['', '<p>A</p>'],
    });
    expect(html).to.equal('<div></div><div><p>A</p></div>');
    expect(skipped).to.equal(0);
  });

  it('treats indentation inside code blocks as a change', async () => {
    const code = (indent) => `<pre><code>line 1\n${indent}line 2</code></pre>`;
    const local = await merge({
      base: `<p>A</p>${code('  ')}`,
      source: `<p>A2</p>${code('  ')}`,
      dest: `<p>A</p>${code('    ')}`,
    });
    expect(local.html).to.equal(`<div><p>A2</p>${code('    ')}</div>`);
    const upstream = await merge({
      base: `<p>A</p>${code('  ')}`,
      source: `<p>A</p>${code('    ')}`,
      dest: `<p>A local</p>${code('  ')}`,
    });
    expect(upstream.html).to.equal(`<div><p>A local</p>${code('    ')}</div>`);
  });

  it('keeps the localized sections when both sides insert ambiguous new sections', async () => {
    const doc = (sections) => {
      const d = document.implementation.createHTMLDocument();
      d.body.innerHTML = `<main>${sections}</main>`;
      return d;
    };
    const { html, skipped } = await smartMerge({
      site: 'site',
      config: {},
      base: await hashes(doc('<div><p>A</p></div>')),
      source: doc('<div><p>G</p></div><div id="global"><p>A</p></div>'),
      dest: doc('<div><p>L</p></div><div id="local"><p>A</p></div>'),
    });
    expect(html).to.equal('<div><p>L</p></div><div id="local"><p>A</p></div>');
    expect(skipped).to.equal(1);
  });

  it('keeps section attributes inside block groups', async () => {
    const group = (attrs) => `<main><div><div class="block-group-start"></div><p>A</p></div><div${attrs}><p>B</p><div class="block-group-end"></div></div><div><p>C</p></div></main>`;
    const doc = (html) => {
      const d = document.implementation.createHTMLDocument();
      d.body.innerHTML = html;
      return d;
    };
    const base = await hashes(doc(group('')));
    const { html } = await smartMerge({
      site: 'site',
      config: {},
      base,
      source: doc(group('').replace('<p>C</p>', '<p>C2</p>')),
      dest: doc(group(' id="local"')),
    });
    expect(html).to.include('<div id="local"><p>B</p>');
    expect(html).to.include('<p>C2</p>');
  });

  it('returns the source block hashes to use as the next base', async () => {
    const source = '<p>A</p><p>B</p>';
    const { sourceHashes } = await merge({ base: '<p>A</p>', source, dest: '<p>A</p>' });
    expect(sourceHashes).to.deep.equal(await hashes(toDoc(source)));
  });

  it('matches rejected blocks by the hash merge stores, taken from the link-normalized copy', async () => {
    const link = '<p><a href="https://main--site--org.hlx.page/x">L</a></p>';
    const rejected = [getDiffHash('<p><a href="https://main--site--org.aem.live/x">L</a></p>')];
    const { html } = await smartMerge({
      site: 'site',
      config: {},
      base: await hashes(toDoc('<p>A</p><p>B</p>')),
      source: toDoc(`<p>A</p>${link}<p>B</p>`),
      dest: toDoc('<p>A</p><p>B</p>'),
      rejected,
    });
    expect(html).to.equal('<div><p>A</p><p>B</p></div>');
    const reviewed = await regionalDiff(toDoc(`<p>A</p>${link}<p>B</p>`), toDoc('<p>A</p><p>B</p>'), [], rejected, { site: 'site', config: {} });
    expect(reviewed.innerHTML).to.not.include('/x');
  });

  it('saves a page whose blocks match its next base when every upstream block was rejected', async () => {
    const rejected = [getDiffHash('<p>R</p>')];
    const first = await smartMerge({
      site: 'site', config: {}, base: await hashes(toDoc('<p>A</p>')), source: toDoc('<p>R</p>'), dest: toDoc('<p>A</p>'), rejected,
    });
    const saved = mainDoc(first.html);
    expect(await hashes(saved)).to.deep.equal(first.sourceHashes);
    const second = await smartMerge({
      site: 'site', config: {}, base: first.sourceHashes, source: toDoc('<p>R</p><p>N</p>'), dest: saved, rejected,
    });
    expect(second.html).to.equal('<div><p>N</p></div>');
  });

  it('saves real pages consistent with their next base when blocks are rejected (300 random pages)', async () => {
    let state = 20261110;
    const random = () => {
      state = (state * 48271) % 2147483647;
      return (state - 1) / 2147483646;
    };
    const pick = (list) => list[Math.floor(random() * list.length)];
    const toSections = (tokens) => tokens.join(' ').split('|').map((s) => s.trim().split(' ').filter(Boolean));
    const toPage = (tokens) => toDoc(toSections(tokens).map((s) => s.map((x) => `<p>${x}</p>`).join('')));
    const edit = (tokens) => tokens.flatMap((x) => {
      const roll = random();
      if (roll < 0.15) return [];
      if (roll < 0.3) return [x, pick(['R', 'N', '|'])];
      return [x];
    });
    const rejected = [getDiffHash('<p>R</p>')];
    for (let i = 0; i < 300; i += 1) {
      const base = Array.from({ length: 1 + Math.floor(random() * 5) }, () => pick(['A', 'B', 'C', '|']));
      const source = random() < 0.1 ? base.map((x) => (x === '|' ? x : 'R')) : edit(base);
      const local = random() < 0.5;
      const dest = local ? [...base, `L${i}`] : base;
      const baseHashes = await hashes(toPage(base));
      const { html, sourceHashes } = await smartMerge({
        site: 'site', config: {}, base: baseHashes, source: toPage(source), dest: toPage(dest), rejected,
      });
      const label = `base=${base} source=${source} dest=${dest} html=${html}`;
      expect(html, `rejected stays out: ${label}`).to.not.include('<p>R</p>');
      if (local) expect(html, `local kept: ${label}`).to.include(`<p>L${i}</p>`);
      if (!local) expect(await hashes(mainDoc(html)), `saved page equals next base: ${label}`).to.deep.equal(sourceHashes);
    }
  });

  it('removes sections that held only rejected blocks but keeps one section', async () => {
    const rejected = [getDiffHash('<p>R</p>')];
    const copy = await removeRejectedBlocks({
      doc: toDoc(['<p>R</p>', '<p>A</p><p>R</p>']), rejected, site: 'site', config: {},
    });
    expect(copy.querySelector('main').innerHTML).to.equal('<div><p>A</p></div>');
    const all = await removeRejectedBlocks({
      doc: toDoc(['<p>R</p>', '<p>R</p>']), rejected, site: 'site', config: {},
    });
    expect(all.querySelector('main').innerHTML).to.equal('<div></div>');
  });

  it('keeps the same section in the merge and the empty-page copy when everything was rejected', async () => {
    const rejected = [getDiffHash('<p>R</p>')];
    const source = () => mainDoc('<div class="a"><p>R</p></div><div class="b"><p>R</p></div>');
    const copy = await removeRejectedBlocks({
      doc: source(), rejected, site: 'site', config: {},
    });
    const page = mainDoc(copy.querySelector('main').innerHTML);
    const base = await hashes(page);
    const { sourceHashes } = await smartMerge({
      site: 'site', config: {}, base, source: source(), dest: page, rejected,
    });
    expect(sourceHashes).to.deep.equal(base);
  });

  it('leaves out a first section that held only rejected blocks', async () => {
    const rejected = [getDiffHash('<p>R</p>')];
    const { html, sourceHashes } = await smartMerge({
      site: 'site', config: {}, base: await hashes(toDoc('<p>A</p>')), source: toDoc(['<p>R</p>', '<p>A</p>']), dest: toDoc('<p>A</p>'), rejected,
    });
    expect(html).to.equal('<div><p>A</p></div>');
    expect(await hashes(mainDoc(html))).to.deep.equal(sourceHashes);
  });
});

describe('regionalDiff keeps blocks in their own section', () => {
  const toDoc = (sections) => {
    const doc = document.implementation.createHTMLDocument();
    const toHtml = (text) => (text.startsWith('<') ? text : `<p>${text}</p>`);
    const html = sections.map((blocks) => `<div>${blocks.map(toHtml).join('')}</div>`).join('');
    doc.body.innerHTML = `<main>${html}</main>`;
    return doc;
  };
  const toSections = (main) => [...main.querySelectorAll(':scope > div')]
    .map((section) => [...section.children].map((el) => {
      if (el.nodeName === 'DA-DIFF-DELETED') return `-${el.textContent}`;
      if (el.hasAttribute('da-diff-added')) return `+${el.textContent}`;
      return el.textContent;
    }));
  const diffSections = async (original, modified) => toSections(
    await regionalDiff(toDoc(original), toDoc(modified), [], []),
  );

  beforeEach(() => {
    window.fetch = sinon.stub().callsFake(() => mockRes(''));
  });

  afterEach(() => {
    window.fetch = originalFetch;
  });

  it('keeps an incoming trailing block before the section break when the target section is shorter', async () => {
    const sections = await diffSections(
      [['intro', 'detail', 'section-metadata'], ['next']],
      [['intro'], ['next']],
    );
    expect(sections).to.deep.equal([['intro', '-detail', '-section-metadata'], ['next']]);
  });

  it('keeps an incoming block after the section break when the target section is longer', async () => {
    const sections = await diffSections(
      [['intro'], ['incoming', 'next']],
      [['intro', 'local'], ['next']],
    );
    expect(sections).to.deep.equal([['intro', '+local'], ['-incoming', 'next']]);
  });

  it('keeps each block on its own side when a section break is at a different position in each document', async () => {
    const targetBreakFirst = await diffSections(
      [['a', 'x', 'y'], ['b', 'c']],
      [['a'], ['b', 'c']],
    );
    expect(targetBreakFirst).to.deep.equal([['a', '-x', '-y'], ['b', 'c']]);
    const incomingBreakFirst = await diffSections(
      [['a'], ['x', 'y', 'b']],
      [['a', 'l1', 'l2'], ['b']],
    );
    expect(incomingBreakFirst).to.deep.equal([['a', '+l1', '+l2'], ['-x', '-y', 'b']]);
  });

  it('pairs section breaks in order when sections change size differently', async () => {
    const sections = await diffSections(
      [['b0', 'b1'], ['b2'], ['b3', 'b4', 'b5'], ['b6']],
      [['b0', 'n8', 'n10', 'b1'], ['n9', 'b2'], ['b3', 'b4', 'b5'], ['m7']],
    );
    expect(sections).to.deep.equal([
      ['b0', '+n8', '+n10', 'b1'],
      ['+n9', 'b2'],
      ['b3', 'b4', 'b5'],
      ['-b6', '+m7'],
    ]);
  });

  it('keeps an empty leading section in the target', async () => {
    const sections = await diffSections([['intro'], ['next']], [[], ['next']]);
    expect(sections).to.deep.equal([['-intro'], ['next']]);
  });

  it('keeps an empty leading section that both documents share', async () => {
    const sections = await diffSections([[], ['next']], [[], ['next']]);
    expect(sections).to.deep.equal([[], ['next']]);
  });

  it('does not add an empty section when only the incoming document starts with one', async () => {
    const sections = await diffSections([[], ['a'], ['b']], [['a'], ['b']]);
    expect(sections).to.deep.equal([['a'], ['b']]);
  });

  it('keeps an incoming block in its section when only the incoming document starts empty', async () => {
    const sections = await diffSections([[], ['a', 'x'], ['b']], [['a'], ['b']]);
    expect(sections).to.deep.equal([['a', '-x'], ['b']]);
  });

  it('matches sections as before when the documents have a different number of sections', async () => {
    const incoming = await diffSections([[], [], ['a', 'x'], ['b']], [[], ['a'], ['b']]);
    expect(incoming).to.deep.equal([['a', '-x'], ['b']]);
    const local = await diffSections([[], ['a'], ['b']], [[], [], ['a', 'x'], ['b']]);
    expect(local).to.deep.equal([['a', '+x'], ['b']]);
  });

  it('keeps an incoming block with its section when a block group spans sections differently', async () => {
    const start = '<div class="block-group-start"><div><div>start</div></div></div>';
    const end = '<div class="block-group-end"><div><div>end</div></div></div>';
    const sections = await diffSections(
      [['a'], [start, 'g'], [end], ['b', 'x'], ['c']],
      [['a'], [start, 'g', end], [], ['b'], ['c']],
    );
    expect(sections).to.deep.equal([
      ['a'],
      ['-startgend', '+start', 'g', 'end'],
      [],
      ['-x', 'b'],
      ['c'],
    ]);
  });

  it('does not add an empty section between two changed block groups', async () => {
    const start = (name) => `<div class="block-group-start"><div><div>${name}</div></div></div>`;
    const end = '<div class="block-group-end"><div><div>end</div></div></div>';
    const changed = await diffSections(
      [['a', start('one'), 'g1', end, start('two'), 'g2', end], ['b']],
      [['a', start('one'), 'g1x', end, start('two'), 'g2x', end], ['b']],
    );
    expect(changed).to.deep.equal([
      ['a'],
      ['-oneg1end', '+one', 'g1x', 'end'],
      ['-twog2end', '+two', 'g2x', 'end'],
      ['b'],
    ]);
    const sameThenChanged = await diffSections(
      [[start('one'), 'g1', end, start('two'), 'g2', end], ['b']],
      [[start('one'), 'g1', end, start('two'), 'g2x', end], ['b']],
    );
    expect(sameThenChanged).to.deep.equal([
      ['one', 'g1', 'end'],
      ['-twog2end', '+two', 'g2x', 'end'],
      ['b'],
    ]);
  });
});
