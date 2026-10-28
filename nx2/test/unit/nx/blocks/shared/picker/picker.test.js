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

async function createPicker({ items = ITEMS, value, multiple, values } = {}) {
  const el = document.createElement('nx-picker');
  el.items = items;
  if (value !== undefined) el.value = value;
  if (multiple) el.multiple = true;
  if (values) el.values = values;
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
});

describe('nx-picker multiple', () => {
  afterEach(() => {
    document.querySelectorAll('nx-picker').forEach((el) => el.remove());
  });

  const item = (el, v) => el.shadowRoot.querySelector(`[data-value="${v}"]`);
  const label = (el) => el.shadowRoot.querySelector('.picker-trigger-label').textContent;

  it('toggles values on and off', async () => {
    const el = await createPicker({ multiple: true, values: [] });
    item(el, 'red').click();
    await el.updateComplete;
    expect(el.values).to.deep.equal(['red']);
    expect(item(el, 'red').getAttribute('aria-selected')).to.equal('true');
    item(el, 'red').click();
    await el.updateComplete;
    expect(el.values).to.deep.equal([]);
    expect(item(el, 'red').getAttribute('aria-selected')).to.equal('false');
  });

  it('creates a new array on each change', async () => {
    const el = await createPicker({ multiple: true, values: [] });
    const before = el.values;
    item(el, 'red').click();
    expect(el.values).to.not.equal(before);
  });

  it('keeps the popover open after a toggle', async () => {
    const el = await createPicker({ multiple: true, values: [] });
    el.show();
    await el.updateComplete;
    item(el, 'red').click();
    await el.updateComplete;
    expect(el.open).to.be.true;
  });

  it('fires change with value, values, selected', async () => {
    const el = await createPicker({ multiple: true, values: ['blue'] });
    const events = [];
    el.addEventListener('change', (e) => events.push(e.detail));
    item(el, 'red').click();
    item(el, 'blue').click();
    expect(events[0]).to.deep.equal({ value: 'red', values: ['blue', 'red'], selected: true });
    expect(events[1]).to.deep.equal({ value: 'blue', values: ['red'], selected: false });
  });

  it('joins selected labels in the trigger without a swatch', async () => {
    const el = await createPicker({ multiple: true, values: ['red', 'plain'] });
    expect(label(el)).to.equal('Red, Plain');
    expect(triggerSwatch(el)).to.be.null;
  });

  it('falls back to placeholder and honors labelOverride', async () => {
    const el = await createPicker({ multiple: true, values: [] });
    el.placeholder = 'Pick';
    await el.updateComplete;
    expect(label(el)).to.equal('Pick');
    el.values = ['red'];
    el.labelOverride = 'Colors';
    await el.updateComplete;
    expect(label(el)).to.equal('Colors');
  });

  it('ignores value in multiple mode', async () => {
    const el = await createPicker({ multiple: true, value: 'red', values: ['blue'] });
    expect(item(el, 'red').getAttribute('aria-selected')).to.equal('false');
    expect(label(el)).to.equal('Blue');
  });

  it('sets aria-multiselectable on the listbox', async () => {
    const el = await createPicker({ multiple: true, values: [] });
    expect(el.shadowRoot.querySelector('ul[role=listbox]').getAttribute('aria-multiselectable')).to.equal('true');
  });

  it('does not set aria-multiselectable in single mode', async () => {
    const el = await createPicker();
    expect(el.shadowRoot.querySelector('ul[role=listbox]').hasAttribute('aria-multiselectable')).to.be.false;
  });

  it('Enter toggles without closing', async () => {
    const el = await createPicker({ multiple: true, values: [] });
    el.show();
    await el.updateComplete;
    el._active = 'blue';
    el.handleKey('Enter');
    await el.updateComplete;
    expect(el.values).to.deep.equal(['blue']);
    expect(el.open).to.be.true;
  });

  it('activates the first selected item on open', async () => {
    const el = await createPicker({ multiple: true, values: ['plain', 'blue'] });
    el._onPopoverToggle({ newState: 'open' });
    expect(el._active).to.equal('blue');
  });

  it('action items close and fire change with value only', async () => {
    const items = [...ITEMS, { value: 'clear', label: 'Clear all', action: true }];
    const el = await createPicker({ items, multiple: true, values: ['red'] });
    el.show();
    await el.updateComplete;
    const events = [];
    el.addEventListener('change', (e) => events.push(e.detail));
    item(el, 'clear').click();
    await el.updateComplete;
    expect(events).to.deep.equal([{ value: 'clear' }]);
    expect(el.values).to.deep.equal(['red']);
    expect(el.open).to.be.false;
  });

  it('single-select still closes and fires change', async () => {
    const el = await createPicker({ value: 'red' });
    el.show();
    await el.updateComplete;
    const events = [];
    el.addEventListener('change', (e) => events.push(e.detail));
    item(el, 'blue').click();
    await el.updateComplete;
    expect(el.value).to.equal('blue');
    expect(events).to.deep.equal([{ value: 'blue' }]);
    expect(el.open).to.be.false;
  });
});
