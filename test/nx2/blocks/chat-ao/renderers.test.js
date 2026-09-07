import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import { renderPermissionCard } from '../../../../nx2/blocks/chat-ao/renderers.js';

function mount(pending, onDecide) {
  const host = document.createElement('div');
  render(renderPermissionCard(pending, { onDecide }), host);
  return host;
}

describe('renderPermissionCard keydown', () => {
  const pending = {
    calls: [{ toolCallId: 'tc1', toolName: 'some_tool', arguments: {} }],
    decisions: {},
  };

  it('Escape rejects, regardless of which element (or none) currently has focus', () => {
    const decisions = [];
    const host = mount(pending, (id, approved) => decisions.push({ id, approved }));
    host.querySelector('.permission-row-buttons')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(decisions).to.deep.equal([{ id: 'tc1', approved: false }]);
  });

  it('does not intercept Enter at the wrapper — leaves it to native per-button activation', () => {
    const decisions = [];
    const host = mount(pending, (id, approved) => decisions.push({ id, approved }));
    host.querySelector('.permission-row-buttons')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(decisions).to.deep.equal([]);
  });

  it('ignores keys other than Enter/Escape', () => {
    const decisions = [];
    const host = mount(pending, (id, approved) => decisions.push({ id, approved }));
    host.querySelector('.permission-row-buttons')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }));
    expect(decisions).to.deep.equal([]);
  });
});
