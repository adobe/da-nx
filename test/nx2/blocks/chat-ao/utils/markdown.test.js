import { expect } from '@esm-bundle/chai';
import { renderMarkdown } from '../../../../../nx2/blocks/chat-ao/utils/markdown.js';

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
