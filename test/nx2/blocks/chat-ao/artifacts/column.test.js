import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import { renderUiArtifact } from '../../../../../nx2/blocks/chat-ao/artifacts/index.js';

function mount(template) {
  const host = document.createElement('div');
  render(template, host);
  return host;
}

describe('artifacts Column', () => {
  it('renders its children inside a ui-artifact-column wrapper', () => {
    const host = mount(renderUiArtifact({
      components: [{
        type: 'Column',
        children: [{ type: 'Markdown', props: { content: 'hi' } }],
      }],
    }));

    expect(host.querySelector('.ui-artifact-column .ui-artifact-markdown')).to.exist;
  });
});
