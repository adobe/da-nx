import { expect } from '@esm-bundle/chai';
import { renderMarkdown, unescapeLiteralNewlines } from '../../../../../nx2/blocks/chat-ao/utils/markdown.js';

describe('chat-ao renderMarkdown', () => {
  it('parses basic markdown into DOM elements', () => {
    const frag = renderMarkdown('**bold** and a [link](https://example.com)');
    expect(frag.querySelector('strong').textContent).to.equal('bold');
    expect(frag.querySelector('a').getAttribute('href')).to.equal('https://example.com');
  });

  it('sanitizes links with target and rel', () => {
    const frag = renderMarkdown('[a link](https://example.com)');
    const a = frag.querySelector('a');
    expect(a.getAttribute('target')).to.equal('_blank');
    expect(a.getAttribute('rel')).to.include('noopener');
  });

  it('linkifies bare URLs — parseMarkdown suppresses GFM autolinks, same as chat.js', () => {
    const frag = renderMarkdown('see https://example.com/x for more');
    expect(frag.querySelector('a')?.getAttribute('href')).to.equal('https://example.com/x');
  });

  it('does not interpret custom directive syntax as anything special', () => {
    const frag = renderMarkdown(':::alert-info\nhello\n:::');
    expect(frag.querySelector('.directive')).to.equal(null);
  });

  it('returns the lit "nothing" sentinel for empty text', () => {
    expect(renderMarkdown('')).to.not.be.instanceOf(DocumentFragment);
  });
});

describe('chat-ao unescapeLiteralNewlines', () => {
  it('converts a literal backslash-n sequence into a real newline', () => {
    expect(unescapeLiteralNewlines('line one\\nline two')).to.equal('line one\nline two');
  });

  it('converts a literal backslash-r-backslash-n sequence into a real newline', () => {
    expect(unescapeLiteralNewlines('line one\\r\\nline two')).to.equal('line one\nline two');
  });

  it('leaves already-real newlines untouched', () => {
    expect(unescapeLiteralNewlines('line one\nline two')).to.equal('line one\nline two');
  });

  it('handles null/undefined without throwing', () => {
    expect(unescapeLiteralNewlines(undefined)).to.equal('');
    expect(unescapeLiteralNewlines(null)).to.equal('');
  });
});

describe('chat-ao renderMarkdown fenced code blocks', () => {
  it('wraps a fenced code block in a card with a language header', () => {
    const frag = renderMarkdown('```python\nprint(1)\n```');

    const block = frag.querySelector('.code-block');
    expect(block).to.exist;
    expect(block.querySelector('.code-block-lang').textContent).to.equal('python');
    expect(block.querySelector('pre > code').textContent.trim()).to.equal('print(1)');
  });

  it('wraps a fenced code block with no declared language, but adds no header', () => {
    const frag = renderMarkdown('```\nplain text\n```');

    const block = frag.querySelector('.code-block');
    expect(block).to.exist;
    expect(block.querySelector('.code-block-header')).to.equal(null);
  });

  it('leaves inline code spans alone', () => {
    const frag = renderMarkdown('use `const x = 1` inline');

    expect(frag.querySelector('.code-block')).to.equal(null);
    expect(frag.querySelector('code').textContent).to.equal('const x = 1');
  });

  it('does not interpret the fence language as HTML', () => {
    const frag = renderMarkdown('```<img src=x onerror="alert(1)">\ncode\n```');

    expect(frag.querySelector('img')).to.equal(null);
  });
});

describe('chat-ao question-card markdown rendering', () => {
  it('renders question context with literal backslash-n-backslash-n normalized into separate paragraphs', () => {
    const frag = renderMarkdown(unescapeLiteralNewlines('First paragraph.\\n\\nSecond paragraph.'));
    expect(frag.textContent).to.not.include('\\n');
    expect(frag.querySelectorAll('p')).to.have.length(2);
  });

  it('without unescaping, a literal backslash-n stays visible as text rather than breaking the line', () => {
    const frag = renderMarkdown('First line.\\nSecond line.');
    expect(frag.textContent).to.include('\\n');
  });
});
