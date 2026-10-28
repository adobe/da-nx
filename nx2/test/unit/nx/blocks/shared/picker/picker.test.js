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

  it('inherits description size and line height from consumer-styled items in S and M', async () => {
    const el = await createPicker({
      items: [{ value: 'draft', label: 'Draft', description: 'Not published' }],
    });
    const override = document.createElement('style');
    override.textContent = 'nx-picker::part(item) { font-size: 21px; line-height: 29px; font-weight: 500; }';
    document.head.append(override);
    try {
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
    } finally {
      override.remove();
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
    expect(action.part.contains('item')).to.be.true;
    expect(action.part.contains('action')).to.be.true;
    expect(el.shadowRoot.querySelector('[data-value="draft"]').part.contains('action')).to.be.false;
    const changes = [];
    el.addEventListener('change', ({ detail }) => changes.push(detail.value));
    action.click();
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
