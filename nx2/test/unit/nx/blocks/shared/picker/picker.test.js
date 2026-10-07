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

  it('leaves the prefix empty when no icon is supplied', async () => {
    const el = await createPicker({ value: 'plain' });
    const slot = el.shadowRoot.querySelector('slot[name="prefix"]');
    expect(slot.assignedElements()).to.deep.equal([]);
    expect(el.shadowRoot.querySelector('.picker-trigger-label').textContent).to.equal('Plain');
    expect(el.shadowRoot.querySelector('.picker-trigger-label').part.contains('label')).to.be.true;
  });

  it('slots a decorative prefix into the trigger and preserves it across label changes', async () => {
    const el = await createPicker({ value: 'red' });
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('slot', 'prefix');
    icon.setAttribute('aria-hidden', 'true');
    el.append(icon);
    const slot = el.shadowRoot.querySelector('slot[name="prefix"]');
    expect(slot.assignedElements()).to.deep.equal([icon]);
    expect(slot.closest('button')).to.equal(el.shadowRoot.querySelector('.picker-trigger'));
    expect(slot.nextElementSibling).to.equal(triggerSwatch(el));
    expect(getComputedStyle(icon).width).to.equal('20px');
    expect(getComputedStyle(icon).height).to.equal('20px');
    expect(getComputedStyle(icon).flexShrink).to.equal('0');
    el.labelOverride = 'Sorted by Name';
    await el.updateComplete;
    expect(slot.assignedElements()).to.deep.equal([icon]);
    expect(el.shadowRoot.querySelector('.picker-trigger-label').textContent)
      .to.equal('Sorted by Name');
    expect(triggerSwatch(el)).to.not.be.null;
    let anchor;
    el.shadowRoot.querySelector('nx-popover').show = (options) => { anchor = options.anchor; };
    icon.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    expect(anchor).to.equal(el.shadowRoot.querySelector('.picker-trigger'));
  });
});
