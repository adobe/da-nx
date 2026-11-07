import sinon from 'sinon';
import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import { regionalDiff, normalizeLinks, removeLocTags } from '../../nx/public/loc/regional-diff.js';
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

describe('regionalDiff keeps blocks in their own section', () => {
  const toDoc = (sections) => {
    const doc = document.implementation.createHTMLDocument();
    const html = sections.map((blocks) => `<div>${blocks.map((text) => `<p>${text}</p>`).join('')}</div>`).join('');
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

  it('pairs section breaks in order when sections change size differently', async () => {
    const sections = await diffSections(
      [['b0', 'b1'], ['b2'], ['b3', 'b4', 'b5'], ['b6']],
      [['b0', 'n8', 'n10', 'b1'], ['n9', 'b2'], ['b3', 'b4', 'b5'], ['m7']],
    );
    expect(sections[3]).to.include.members(['-b6', '+m7']);
    expect(sections.slice(0, 3).flat()).to.not.include('-b6');
  });

  it('keeps an empty leading section in the target', async () => {
    const sections = await diffSections([['intro'], ['next']], [[], ['next']]);
    expect(sections).to.deep.equal([['-intro'], ['next']]);
  });

  it('keeps an empty leading section that both documents share', async () => {
    const sections = await diffSections([[], ['next']], [[], ['next']]);
    expect(sections).to.deep.equal([[], ['next']]);
  });
});
