import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import { registerArtifact, renderArtifactNode, renderFallback } from '../../../../../nx2/blocks/chat-ao/artifacts/registry.js';

function mount(template) {
  const host = document.createElement('div');
  render(template, host);
  return host;
}

describe('artifacts registry renderFallback', () => {
  it('renders the given fallback text', () => {
    const host = mount(renderFallback('plain text summary'));
    expect(host.querySelector('.ui-artifact-fallback').textContent).to.equal('plain text summary');
  });

  it('renders a generic message when no fallback text is given', () => {
    const host = mount(renderFallback(undefined));
    expect(host.querySelector('.ui-artifact-fallback').textContent).to.equal('Unsupported content.');
  });
});

describe('artifacts registry renderArtifactNode', () => {
  it('dispatches to the renderer registered for the node type', () => {
    registerArtifact('TestType', ({ label }) => renderFallback(`rendered: ${label}`));

    const host = mount(renderArtifactNode({ type: 'TestType', props: { label: 'hi' } }));

    expect(host.querySelector('.ui-artifact-fallback').textContent).to.equal('rendered: hi');
  });

  it('falls back to text_fallback for an unregistered type', () => {
    const host = mount(renderArtifactNode({ type: 'NeverRegistered' }, 'a plain summary'));

    expect(host.querySelector('.ui-artifact-fallback').textContent).to.equal('a plain summary');
  });

  it('falls back naming the unknown type when no text_fallback is given', () => {
    const host = mount(renderArtifactNode({ type: 'NeverRegistered' }));

    expect(host.querySelector('.ui-artifact-fallback').textContent).to.equal('Unsupported content (NeverRegistered).');
  });

  it('falls back to text_fallback when the registered renderer throws', () => {
    registerArtifact('Broken', () => { throw new Error('bad props'); });

    const host = mount(renderArtifactNode({ type: 'Broken' }, 'recovered summary'));

    expect(host.querySelector('.ui-artifact-fallback').textContent).to.equal('recovered summary');
  });
});
