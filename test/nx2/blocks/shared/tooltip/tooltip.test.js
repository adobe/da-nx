import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../../../../nx2/blocks/shared/tooltip/tooltip.js';

await new Promise((resolve) => {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/nx2/styles/styles.css';
  link.onload = resolve;
  document.head.append(link);
});

async function fixture(root = document.body) {
  const container = document.createElement('div');
  container.className = 'tooltip-fixture';
  const id = `trigger-${crypto.randomUUID()}`;
  container.innerHTML = `<button id="${id}" style="position:fixed;left:300px;top:200px">Save</button>
    <nx-tooltip for="${id}">Save your changes</nx-tooltip>`;
  root.append(container);
  const trigger = container.querySelector('button');
  const tooltip = container.querySelector('nx-tooltip');
  await tooltip.updateComplete;
  return { container, trigger, tooltip };
}

function pointer(element, type, pointerType = 'mouse') {
  element.dispatchEvent(new PointerEvent(type, { pointerType }));
}

describe('nx-tooltip', () => {
  let clock;

  beforeEach(() => {
    clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    document.querySelectorAll('.tooltip-fixture, .tooltip-shadow-fixture').forEach((el) => el.remove());
    sinon.restore();
  });

  it('leaves the trigger usable when showPopover is unavailable', async () => {
    sinon.stub(HTMLElement.prototype, 'showPopover').value(undefined);
    const { trigger, tooltip } = await fixture();
    const activate = sinon.spy();
    trigger.addEventListener('click', activate);
    trigger.focus();
    pointer(trigger, 'pointerenter');
    await clock.tickAsync(500);
    trigger.click();
    expect(activate.calledOnce).to.be.true;
    expect(tooltip.open).to.be.false;
    expect(getComputedStyle(tooltip).display).to.equal('none');
    expect(trigger.hasAttribute('aria-describedby')).to.be.false;
    expect(() => tooltip.close()).not.to.throw();
  });

  it('stays hidden when CSS anchor positioning is unavailable', async () => {
    const supports = CSS.supports.bind(CSS);
    sinon.stub(CSS, 'supports').callsFake((...args) => (
      args[0] === 'position-area: top' ? false : supports(...args)));
    const { trigger, tooltip } = await fixture();
    trigger.focus();
    pointer(trigger, 'pointerenter');
    await clock.tickAsync(500);
    expect(tooltip.open).to.be.false;
    expect(trigger.hasAttribute('aria-describedby')).to.be.false;
  });

  it('associates the tooltip without replacing the trigger name or existing descriptions', async () => {
    const { trigger, tooltip } = await fixture();
    tooltip.remove();
    trigger.setAttribute('aria-describedby', 'existing-help');
    trigger.after(tooltip);
    await tooltip.updateComplete;
    expect(tooltip.role).to.equal('tooltip');
    expect(trigger.getAttribute('aria-describedby')).to.equal(`existing-help ${tooltip.id}`);
    expect(trigger.textContent).to.equal('Save');
    expect(trigger.hasAttribute('aria-expanded')).to.be.false;
    expect(tooltip.open).to.be.false;
    tooltip.remove();
    expect(trigger.getAttribute('aria-describedby')).to.equal('existing-help');
  });

  it('opens after hover delay, stays hoverable, then closes after leaving both elements', async () => {
    const { trigger, tooltip } = await fixture();
    pointer(trigger, 'pointerenter');
    await clock.tickAsync(499);
    expect(tooltip.open).to.be.false;
    await clock.tickAsync(1);
    expect(tooltip.open).to.be.true;
    expect(document.activeElement).not.to.equal(tooltip);
    pointer(trigger, 'pointerleave');
    pointer(tooltip, 'pointerenter');
    await clock.tickAsync(200);
    expect(tooltip.open).to.be.true;
    pointer(tooltip, 'pointerleave');
    await clock.tickAsync(100);
    expect(tooltip.open).to.be.false;
  });

  it('cancels a pending hover and ignores touch hover', async () => {
    const { trigger, tooltip } = await fixture();
    pointer(trigger, 'pointerenter');
    pointer(trigger, 'pointerleave');
    await clock.tickAsync(500);
    expect(tooltip.open).to.be.false;
    pointer(trigger, 'pointerenter', 'touch');
    await clock.tickAsync(500);
    expect(tooltip.open).to.be.false;
  });

  it('opens immediately on keyboard focus and dismisses with Escape without moving focus', async () => {
    const { trigger, tooltip } = await fixture();
    trigger.focus();
    expect(tooltip.open).to.be.true;
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(tooltip.open).to.be.false;
    expect(document.activeElement).to.equal(trigger);
    await clock.tickAsync(1000);
    expect(tooltip.open).to.be.false;
  });

  it('keeps focus-open content visible after pointer leave, but closes on blur or click', async () => {
    const { trigger, tooltip } = await fixture();
    trigger.focus();
    pointer(trigger, 'pointerenter');
    pointer(trigger, 'pointerleave');
    await clock.tickAsync(100);
    expect(tooltip.open).to.be.true;
    trigger.blur();
    await clock.tickAsync(100);
    expect(tooltip.open).to.be.false;
    trigger.focus();
    trigger.click();
    expect(tooltip.open).to.be.false;
  });

  it('cleans up pending work and descriptions on rebind, removal and reconnection', async () => {
    const { container, trigger, tooltip } = await fixture();
    pointer(trigger, 'pointerenter');
    const next = document.createElement('button');
    next.id = 'next-tooltip-trigger';
    container.append(next);
    tooltip.for = next.id;
    await tooltip.updateComplete;
    await clock.tickAsync(1000);
    expect(tooltip.open).to.be.false;
    expect(trigger.hasAttribute('aria-describedby')).to.be.false;
    expect(next.getAttribute('aria-describedby')).to.equal(tooltip.id);
    pointer(next, 'pointerenter');
    tooltip.remove();
    await clock.tickAsync(1000);
    expect(next.hasAttribute('aria-describedby')).to.be.false;
    container.append(tooltip);
    await tooltip.updateComplete;
    next.focus();
    expect(tooltip.open).to.be.true;
  });

  it('resolves sibling triggers inside a shadow root', async () => {
    const host = document.createElement('div');
    host.className = 'tooltip-shadow-fixture';
    document.body.append(host);
    const root = host.attachShadow({ mode: 'open' });
    const { trigger, tooltip } = await fixture(root);
    expect(trigger.getAttribute('aria-describedby')).to.equal(tooltip.id);
    trigger.focus();
    expect(tooltip.open).to.be.true;
  });

  it('shows only one tooltip at a time', async () => {
    const first = await fixture();
    const second = await fixture();
    first.trigger.focus();
    expect(first.tooltip.open).to.be.true;
    second.trigger.focus();
    expect(first.tooltip.open).to.be.false;
    expect(second.tooltip.open).to.be.true;
  });

  it('positions and points toward the trigger on all four sides', async () => {
    const { trigger, tooltip } = await fixture();
    for (const placement of ['top', 'bottom', 'left', 'right']) {
      tooltip.placement = placement;
      await tooltip.updateComplete;
      trigger.focus();
      expect(tooltip.dataset.side).to.equal(placement);
      tooltip.close();
      trigger.blur();
    }
  });

  it('flips and remains inside the viewport near a clipped container edge', async () => {
    const { container, trigger, tooltip } = await fixture();
    container.style.cssText = 'overflow:hidden;width:1px;height:1px';
    trigger.style.left = '0';
    trigger.style.top = '0';
    trigger.focus();
    const rect = tooltip.getBoundingClientRect();
    expect(tooltip.matches(':popover-open')).to.be.true;
    expect(tooltip.dataset.side).to.equal('bottom');
    expect(rect.left).to.be.at.least(0);
    expect(rect.right).to.be.at.most(window.innerWidth);
    expect(rect.bottom).to.be.at.most(window.innerHeight);
  });
});
