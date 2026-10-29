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

  it('owns description layout without exposing menu layout parts', async () => {
    const el = await createPicker({
      items: [{ section: 'Status' }, { value: 'draft', label: 'Draft', description: 'Not published' }, { divider: true }],
      value: 'draft',
    });
    expect(el.shadowRoot.querySelector('.picker-item-description').textContent).to.equal('Not published');
    expect(el.shadowRoot.querySelector('[role="option"]').getAttribute('aria-label')).to.equal('Draft, Not published');
    ['menu', 'section', 'divider', 'item-label', 'check'].forEach((part) => {
      expect(el.shadowRoot.querySelector(`[part="${part}"]`), part).to.be.null;
    });
    expect(el.shadowRoot.querySelector('.picker-trigger-label').textContent).to.equal('Draft');
  });

  it('uses matching component typography for all picker text when switching between S and M', async () => {
    const el = await createPicker({
      items: [
        { section: 'Status' },
        { value: 'draft', label: 'Draft', description: 'Not published' },
        { value: 'add', label: 'Add...', action: true },
      ],
      value: 'draft',
    });
    el.style.setProperty('--s2-component-s-regular-font-size', '12px');
    el.style.setProperty('--s2-component-s-regular-line-height', '18px');
    el.style.setProperty('--s2-component-s-regular-font-weight', '300');
    el.style.setProperty('--s2-component-s-bold-font-size', '13px');
    el.style.setProperty('--s2-component-s-bold-line-height', '20px');
    el.style.setProperty('--s2-component-s-bold-font-weight', '600');
    el.style.setProperty('--s2-component-m-regular-font-size', '16px');
    el.style.setProperty('--s2-component-m-regular-line-height', '24px');
    el.style.setProperty('--s2-component-m-regular-font-weight', '450');
    el.style.setProperty('--s2-component-m-bold-font-size', '17px');
    el.style.setProperty('--s2-component-m-bold-line-height', '26px');
    el.style.setProperty('--s2-component-m-bold-font-weight', '750');
    for (const size of ['s', 'm', 's']) {
      el.size = size;
      await el.updateComplete;
      const regular = [
        '.picker-trigger-label',
        '[data-value="draft"] .picker-item-label',
        '.picker-item-description',
        '[data-value="add"] .picker-item-label',
      ];
      for (const selector of [...regular, '.picker-section']) {
        const weight = selector === '.picker-section' ? 'bold' : 'regular';
        const style = getComputedStyle(el.shadowRoot.querySelector(selector));
        for (const property of ['font-size', 'line-height', 'font-weight']) {
          expect(style.getPropertyValue(property), `${size} ${selector} ${property}`)
            .to.equal(el.style.getPropertyValue(`--s2-component-${size}-${weight}-${property}`));
        }
      }
      const description = el.shadowRoot.querySelector('.picker-item-description');
      expect(description.textContent).to.equal('Not published');
      expect(el.shadowRoot.querySelector('[role="option"]').getAttribute('aria-label'))
        .to.equal('Draft, Not published');
    }
  });

  it('inherits description size and line height from its item in S and M', async () => {
    const el = await createPicker({
      items: [{ value: 'draft', label: 'Draft', description: 'Not published' }],
    });
    el.shadowRoot.querySelector('[role="option"]').style.cssText = 'font-size: 21px; line-height: 29px; font-weight: 500;';
    for (const size of ['s', 'm']) {
      el.size = size;
      el.style.setProperty(`--s2-component-${size}-regular-font-size`, '12px');
      el.style.setProperty(`--s2-component-${size}-regular-line-height`, '18px');
      el.style.setProperty(`--s2-component-${size}-regular-font-weight`, '350');
      await el.updateComplete;
      const style = getComputedStyle(el.shadowRoot.querySelector('.picker-item-description'));
      expect(style.fontSize, `${size} inherited font size`).to.equal('21px');
      expect(style.lineHeight, `${size} inherited line height`).to.equal('29px');
      expect(style.fontWeight, `${size} regular description weight`).to.equal('350');
    }
  });

  it('preserves explicit accessible names and does not treat an action as a selection', async () => {
    const el = await createPicker({
      items: [
        { value: 'draft', label: 'Draft', description: 'Not published', ariaLabel: 'Current draft' },
        { value: 'add', label: 'Add...', action: true },
      ],
      value: 'draft',
    });
    expect(el.shadowRoot.querySelector('[data-value="draft"]').getAttribute('aria-label')).to.equal('Current draft');
    const action = el.shadowRoot.querySelector('[data-value="add"]');
    expect(action.hasAttribute('part')).to.be.false;
    const changes = [];
    el.addEventListener('change', ({ detail }) => changes.push(detail.value));
    action.click();
    expect(changes).to.deep.equal(['add']);
    expect(el.value).to.equal('draft');
  });

  it('keeps end checks by default and reserves leading space only for selectable start-check rows', async () => {
    const el = await createPicker({
      items: [...ITEMS, { value: 'add', label: 'Add...', action: true }],
      value: 'red',
    });
    const row = () => el.shadowRoot.querySelector('[data-value="red"]');
    expect(row().lastElementChild.classList.contains('picker-check')).to.be.true;
    el.checkPosition = 'start';
    await el.updateComplete;
    expect(row().firstElementChild.classList.contains('picker-check-slot')).to.be.true;
    expect(row().querySelectorAll('.picker-check')).to.have.length(1);
    expect(el.shadowRoot.querySelector('[data-value="plain"] .picker-check-slot')).to.exist;
    expect(el.shadowRoot.querySelector('[data-value="add"] .picker-check-slot')).to.be.null;
    el.multiple = true;
    el.values = ['red', 'blue'];
    await el.updateComplete;
    expect(el.shadowRoot.querySelectorAll('.picker-check-slot .picker-check')).to.have.length(2);
  });

  it('accepts one menu-width property without changing field-width defaults', async () => {
    const el = await createPicker();
    el.style.setProperty('--nx-picker-menu-width', '280px');
    el.show();
    expect(el.shadowRoot.querySelector('nx-popover').style.width).to.equal('280px');
    el.close();
    el.style.removeProperty('--nx-picker-menu-width');
    el.variant = 'field';
    await el.updateComplete;
    el.show();
    expect(el.shadowRoot.querySelector('nx-popover').style.width)
      .to.equal(`${el.shadowRoot.querySelector('.picker-trigger').getBoundingClientRect().width}px`);
    el.focus();
    expect(el.shadowRoot.activeElement).to.equal(el.shadowRoot.querySelector('.picker-trigger'));
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
