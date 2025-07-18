import { expect } from '@esm-bundle/chai';
import { addDnt, removeDnt, resetIcons, makeIconSpans } from '../../../nx/blocks/loc/dnt/dnt.js';

describe('resetIcons', () => {
  let doc;

  beforeEach(() => {
    // Create a fresh document for each test
    doc = document.implementation.createHTMLDocument();
  });

  it('converts single icon span to text format', () => {
    doc.body.innerHTML = '<div><span class="icon icon-adobe"></span></div>';
    resetIcons(doc);
    expect(doc.body.innerHTML).to.equal('<div>:adobe:</div>');
  });

  it('converts multiple icon spans to text format', () => {
    doc.body.innerHTML = '<div><span class="icon icon-adobe"></span> and <span class="icon icon-microsoft"></span></div>';
    resetIcons(doc);
    expect(doc.body.innerHTML).to.equal('<div>:adobe: and :microsoft:</div>');
  });

  it('handles icon names with hyphens', () => {
    doc.body.innerHTML = '<div><span class="icon icon-hello-world"></span></div>';
    resetIcons(doc);
    expect(doc.body.innerHTML).to.equal('<div>:hello-world:</div>');
  });

  it('preserves surrounding text content', () => {
    doc.body.innerHTML = '<div>Before <span class="icon icon-test"></span> After</div>';
    resetIcons(doc);
    expect(doc.body.innerHTML).to.equal('<div>Before :test: After</div>');
  });

  it('handles nested icon spans', () => {
    doc.body.innerHTML = '<div>Level 1 <div>Level 2 <span class="icon icon-nested"></span></div></div>';
    resetIcons(doc);
    expect(doc.body.innerHTML).to.equal('<div>Level 1 <div>Level 2 :nested:</div></div>');
  });

  it('does nothing when no icons present', () => {
    const html = '<div>No icons here</div>';
    doc.body.innerHTML = html;
    resetIcons(doc);
    expect(doc.body.innerHTML).to.equal(html);
  });

  it('handles empty icon spans', () => {
    doc.body.innerHTML = '<div><span class="icon"></span></div>';
    expect(() => resetIcons(doc)).to.not.throw();
  });

  it('preserves other spans and elements', () => {
    doc.body.innerHTML = '<div><span>Keep me</span> <span class="icon icon-test"></span> <p>Keep me too</p></div>';
    resetIcons(doc);
    expect(doc.body.innerHTML).to.equal('<div><span>Keep me</span> :test: <p>Keep me too</p></div>');
  });
});

describe('makeIconSpans', () => {
  it('converts single icon text to span format', () => {
    const html = '<div>:adobe:</div>';
    const result = makeIconSpans(html);
    expect(result).to.equal('<div><span class="icon icon-adobe"></span></div>');
  });

  it('converts multiple icon texts to span format', () => {
    const html = '<div>:adobe: and :microsoft:</div>';
    const result = makeIconSpans(html);
    expect(result).to.equal('<div><span class="icon icon-adobe"></span>and <span class="icon icon-microsoft"></span></div>');
  });

  it('handles icon names with hyphens', () => {
    const html = '<div>:hello-world:</div>';
    const result = makeIconSpans(html);
    expect(result).to.equal('<div><span class="icon icon-hello-world"></span></div>');
  });

  it('preserves surrounding text content', () => {
    const html = '<div>Before :test: After</div>';
    const result = makeIconSpans(html);
    expect(result).to.equal('<div>Before <span class="icon icon-test"></span>After</div>');
  });

  it('handles multiple icons in nested HTML structure', () => {
    const html = '<div>Level 1 <div>Level 2 :nested:</div> :test:</div>';
    const result = makeIconSpans(html);
    expect(result).to.equal('<div>Level 1 <div>Level 2 <span class="icon icon-nested"></span></div> <span class="icon icon-test"></span></div>');
  });

  it('returns original HTML when no icons present', () => {
    const html = '<div>No icons here</div>';
    const result = makeIconSpans(html);
    expect(result).to.equal(html);
  });

  it('handles icons with numbers in names', () => {
    const html = '<div>:icon123:</div>';
    const result = makeIconSpans(html);
    expect(result).to.equal('<div><span class="icon icon-icon123"></span></div>');
  });

  it('ignores malformed icon syntax', () => {
    const html = '<div>:incomplete and complete:test:</div>';
    const result = makeIconSpans(html);
    expect(result).to.equal('<div>:incomplete and complete<span class="icon icon-test"></span></div>');
  });

  it('handles icons at start and end of text', () => {
    const html = ':start:middle:end:';
    const result = makeIconSpans(html);
    expect(result).to.equal('<span class="icon icon-start"></span>middle<span class="icon icon-end"></span>');
  });

  it('Does not modify icons in alt text', () => {
    const html = '<img src="https://a.com" alt="http://a.com | Hello | :play:">';
    const result = makeIconSpans(html);
    expect(result).to.equal('<img src="https://a.com" alt="http://a.com | Hello | :play:">');
  });
});

