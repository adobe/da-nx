import { expect } from '@esm-bundle/chai';
import '../../../../../blocks/shared/tabs/tabs.js';

const ITEMS = [
  { id: 'skills', label: 'Skills' },
  { id: 'agents', label: 'Agents' },
  { id: 'prompts', label: 'Prompts' },
];

const created = [];

async function createTabs(items = ITEMS, active = undefined, label = undefined) {
  const el = document.createElement('nx-tabs');
  el.items = items;
  if (active !== undefined) el.active = active;
  if (label !== undefined) el.label = label;
  document.body.appendChild(el);
  created.push(el);
  await el.updateComplete;
  return el;
}

function buttons(el) {
  return [...el.shadowRoot.querySelectorAll('button[role="tab"]')];
}

function pressKey(el, key) {
  const tablist = el.shadowRoot.querySelector('[role="tablist"]');
  tablist.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

describe('nx-tabs', () => {
  afterEach(() => {
    while (created.length) created.pop().remove();
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
    pressKey(el, 'ArrowRight');
    await el.updateComplete;
    expect(el.active).to.equal('skills');
  });

  it('ArrowLeft moves to the previous tab and wraps at the start', async () => {
    const el = await createTabs(ITEMS, 'skills');
    pressKey(el, 'ArrowLeft');
    await el.updateComplete;
    expect(el.active).to.equal('prompts');
  });

  it('Home and End jump to first and last tab respectively', async () => {
    const el = await createTabs(ITEMS, 'agents');
    pressKey(el, 'End');
    await el.updateComplete;
    expect(el.active).to.equal('prompts');
    pressKey(el, 'Home');
    await el.updateComplete;
    expect(el.active).to.equal('skills');
  });

  it('focuses the newly active tab button after Arrow navigation', async () => {
    const el = await createTabs(ITEMS, 'skills');
    el.focus();
    pressKey(el, 'ArrowRight');
    await el.updateComplete;
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    const focusedId = el.shadowRoot.activeElement?.dataset.id;
    expect(focusedId).to.equal('agents');
  });

  it('focuses the new tab on Home/End navigation', async () => {
    const el = await createTabs(ITEMS, 'agents');
    el.focus();
    pressKey(el, 'End');
    await el.updateComplete;
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expect(el.shadowRoot.activeElement?.dataset.id).to.equal('prompts');
  });

  it('defaults active when items arrive after mount', async () => {
    const el = await createTabs([]);
    expect(el.active).to.be.undefined;
    el.items = ITEMS;
    await el.updateComplete;
    expect(el.active).to.equal('skills');
    expect(el.shadowRoot.querySelector('.tab.is-active')?.dataset.id).to.equal('skills');
  });

  it('resets active to first id when current active is no longer in items', async () => {
    const el = await createTabs(ITEMS, 'agents');
    el.items = [{ id: 'other', label: 'Other' }];
    await el.updateComplete;
    expect(el.active).to.equal('other');
  });

  it('preserves active when it is still present after items change', async () => {
    const el = await createTabs(ITEMS, 'agents');
    el.items = [
      { id: 'agents', label: 'Agents' },
      { id: 'extras', label: 'Extras' },
    ];
    await el.updateComplete;
    expect(el.active).to.equal('agents');
  });

  it('uses the provided label for aria-label on the tablist', async () => {
    const el = await createTabs(ITEMS, undefined, 'Skill categories');
    const tablist = el.shadowRoot.querySelector('[role="tablist"]');
    expect(tablist.getAttribute('aria-label')).to.equal('Skill categories');
  });

  it('falls back to "Navigation tabs" when no label is provided', async () => {
    const el = await createTabs();
    const tablist = el.shadowRoot.querySelector('[role="tablist"]');
    expect(tablist.getAttribute('aria-label')).to.equal('Navigation tabs');
  });

  it('does not throw if disconnected before focus settles', async () => {
    const el = await createTabs(ITEMS, 'skills');
    el.focus();
    pressKey(el, 'ArrowRight');
    el.remove();
    await new Promise((resolve) => { setTimeout(resolve, 0); });
  });

  it('guards customElements.define against double registration', () => {
    expect(() => customElements.define('nx-tabs', class extends HTMLElement {})).to.throw();
    expect(customElements.get('nx-tabs')).to.exist;
  });
});
