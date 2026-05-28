import { expect } from '@esm-bundle/chai';
import '../../../../../blocks/shared/tabs/tabs.js';

const ITEMS = [
  { id: 'skills', label: 'Skills' },
  { id: 'agents', label: 'Agents' },
  { id: 'prompts', label: 'Prompts' },
];

async function createTabs(items = ITEMS, active = undefined) {
  const el = document.createElement('nx-tabs');
  el.items = items;
  if (active !== undefined) el.active = active;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

function buttons(el) {
  return [...el.shadowRoot.querySelectorAll('button[role="tab"]')];
}

describe('nx-tabs', () => {
  afterEach(() => {
    document.body.querySelectorAll('nx-tabs').forEach((el) => el.remove());
  });

  it('registers the custom element', () => {
    expect(customElements.get('nx-tabs')).to.exist;
  });

  it('renders a button per item', async () => {
    const el = await createTabs();
    const btns = buttons(el);
    expect(btns).to.have.length(3);
    expect(btns.map((b) => b.textContent.trim())).to.deep.equal(['Skills', 'Agents', 'Prompts']);
  });

  it('renders nothing when items is empty', async () => {
    const el = await createTabs([]);
    expect(el.shadowRoot.querySelector('.tabs')).to.be.null;
  });

  it('defaults active to the first item id when none is provided', async () => {
    const el = await createTabs();
    expect(el.active).to.equal('skills');
    const active = el.shadowRoot.querySelector('.tab.is-active');
    expect(active?.dataset.id).to.equal('skills');
    expect(active?.getAttribute('aria-selected')).to.equal('true');
    expect(active?.getAttribute('tabindex')).to.equal('0');
  });

  it('honors a pre-set active value', async () => {
    const el = await createTabs(ITEMS, 'agents');
    expect(el.shadowRoot.querySelector('.tab.is-active')?.dataset.id).to.equal('agents');
  });

  it('fires tab-change with the new id when a tab is clicked', async () => {
    const el = await createTabs();
    const events = [];
    el.addEventListener('tab-change', (e) => events.push(e.detail));
    buttons(el)[1].click();
    await el.updateComplete;
    expect(events).to.deep.equal([{ id: 'agents' }]);
    expect(el.active).to.equal('agents');
  });

  it('does not fire tab-change when clicking the already-active tab', async () => {
    const el = await createTabs();
    const events = [];
    el.addEventListener('tab-change', (e) => events.push(e.detail));
    buttons(el)[0].click();
    await el.updateComplete;
    expect(events).to.have.length(0);
  });

  it('ArrowRight moves to the next tab and wraps at the end', async () => {
    const el = await createTabs(ITEMS, 'prompts');
    const tablist = el.shadowRoot.querySelector('[role="tablist"]');
    tablist.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await el.updateComplete;
    expect(el.active).to.equal('skills');
  });

  it('ArrowLeft moves to the previous tab and wraps at the start', async () => {
    const el = await createTabs(ITEMS, 'skills');
    const tablist = el.shadowRoot.querySelector('[role="tablist"]');
    tablist.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await el.updateComplete;
    expect(el.active).to.equal('prompts');
  });

  it('Home and End jump to first and last tab respectively', async () => {
    const el = await createTabs(ITEMS, 'agents');
    const tablist = el.shadowRoot.querySelector('[role="tablist"]');
    tablist.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    await el.updateComplete;
    expect(el.active).to.equal('prompts');
    tablist.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    await el.updateComplete;
    expect(el.active).to.equal('skills');
  });
});
