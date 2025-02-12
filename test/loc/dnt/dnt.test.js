import { expect } from '@esm-bundle/chai';
import { resetIcons, makeIconSpans } from '../../../nx/blocks/loc/dnt/dnt.js';

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
    expect(result).to.equal('<div><span class="icon icon-adobe"></span> and <span class="icon icon-microsoft"></span></div>');
  });

  it('handles icon names with hyphens', () => {
    const html = '<div>:hello-world:</div>';
    const result = makeIconSpans(html);
    expect(result).to.equal('<div><span class="icon icon-hello-world"></span></div>');
  });

  it('preserves surrounding text content', () => {
    const html = '<div>Before :test: After</div>';
    const result = makeIconSpans(html);
    expect(result).to.equal('<div>Before <span class="icon icon-test"></span> After</div>');
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
});
