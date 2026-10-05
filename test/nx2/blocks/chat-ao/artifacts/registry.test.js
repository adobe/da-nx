import { expect } from '@esm-bundle/chai';
import { render, html } from 'da-lit';
import {
  registerArtifact, renderArtifactNode, renderChildren, renderFallback,
} from '../../../../../nx2/blocks/chat-ao/artifacts/registry.js';

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

  it('hoists top-level node.children into props for a container renderer', () => {
    registerArtifact('TestContainer', ({ children }) => html`<div class="test-container">${renderChildren(children)}</div>`);
    registerArtifact('TestLeaf', ({ label }) => renderFallback(`leaf: ${label}`));

    const host = mount(renderArtifactNode({
      type: 'TestContainer',
      children: [{ type: 'TestLeaf', props: { label: 'a' } }],
    }));

    expect(host.querySelector('.test-container .ui-artifact-fallback').textContent).to.equal('leaf: a');
  });

  it('also accepts children hoisted into props.children', () => {
    registerArtifact('TestContainer', ({ children }) => html`<div class="test-container">${renderChildren(children)}</div>`);
    registerArtifact('TestLeaf', ({ label }) => renderFallback(`leaf: ${label}`));

    const host = mount(renderArtifactNode({
      type: 'TestContainer',
      props: { children: [{ type: 'TestLeaf', props: { label: 'b' } }] },
    }));

    expect(host.querySelector('.test-container .ui-artifact-fallback').textContent).to.equal('leaf: b');
  });

  it('propagates fallbackText down to nested children', () => {
    registerArtifact('TestContainer', ({ children }, ctx) => html`<div class="test-container">${renderChildren(children, ctx)}</div>`);

    const host = mount(renderArtifactNode({
      type: 'TestContainer',
      children: [{ type: 'NeverRegistered' }],
    }, 'inherited fallback'));

    expect(host.querySelector('.ui-artifact-fallback').textContent).to.equal('inherited fallback');
  });
});
