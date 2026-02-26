import { expect } from '@esm-bundle/chai';
import { collapseInnerTextSpaces } from '../../nx/blocks/loc/project/index.js';

describe('collapseInnerTextSpaces', () => {
  it('preserves spaces around inline <a> link', () => {
    const html = '<p>uis nostrud <a href="https://www.adobe.com">exercitation</a> ullamco laboris</p>';
    const result = collapseInnerTextSpaces(html);
    const m = result.match(/<p>([^<]*)<a[^>]*>([^<]*)<\/a>([^<]*)<\/p>/);
    expect(m[1]).to.equal('uis nostrud ');
    expect(m[3]).to.equal(' ullamco laboris');
  });

  it('trims block-level padding', () => {
    const html = '<div>  \n  Hello world  \n  </div>';
    expect(collapseInnerTextSpaces(html)).to.equal('<div>Hello world</div>');
  });

  it('collapses multiple spaces to single space', () => {
    const html = '<p>hello    world</p>';
    expect(collapseInnerTextSpaces(html)).to.equal('<p>hello world</p>');
  });

  it('leaves whitespace-only segments unchanged', () => {
    const html = '<div>\n  \n</div>';
    expect(collapseInnerTextSpaces(html)).to.equal('<div>\n  \n</div>');
  });

  it('preserves spaces around <span> inline element', () => {
    const html = '<p>before <span>link</span> after</p>';
    const result = collapseInnerTextSpaces(html);
    const m = result.match(/<p>([^<]*)<span>([^<]*)<\/span>([^<]*)<\/p>/);
    expect(m[1]).to.equal('before ');
    expect(m[3]).to.equal(' after');
  });

  it('preserves spaces around <strong> and <em> inline elements', () => {
    const html = '<p>text <strong>bold</strong> and <em>italic</em> end</p>';
    const result = collapseInnerTextSpaces(html);
    expect(result).to.include('text <strong>bold</strong>');
    expect(result).to.include('</strong> and <em>italic</em>');
    expect(result).to.include('</em> end');
  });

  it('handles full body with inline link', () => {
    const html = '\n<body>\n  <header></header>\n  <main><div><p>uis nostrud <a href="https://www.adobe.com">exercitation</a> ullamco laboris</p></div></main>\n  <footer></footer>\n</body>\n';
    const result = collapseInnerTextSpaces(html);
    const m = result.match(/<p>([^<]*)<a[^>]*>([^<]*)<\/a>([^<]*)<\/p>/);
    expect(m[1]).to.equal('uis nostrud ');
    expect(m[3]).to.equal(' ullamco laboris');
  });

  it('trims when text is between block elements only', () => {
    const html = '<p>  solo text  </p>';
    expect(collapseInnerTextSpaces(html)).to.equal('<p>solo text</p>');
  });

  it('handles empty string', () => {
    expect(collapseInnerTextSpaces('')).to.equal('');
  });

  it('handles text with no tags', () => {
    const html = 'plain text';
    expect(collapseInnerTextSpaces(html)).to.equal('plain text');
  });

  it('preserves spaces around multiple inline links in one paragraph', () => {
    const html = '<p>See <a href="/a">first</a> and <a href="/b">second</a> links.</p>';
    const result = collapseInnerTextSpaces(html);
    expect(result).to.include('See <a href="/a">first</a>');
    expect(result).to.include('</a> and <a href="/b">second</a>');
    expect(result).to.include('</a> links.');
  });

  it('preserves spaces with nested inline elements', () => {
    const html = '<p>before <span><em>styled</em></span> after</p>';
    const result = collapseInnerTextSpaces(html);
    expect(result).to.include('before <span>');
    expect(result).to.include('</span> after');
    expect(result).to.include('<em>styled</em>');
  });

  it('handles list item with inline link', () => {
    const html = '<ul><li>Learn more at <a href="#">docs</a> for details.</li></ul>';
    const result = collapseInnerTextSpaces(html);
    const m = result.match(/<li>([^<]*)<a[^>]*>([^<]*)<\/a>([^<]*)<\/li>/);
    expect(m[1]).to.equal('Learn more at ');
    expect(m[3]).to.equal(' for details.');
  });

  it('handles header with inline emphasis', () => {
    const html = '<h1>  Welcome to <strong>DA</strong> Live  </h1>';
    const result = collapseInnerTextSpaces(html);
    expect(result).to.include('Welcome to <strong>DA</strong> Live');
    expect(result).not.to.match(/^\s*Welcome/);
  });

  it('handles deeply nested structure with inline and block mix', () => {
    const html = '<div><section><article><p>  Intro <a href="#">link</a> outro  </p></article></section></div>';
    const result = collapseInnerTextSpaces(html);
    const m = result.match(/<p>([^<]*)<a[^>]*>([^<]*)<\/a>([^<]*)<\/p>/);
    expect(m[1]).to.equal('Intro ');
    expect(m[3]).to.equal(' outro');
  });

  it('handles table cell with inline link', () => {
    const html = '<table><tr><td>  Cell has <a href="#">link</a> text  </td></tr></table>';
    const result = collapseInnerTextSpaces(html);
    const m = result.match(/<td>([^<]*)<a[^>]*>([^<]*)<\/a>([^<]*)<\/td>/);
    expect(m[1]).to.equal('Cell has ');
    expect(m[3]).to.equal(' text');
  });

  it('handles paragraph with newlines and inline link', () => {
    const html = '<p>\n  start <a href="#">link</a> end\n</p>';
    const result = collapseInnerTextSpaces(html);
    const m = result.match(/<p>([^<]*)<a[^>]*>([^<]*)<\/a>([^<]*)<\/p>/);
    expect(m[1]).to.include('start ');
    expect(m[3]).to.include(' end');
  });

  it('preserves space between adjacent inline elements', () => {
    const html = '<p><a href="#">first</a> <strong>second</strong></p>';
    const result = collapseInnerTextSpaces(html);
    expect(result).to.include('</a> <strong>');
  });

  it('preserves spaces around <abbr> (in INLINE_TAGS)', () => {
    const html = '<p>see <abbr title="HyperText Markup Language">HTML</abbr> spec</p>';
    const result = collapseInnerTextSpaces(html);
    expect(result).to.include('see <abbr');
    expect(result).to.include('</abbr> spec');
  });

  it('preserves spaces around <sub> and <sup>', () => {
    const html = '<p>H<sub>2</sub>O and x<sup>2</sup></p>';
    const result = collapseInnerTextSpaces(html);
    expect(result).to.include('H<sub>2</sub>O');
    expect(result).to.include('</sup>');
  });

  it('preserves space when inline is at block start', () => {
    const html = '<p><a href="#">link</a> followed by text</p>';
    const result = collapseInnerTextSpaces(html);
    const m = result.match(/<p><a[^>]*>([^<]*)<\/a>([^<]*)<\/p>/);
    expect(m[2]).to.equal(' followed by text');
  });

  it('handles empty inline element between text', () => {
    const html = '<p>before <span></span> after</p>';
    const result = collapseInnerTextSpaces(html);
    expect(result).to.include('before <span></span> after');
  });
});
