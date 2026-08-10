import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import { renderToolCard, renderApprovalCard } from '../../../../../nx2/blocks/chat/renderers/card-renderers.js';

function mount(template) {
  const host = document.createElement('div');
  render(template, host);
  return host;
}

describe('card-renderers renderToolCard', () => {
  it('renders nothing for a null card', () => {
    const host = mount(renderToolCard(null));
    expect(host.textContent.trim()).to.equal('');
  });

  it('renders nothing when hidden, regardless of backend', () => {
    const host = mount(renderToolCard({
      toolName: 'x', detail: 'd', hidden: true, failed: false, state: 'approval-requested',
    }));
    expect(host.querySelector('.tool-card')).to.equal(null);
    expect(host.textContent.trim()).to.equal('');
  });

  it('renders a details card using the backend-provided state as the css class', () => {
    const host = mount(renderToolCard({
      toolName: 'content_create', detail: '/a/b', hidden: false, failed: false, state: 'done',
    }));
    const details = host.querySelector('.tool-card');
    expect(details).to.exist;
    expect(details.classList.contains('tool-card-done')).to.equal(true);
    expect(details.querySelector('summary').textContent).to.contain('content_create');
    expect(details.querySelector('.tool-card-detail').textContent).to.equal('/a/b');
  });

  it('shows a status label only when failed', () => {
    const failed = mount(renderToolCard({
      toolName: 'content_create', detail: '/a/b', hidden: false, failed: true, state: 'error',
    }));
    expect(failed.querySelector('.tool-card-status').textContent).to.equal('error');

    const ok = mount(renderToolCard({
      toolName: 'content_create', detail: '/a/b', hidden: false, failed: false, state: 'done',
    }));
    expect(ok.querySelector('.tool-card-status')).to.equal(null);
  });

  it('falls back to a plain span (no .tool-card) when there is no detail', () => {
    const host = mount(renderToolCard({
      toolName: 'content_create', detail: null, hidden: false, failed: false, state: 'done',
    }));
    expect(host.querySelector('.tool-card')).to.equal(null);
    expect(host.querySelector('.tool-card-detail')).to.exist;
    expect(host.querySelector('.tool-card-detail').textContent).to.contain('content_create');
  });
});

describe('card-renderers renderApprovalCard', () => {
  it('renders nothing when there is no pending approval', () => {
    const host = mount(renderApprovalCard(null, () => {}));
    expect(host.textContent.trim()).to.equal('');
  });

  it('renders tool name + summary and wires reject/always-approve/approve', () => {
    const calls = [];
    const onApprove = (...args) => calls.push(args);
    const host = mount(renderApprovalCard(
      { toolCallId: 't1', toolName: 'content_create', summary: '/a/b' },
      onApprove,
    ));
    expect(host.querySelector('.approval-tool-name').textContent).to.equal('content_create');
    expect(host.querySelector('.approval-summary').textContent).to.equal('/a/b');

    const buttons = [...host.querySelectorAll('.approval-buttons button')];
    expect(buttons).to.have.length(3);
    buttons[0].click();
    buttons[1].click();
    buttons[2].click();
    expect(calls).to.deep.equal([
      ['t1', false],
      ['t1', true, true],
      ['t1', true],
    ]);
  });

  it('omits the summary line when summary is null', () => {
    const host = mount(renderApprovalCard(
      { toolCallId: 't1', toolName: 'content_create', summary: null },
      () => {},
    ));
    expect(host.querySelector('.approval-summary')).to.equal(null);
  });
});
