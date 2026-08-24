import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import { renderUiArtifact } from '../../../../../nx2/blocks/chat-ao/artifacts/index.js';

function mount(template) {
  const host = document.createElement('div');
  render(template, host);
  return host;
}

describe('artifacts renderUiArtifact', () => {
  it('renders nothing for a missing artifact', () => {
    const host = mount(renderUiArtifact(undefined));
    expect(host.textContent.trim()).to.equal('');
  });

  it('renders the text_fallback when there are no components', () => {
    const host = mount(renderUiArtifact({ components: [], textFallback: 'just text' }));
    expect(host.querySelector('.ui-artifact-fallback').textContent).to.equal('just text');
  });

  it('renders a title when one is given', () => {
    const host = mount(renderUiArtifact({
      title: 'Plan summary',
      components: [{ type: 'Markdown', props: { content: 'hello' } }],
    }));
    expect(host.querySelector('.ui-artifact-title').textContent).to.equal('Plan summary');
  });

  it('renders a Markdown component through the shared markdown pipeline', () => {
    const host = mount(renderUiArtifact({
      components: [{ type: 'Markdown', props: { content: '**bold**' } }],
    }));
    expect(host.querySelector('.ui-artifact-markdown strong').textContent).to.equal('bold');
  });

  it('falls back for an unregistered component type without dropping the artifact', () => {
    const host = mount(renderUiArtifact({
      textFallback: 'a table you cannot see yet',
      components: [{ type: 'DataTable', props: { columns: [], data: [] } }],
    }));
    expect(host.querySelector('.ui-artifact-fallback').textContent).to.equal('a table you cannot see yet');
  });
});
