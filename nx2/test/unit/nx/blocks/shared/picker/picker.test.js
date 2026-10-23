import { expect } from '@esm-bundle/chai';
import { setConfig } from '../../../../../../scripts/nx.js';

// picker.js reads getConfig() at import time.
await setConfig({ hostnames: [] });
await import('../../../../../../blocks/shared/picker/picker.js');

const ITEMS = [
  { value: 'red', label: 'Red', swatch: '#ff0000' },
  { value: 'blue', label: 'Blue', swatch: '#0000ff' },
  { value: 'plain', label: 'Plain' },
];

async function createPicker({ items = ITEMS, value } = {}) {
  const el = document.createElement('nx-picker');
  el.items = items;
  if (value !== undefined) el.value = value;
  document.body.append(el);
  await el.updateComplete;
  return el;
}

const triggerSwatch = (el) => el.shadowRoot.querySelector('.picker-trigger .picker-swatch');

describe('nx-picker swatch', () => {
  afterEach(() => {
    document.querySelectorAll('nx-picker').forEach((el) => el.remove());
  });

  it('renders a color swatch on items with item.swatch', async () => {
    const el = await createPicker();
    const swatch = el.shadowRoot.querySelector('[data-value="red"] .picker-swatch');
    expect(swatch).to.not.be.null;
    expect(swatch.style.background).to.equal('rgb(255, 0, 0)');
  });

  it('does not render a swatch on items without item.swatch', async () => {
    const el = await createPicker();
    expect(el.shadowRoot.querySelector('[data-value="plain"] .picker-swatch')).to.be.null;
  });

  it('renders the selected item swatch in the trigger', async () => {
    const el = await createPicker({ value: 'blue' });
    expect(triggerSwatch(el)).to.not.be.null;
    expect(triggerSwatch(el).style.background).to.equal('rgb(0, 0, 255)');
  });

  it('updates the trigger swatch when value changes', async () => {
    const el = await createPicker({ value: 'red' });
    el.value = 'blue';
    await el.updateComplete;
    expect(triggerSwatch(el).style.background).to.equal('rgb(0, 0, 255)');
  });

  it('does not render a trigger swatch when the selected item has none', async () => {
    const el = await createPicker({ value: 'plain' });
    expect(triggerSwatch(el)).to.be.null;
  });

  it('keeps the trigger swatch when labelOverride is set', async () => {
    const el = await createPicker({ value: 'red' });
    el.labelOverride = 'Custom';
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.picker-trigger-label').textContent).to.equal('Custom');
    expect(triggerSwatch(el)).to.not.be.null;
  });

  it('exposes the trigger label for consumer styling without a content slot', async () => {
    const el = await createPicker({ value: 'plain' });
    expect(el.shadowRoot.querySelector('slot')).to.be.null;
    expect(el.shadowRoot.querySelector('.picker-trigger-label').textContent).to.equal('Plain');
    expect(el.shadowRoot.querySelector('.picker-trigger-label').part.contains('label')).to.be.true;
  });

  it('keeps a fixed trigger label while updating the selected item and checkmark', async () => {
    const el = await createPicker({ value: 'red' });
    el.labelOverride = 'Sort';
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.picker-trigger-label').textContent).to.equal('Sort');
    expect(el.shadowRoot.querySelector('[data-value="red"]').getAttribute('aria-selected'))
      .to.equal('true');
    el.value = 'blue';
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.picker-trigger-label').textContent).to.equal('Sort');
    expect(el.shadowRoot.querySelector('[data-value="red"]').getAttribute('aria-selected'))
      .to.equal('false');
    expect(el.shadowRoot.querySelector('[data-value="blue"]').getAttribute('aria-selected'))
      .to.equal('true');
    expect(el.shadowRoot.querySelector('[data-value="blue"] svg')).to.not.be.null;
    expect(el.shadowRoot.querySelector('[data-value="red"] svg')).to.be.null;
  });

  it('supports optional descriptions and leading action icons', async () => {
    const el = await createPicker({
      value: 'org/site',
      items: [
        { value: 'org/site', label: 'Site', description: 'org/site' },
        { value: 'add', label: 'Add site', action: true, leadingIcon: '/icons/add.svg' },
      ],
    });
    expect(el.shadowRoot.querySelector('.picker-item-description').textContent).to.equal('org/site');
    expect(el.shadowRoot.querySelector('.picker-leading-icon use').getAttribute('href')).to.equal('/icons/add.svg#icon');
    const change = new Promise((resolve) => { el.addEventListener('change', resolve, { once: true }); });
    el.shadowRoot.querySelector('[data-value="add"]').click();
    expect((await change).detail.value).to.equal('add');
    expect(el.value).to.equal('org/site');
  });

  it('updates the trigger expanded state when opened and closed', async () => {
    const el = await createPicker();
    el.show();
    await el._popover.updateComplete;
    expect(el._button.getAttribute('aria-expanded')).to.equal('true');
    el.close();
    expect(el._button.getAttribute('aria-expanded')).to.equal('false');
  });

  it('renders optional descriptions with an accessible name and generic styling parts', async () => {
    const el = await createPicker({
      items: [{ section: 'Status' }, { value: 'draft', label: 'Draft', description: 'Not published' }, { divider: true }],
      value: 'draft',
    });
    expect(el.shadowRoot.querySelector('.picker-item-description').textContent).to.equal('Not published');
    expect(el.shadowRoot.querySelector('[part="item"]').getAttribute('aria-label')).to.equal('Draft, Not published');
    ['menu', 'section', 'divider', 'item-label', 'check'].forEach((part) => {
      expect(el.shadowRoot.querySelector(`[part="${part}"]`), part).to.not.be.null;
    });
    expect(el.shadowRoot.querySelector('.picker-trigger-label').textContent).to.equal('Draft');
  });

  it('preserves explicit accessible names and does not treat an action as a selection', async () => {
    const el = await createPicker({
      items: [
        { value: 'draft', label: 'Draft', description: 'Not published', ariaLabel: 'Current draft' },
        { value: 'add', label: 'Add...', action: true, leadingIcon: '/img/icons/s2-icon-add-20-n.svg' },
      ],
      value: 'draft',
    });
    expect(el.shadowRoot.querySelector('[data-value="draft"]').getAttribute('aria-label')).to.equal('Current draft');
    expect(el.shadowRoot.querySelector('[part="leading-icon"] use').getAttribute('href'))
      .to.equal('/img/icons/s2-icon-add-20-n.svg#icon');
    const changes = [];
    el.addEventListener('change', ({ detail }) => changes.push(detail.value));
    el.shadowRoot.querySelector('[data-value="add"]').click();
    expect(changes).to.deep.equal(['add']);
    expect(el.value).to.equal('draft');
  });

  it('focuses a visible item after popover positioning so keyboard events reach the menu', async () => {
    const el = await createPicker({ value: 'red' });
    const popover = el.shadowRoot.querySelector('nx-popover');
    const toggled = new Promise((resolve) => {
      popover.addEventListener('toggle', () => {
        popover.style.visibility = 'hidden';
        requestAnimationFrame(() => { popover.style.visibility = ''; });
        resolve();
      }, { once: true });
    });
    el.show();
    await toggled;
    await new Promise(requestAnimationFrame);
    expect(el.shadowRoot.activeElement).to.equal(el.shadowRoot.querySelector('[data-value="red"]'));
    el.shadowRoot.activeElement.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, composed: true }),
    );
    await el.updateComplete;
    el.shadowRoot.activeElement.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }),
    );
    expect(el.value).to.equal('blue');
  });

  it('keeps keyboard selection and expanded state working with described items', async () => {
    const el = await createPicker({
      items: [{ value: 'draft', label: 'Draft', description: 'Not published' }, { value: 'live', label: 'Live' }],
      value: 'draft',
    });
    const toggled = new Promise((resolve) => {
      el.shadowRoot.querySelector('nx-popover').addEventListener('toggle', resolve, { once: true });
    });
    el.shadowRoot.querySelector('.picker-trigger').click();
    await toggled;
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.picker-trigger').getAttribute('aria-expanded')).to.equal('true');
    el.handleKey('ArrowDown');
    el.handleKey('Enter');
    await el.updateComplete;
    expect(el.value).to.equal('live');
    expect(el.shadowRoot.querySelector('.picker-trigger').getAttribute('aria-expanded')).to.equal('false');
  });
});
