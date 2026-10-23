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

  it('supports optional descriptions and leading action icons in the site menu', async () => {
    const el = await createPicker({
      value: 'org/site',
      items: [
        { value: 'org/site', label: 'Site', description: 'org/site' },
        { value: 'add', label: 'Add site', action: true, leadingIcon: '/icons/add.svg' },
      ],
    });
    el.menuVariant = 'site';
    await el.updateComplete;
    expect(el.getAttribute('menu-variant')).to.equal('site');
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
});
