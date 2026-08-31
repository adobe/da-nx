import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import { renderUiArtifact } from '../../../../../nx2/blocks/chat-ao/artifacts/index.js';

function mount(template) {
  const host = document.createElement('div');
  render(template, host);
  return host;
}

describe('artifacts Card', () => {
  it('renders its children inside a ui-artifact-card wrapper', () => {
    const host = mount(renderUiArtifact({
      components: [{
        type: 'Card',
        children: [{ type: 'Markdown', props: { content: 'hi' } }],
      }],
    }));

    expect(host.querySelector('.ui-artifact-card .ui-artifact-markdown')).to.exist;
  });

  it('supports nesting through Row and Column, several levels deep', () => {
    const host = mount(renderUiArtifact({
      components: [{
        type: 'Card',
        children: [{
          type: 'Row',
          children: [{
            type: 'Column',
            children: [{ type: 'Markdown', props: { content: 'deep' } }],
          }],
        }],
      }],
    }));

    const markdown = host.querySelector('.ui-artifact-card .ui-artifact-row .ui-artifact-column .ui-artifact-markdown');
    expect(markdown).to.exist;
    expect(markdown.textContent.trim()).to.equal('deep');
  });

  it('falls back for an unknown nested type without breaking the surrounding tree', () => {
    const host = mount(renderUiArtifact({
      textFallback: 'a card you cannot see yet',
      components: [{
        type: 'Card',
        children: [{ type: 'SomeFutureType' }],
      }],
    }));

    expect(host.querySelector('.ui-artifact-card .ui-artifact-fallback').textContent)
      .to.equal('a card you cannot see yet');
  });
});
