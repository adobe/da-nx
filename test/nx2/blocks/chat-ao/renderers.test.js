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

  describe('renderPermissionCard details', () => {
    let host;

    afterEach(() => host?.remove());

    [{ content: '<main>Full page HTML</main>' }, 'Raw tool arguments'].forEach((args) => {
      it(`hides ${typeof args} arguments until Details is expanded`, () => {
        const decisions = [];
        host = mount({
          calls: [{ toolCallId: 'tc1', toolName: 'some_tool', arguments: args }],
          decisions: {},
        }, (id, approved) => decisions.push({ id, approved }));
        document.body.append(host);

        const details = host.querySelector('details');
        const summary = details.querySelector('summary');
        const detail = details.querySelector('.permission-row-detail');
        expect(summary.textContent).to.equal('Details');
        expect(details.open).to.equal(false);
        expect(detail.checkVisibility()).to.equal(false);
        expect(host.querySelector('.permission-row-tool').textContent).to.equal('some_tool');
        expect(host.querySelectorAll('.permission-row-buttons button').length).to.equal(2);

        summary.click();
        expect(details.open).to.equal(true);
        expect(detail.checkVisibility()).to.equal(true);
        expect(detail.textContent).to.equal(typeof args === 'string' ? args : JSON.stringify(args));
        expect(decisions).to.deep.equal([]);

        summary.click();
        expect(details.open).to.equal(false);
        expect(detail.checkVisibility()).to.equal(false);
        host.querySelector('.permission-approve-btn').click();
        expect(decisions).to.deep.equal([{ id: 'tc1', approved: true }]);
      });
    });

    it('omits Details when there are no arguments', () => {
      host = mount({
        calls: [{ toolCallId: 'tc1', toolName: 'some_tool' }],
        decisions: {},
      }, () => {});
      expect(host.querySelector('details')).to.equal(null);
      expect(host.querySelectorAll('.permission-row-buttons button').length).to.equal(2);
    });
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
