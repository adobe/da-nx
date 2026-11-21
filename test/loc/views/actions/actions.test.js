import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import '../../../../nx/blocks/loc/views/actions/actions.js';

const renderMessage = (message) => {
  const el = document.createElement('nx-loc-actions');
  el.message = message;
  const root = document.createElement('div');
  render(el.renderMessage(), root);
  return root;
};

describe('NxLocActions - renderMessage', () => {
  it('renders a plain message as a paragraph', () => {
    const root = renderMessage({ type: 'error', text: 'Failed.' });

    const msg = root.querySelector('p.message.type-error');
    expect(msg.textContent).to.equal('Failed.');
    expect(root.querySelector('ul')).to.equal(null);
  });

  it('renders items as a list under the text', () => {
    const root = renderMessage({ type: 'error', text: '2 failures:', items: ['French — /a', 'German — /b'] });

    const msg = root.querySelector('div.message.has-items.type-error');
    expect(msg.querySelector('p').textContent).to.equal('2 failures:');
    expect([...msg.querySelectorAll('li')].map((li) => li.textContent)).to.deep.equal(['French — /a', 'German — /b']);
  });
});
