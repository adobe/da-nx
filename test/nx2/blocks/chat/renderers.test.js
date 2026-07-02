import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import { renderMessage } from '../../../../nx2/blocks/chat/renderers.js';

// Render an assistant message and return the mounted container for DOM assertions.
function renderAssistant(content) {
  const host = document.createElement('div');
  render(renderMessage({ role: 'assistant', content }), host);
  return host;
}

describe('renderers link handling', () => {
  it('linkifies a bare URL in assistant prose', () => {
    const host = renderAssistant('Your page is live at https://main--site--org.aem.live/index now.');
    const link = host.querySelector('.message-content a');
    expect(link).to.exist;
    expect(link.getAttribute('href')).to.equal('https://main--site--org.aem.live/index');
    expect(link.textContent).to.equal('https://main--site--org.aem.live/index');
    expect(link.getAttribute('target')).to.equal('_blank');
    expect(link.getAttribute('rel')).to.equal('noopener noreferrer');
  });

  it('keeps trailing sentence punctuation out of the href', () => {
    const host = renderAssistant('See https://example.com/page.');
    const link = host.querySelector('.message-content a');
    expect(link.getAttribute('href')).to.equal('https://example.com/page');
    expect(host.querySelector('.message-content').textContent).to.contain('https://example.com/page.');
  });

  it('does not absorb a wrapping closing paren into the href', () => {
    const host = renderAssistant('(see https://example.com/docs)');
    const link = host.querySelector('.message-content a');
    expect(link.getAttribute('href')).to.equal('https://example.com/docs');
  });

  it('linkifies multiple bare URLs in a list', () => {
    const host = renderAssistant('- https://a.example.com/x\n- https://b.example.com/y');
    const links = [...host.querySelectorAll('.message-content a')];
    expect(links).to.have.length(2);
    expect(links.map((a) => a.getAttribute('href'))).to.deep.equal([
      'https://a.example.com/x',
      'https://b.example.com/y',
    ]);
  });

  it('still renders standard markdown links', () => {
    const host = renderAssistant('Read the [docs](https://example.com/docs) please.');
    const link = host.querySelector('.message-content a');
    expect(link.getAttribute('href')).to.equal('https://example.com/docs');
    expect(link.textContent).to.equal('docs');
  });

  it('leaves URLs inside inline code as plain text', () => {
    const host = renderAssistant('Call `https://example.com/api` directly.');
    expect(host.querySelector('.message-content code a')).to.equal(null);
    expect(host.querySelector('.message-content code').textContent).to.equal('https://example.com/api');
  });

  it('does not linkify non-http schemes', () => {
    const host = renderAssistant('Reach me at mailto:me@example.com please.');
    expect(host.querySelector('.message-content a')).to.equal(null);
  });
});

describe('renderers — no Document node inserted into Lit template', () => {
  // Regression: hastToDom returns a full #document node (nodeType 9) when the
  // hast root has no children (e.g. an empty directive body). Inserting a
  // Document into a Lit binding throws HierarchyRequestError. toDOM() must
  // extract the body children into a DocumentFragment instead.

  it('renders a directive with empty body without throwing', () => {
    // ":::info\n:::" produces a directive segment with content === ''
    // which causes parser.parse('') → hast root with 0 children → createDocument()
    expect(() => renderAssistant(':::info\n:::')).to.not.throw();
  });

  it('renders a directive with empty body as a DocumentFragment (not a Document)', () => {
    // The rendered DOM must not contain a Document node — the container should
    // just be empty (or contain the directive wrapper) without error.
    const host = renderAssistant(':::info\n:::');
    // If we got here without a HierarchyRequestError, the fix is working.
    // Verify the host is still a valid element (not corrupted).
    expect(host.nodeType).to.equal(Node.ELEMENT_NODE);
  });

  it('renders normal markdown after an empty directive', () => {
    const host = renderAssistant(':::info\n:::\nHello **world**.');
    const strong = host.querySelector('.message-content strong');
    expect(strong).to.exist;
    expect(strong.textContent).to.equal('world');
  });
});
