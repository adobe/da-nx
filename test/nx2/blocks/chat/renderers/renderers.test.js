import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import { renderMessage, summarizeToolError } from '../../../../../nx2/blocks/chat/renderers/renderers.js';

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

describe('summarizeToolError', () => {
  it('returns the first non-empty line of da-agent errorText', () => {
    const errorText = 'DA Admin API Error (404): Not Found\n{"path":"x"}';
    expect(summarizeToolError(errorText)).to.equal('DA Admin API Error (404): Not Found');
  });

  it('skips leading blank lines and trims', () => {
    expect(summarizeToolError('\n\n   Boom   \nmore')).to.equal('Boom');
  });

  it('caps a very long message at 100 characters', () => {
    expect(summarizeToolError('x'.repeat(250))).to.have.length(100);
  });

  it('returns null for empty, whitespace, or non-string input (caller falls back to state)', () => {
    expect(summarizeToolError('')).to.equal(null);
    expect(summarizeToolError('   \n  ')).to.equal(null);
    expect(summarizeToolError(undefined)).to.equal(null);
    expect(summarizeToolError({ error: 'x' })).to.equal(null);
  });
});
