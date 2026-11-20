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
        const chevron = summary.firstElementChild;
        expect(chevron.tagName).to.equal('svg');
        expect(chevron.getAttribute('aria-hidden')).to.equal('true');
        expect(chevron.querySelector('use').getAttribute('href'))
          .to.match(/\/img\/icons\/s2-icon-chevronleft-10-n\.svg#icon$/);
        expect(chevron.nextSibling.textContent).to.equal('Details');
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

    it('centers the chevron and keeps the disclosure close to the title', async () => {
      host = mount({
        calls: [{ toolCallId: 'tc1', toolName: 'some_tool', arguments: { content: 'Page HTML' } }],
        decisions: {},
      }, () => {});
      const style = document.createElement('style');
      style.textContent = await (await fetch('/nx2/blocks/chat-ao/chat-ao.css')).text();
      host.append(style);
      host.style.setProperty('--s2-spacing-100', '8px');
      document.body.append(host);

      const summary = host.querySelector('summary');
      const summaryRect = summary.getBoundingClientRect();
      const chevronRect = summary.querySelector('svg').getBoundingClientRect();
      const titleRect = host.querySelector('.permission-row-tool').getBoundingClientRect();
      expect(summaryRect.top - titleRect.bottom).to.equal(8);
      expect(chevronRect.top + chevronRect.height / 2)
        .to.be.closeTo(summaryRect.top + summaryRect.height / 2, 0.5);
      expect(getComputedStyle(summary).paddingTop).to.equal('0px');
      expect(getComputedStyle(summary).paddingBottom).to.equal('0px');

      const chevron = summary.querySelector('svg');
      const collapsed = new DOMMatrix(getComputedStyle(chevron).transform);
      expect(collapsed.a).to.be.closeTo(1, 0.001);
      expect(collapsed.b).to.be.closeTo(0, 0.001);

      summary.click();
      const expanded = new DOMMatrix(getComputedStyle(chevron).transform);
      expect(expanded.a).to.be.closeTo(0, 0.001);
      expect(expanded.b).to.be.closeTo(1, 0.001);
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