describe('code blocks', () => {
  it('adds dnt info to all html code blocks', async () => {
    const html = `<html><head></head><body>
      <main>
        <div><code>console.log("Hello, world!");</code></div>
        <div><code>const x = 1;</code></div>
      </main>
    </body></html>`;
    const result = await addDnt(html, {});
    expect(result).to.equal(`<html><head></head><body>
      <main>
        <div><code translate="no">console.log("Hello, world!");</code></div>
        <div><code translate="no">const x = 1;</code></div>
      </main>
    </body></html>`);

    const removed = await removeDnt({ html: result, org: 'adobecom', site: 'adobe' });
    expect(removed).to.equal(html);
  });
});

describe('addDntInfoToHtml', () => {
  it('adds dnt info to html', async () => {
    const metadataTable = `<html><head></head><body>
  <main>
    <div class="metadata">
        <div>
          <div>language</div>
          <div>English</div>
        </div>
        <div>
          <div>style</div>
          <div>M spacing</div>
        </div>
        <div>
          <div>Title</div>
          <div>Welcome to my page</div>
        </div>
        <div>
          <div>pageperf</div>
          <div>on</div>
        </div>
        <div>
          <div>Description</div>
          <div>This is a test</div>
        </div>
      </div>
    </main>
  </body></html>`;

    const config = {
      'custom-doc-rules': {
        total: 2,
        offset: 0,
        limit: 2,
        data: [
          {
            block: 'metadata, section-metadata',
            rule: 'translate col 2 if col 1 equals "title" or "description"',
            action: '',
          },
        ],
      },
      ':version': 3,
      ':names': ['custom-doc-rules'],
      ':type': 'multi-sheet',
    };

    let expectedHtml = `<html><head></head><body>
  <main>
    <div class="metadata">
        <div translate="no">
          <div>language</div>
          <div>English</div>
        </div>
        <div translate="no">
          <div>style</div>
          <div>M spacing</div>
        </div>
        <div>
          <div translate="no">Title</div>
          <div>Welcome to my page</div>
        </div>
        <div translate="no">
          <div>pageperf</div>
          <div>on</div>
        </div>
        <div>
          <div translate="no">Description</div>
          <div>This is a test</div>
        </div>
      </div>
    </main>`;

    // silly space in return value
    expectedHtml += '\n  </body></html>';
    const result = await addDnt(metadataTable, config);
    expect(result).to.equal(expectedHtml);

    const removed = await removeDnt({ html: result, org: 'adobecom', site: 'adobe' });
    expect(removed).to.equal(metadataTable);
  });

  it('adds dnt info to multiple matching blocks', async () => {
    const metadataTable = `<html><head></head><body>
  <main>
    <div>
      <div class="marquee">
        <div>
          <div>title</div>
          <div>Hello World</div>
        </div>
        <div>
          <div>color</div>
          <div>green</div>
        </div>
      </div>
      <div class="section-metadata">
        <div>
          <div>language</div>
          <div>English</div>
        </div>
        <div>
          <div>style</div>
          <div>M spacing</div>
        </div>
      </div>
    </div>
    <div>
      <div class="myblock">
        <div>
          <div>heading</div>
          <div>beepbloop</div>
        </div>
        <div>
          <div>blockiness</div>
          <div>minecruft</div>
        </div>
      </div>
      <div class="section-metadata">
        <div>
          <div>language</div>
          <div>Tagalog</div>
        </div>
        <div>
          <div>style</div>
          <div>yes</div>
        </div>
      </div>
    </div>
  </main>
  </body></html>`;

    const config = {
      'custom-doc-rules': {
        total: 2,
        offset: 0,
        limit: 2,
        data: [
          {
            block: 'metadata, section-metadata',
            rule: 'do-not-translate',
            action: '',
          },
        ],
      },
      ':version': 3,
      ':names': ['custom-doc-rules'],
      ':type': 'multi-sheet',
    };

    let expectedHtml = `<html><head></head><body>
  <main>
    <div>
      <div class="marquee">
        <div>
          <div>title</div>
          <div>Hello World</div>
        </div>
        <div>
          <div>color</div>
          <div>green</div>
        </div>
      </div>
      <div class="section-metadata" translate="no">
        <div>
          <div>language</div>
          <div>English</div>
        </div>
        <div>
          <div>style</div>
          <div>M spacing</div>
        </div>
      </div>
    </div>
    <div>
      <div class="myblock">
        <div>
          <div>heading</div>
          <div>beepbloop</div>
        </div>
        <div>
          <div>blockiness</div>
          <div>minecruft</div>
        </div>
      </div>
      <div class="section-metadata" translate="no">
        <div>
          <div>language</div>
          <div>Tagalog</div>
        </div>
        <div>
          <div>style</div>
          <div>yes</div>
        </div>
      </div>
    </div>
  </main>`;

    // silly space in return value
    expectedHtml += '\n  </body></html>';
    const result = await addDnt(metadataTable, config);
    expect(result).to.equal(expectedHtml);

    const removed = await removeDnt({ html: result, org: 'adobecom', site: 'adobe' });
    expect(removed).to.equal(metadataTable);
  });
});
