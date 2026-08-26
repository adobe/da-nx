import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import { renderUiArtifact } from '../../../../../nx2/blocks/chat-ao/artifacts/index.js';

function mount(template) {
  const host = document.createElement('div');
  render(template, host);
  return host;
}

describe('artifacts Row', () => {
  it('renders its children inside a ui-artifact-row wrapper', () => {
    const host = mount(renderUiArtifact({
      components: [{
        type: 'Row',
        children: [{ type: 'Markdown', props: { content: 'hi' } }],
      }],
    }));

    expect(host.querySelector('.ui-artifact-row .ui-artifact-markdown')).to.exist;
  });
});
