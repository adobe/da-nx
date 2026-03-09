import { expect } from '@esm-bundle/chai';
import { splitHtml, rejoinHtml } from '../../../../nx/blocks/loc/connectors/google/splitHtml.js';

const MAX = 5000;

describe('splitHtml', () => {
  it('returns single chunk when document is under max length', () => {
    const html = '<div><p>Hello</p><p>World</p></div>';
    const chunks = splitHtml(html, MAX);
    expect(chunks).to.have.lengthOf(1);
    expect(chunks[0]).to.equal(html);
  });

  it('splits at closing-tag boundaries when document exceeds max length', () => {
    const filler = '<p>Paragraph</p>'.repeat(400);
    const html = `<div>${filler}</div>`;
    expect(html.length).to.be.greaterThan(MAX);
    const chunks = splitHtml(html, MAX);
    expect(chunks.length).to.be.greaterThan(1);
    chunks.forEach((chunk) => {
      expect(chunk.length).to.be.at.most(MAX);
    });
    expect(chunks.join('')).to.equal(html);
  });

  it('does not split inside a translate="no" element', () => {
    const before = `<div>${'x'.repeat(2000)}</div>`;
    const dnt = '<span translate="no">Do not translate this.</span>';
    const after = `<div>${'y'.repeat(2000)}</div>`;
    const html = before + dnt + after;
    const chunks = splitHtml(html, MAX);
    const joined = chunks.join('');
    expect(joined).to.include(dnt);
    expect(joined).to.include('Do not translate this.');
  });

  it('sub-splits oversized translate="no" element at sentence boundaries', () => {
    const inner = 'First sentence. Second sentence. Third. '.repeat(200);
    const html = `<span translate="no">${inner}</span>`;
    expect(html.length).to.be.greaterThan(MAX);
    const chunks = splitHtml(html, MAX);
    expect(chunks.length).to.be.greaterThan(1);
    chunks.forEach((chunk) => {
      expect(chunk.length).to.be.at.most(MAX);
    });
    expect(chunks.every((c) => c.includes('data-dnt-split'))).to.be.true;
  });

  it('preserves whitespace in chunks', () => {
    const html = '<div>  \n\t  <p>  Text  </p>  \n</div>';
    const chunks = splitHtml(html, 100);
    const joined = chunks.join('');
    expect(joined).to.equal(html);
  });

  it('handles nested elements inside translate="no"', () => {
    const html = '<span translate="no"><code>nested</code> and <em>more</em></span>';
    const chunks = splitHtml(html, MAX);
    expect(chunks).to.have.lengthOf(1);
    expect(chunks[0]).to.equal(html);
  });

  it('preserves content after nested same-name closing tag in translate="no"', () => {
    const inner = '<div>Inner. </div> Outer. '.repeat(300);
    const html = `<div translate="no">${inner}</div>`;
    expect(html.length).to.be.greaterThan(MAX);
    const chunks = splitHtml(html, MAX);
    const joined = chunks.join('');
    expect(joined).to.include('Inner.');
    expect(joined).to.include('Outer.');
  });

  it('recursively sub-splits very long translate="no" elements', () => {
    const inner = 'Sentence A. Sentence B. '.repeat(500);
    const html = `<span translate="no">${inner}</span>`;
    expect(html.length).to.be.greaterThan(MAX * 2);
    const chunks = splitHtml(html, MAX);
    expect(chunks.length).to.be.greaterThan(2);
    chunks.forEach((chunk) => {
      expect(chunk.length).to.be.at.most(MAX);
    });
    const rejoined = rejoinHtml(chunks.join(''));
    expect(rejoined).not.to.include('data-dnt-split');
  });
});

describe('rejoinHtml', () => {
  it('merges consecutive elements with same data-dnt-split ID', () => {
    const html = '<span translate="no" data-dnt-split="x">A</span><span translate="no" data-dnt-split="x">B</span>';
    const result = rejoinHtml(html);
    expect(result).to.equal('<span translate="no">AB</span>');
    expect(result).not.to.include('data-dnt-split');
  });

  it('leaves HTML without data-dnt-split unchanged', () => {
    const html = '<div><p>Hello</p></div>';
    expect(rejoinHtml(html)).to.equal(html);
  });

  it('removes data-dnt-split from single fragment', () => {
    const html = '<span translate="no" data-dnt-split="id1">Only one</span>';
    const result = rejoinHtml(html);
    expect(result).to.equal('<span translate="no">Only one</span>');
  });

  it('round-trip: rejoin(split(html).join("")) is equivalent for oversized translate=no', () => {
    const inner = 'One. Two. Three. '.repeat(150);
    const original = `<span translate="no">${inner}</span>`;
    const chunks = splitHtml(original, MAX);
    const concatenated = chunks.join('');
    const rejoined = rejoinHtml(concatenated);
    expect(rejoined).to.include('One.');
    expect(rejoined).to.include('Two.');
    expect(rejoined).to.include('Three.');
    expect(rejoined).not.to.include('data-dnt-split');
    expect(rejoined).to.match(/^<span translate="no">[\s\S]*<\/span>$/);
  });
});
