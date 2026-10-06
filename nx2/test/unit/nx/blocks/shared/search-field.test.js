import { expect } from '@esm-bundle/chai';
import { setConfig } from '../../../../../scripts/nx.js';

await setConfig({ hostnames: [] });
await import('../../../../../blocks/shared/search/search.js');
await import('../../../../../blocks/shared/chat/prompts/prompts.js');

describe('nx-search', () => {
  let field;
  let input;

  beforeEach(async () => {
    field = document.createElement('nx-search');
    field.label = 'Search files';
    document.body.append(field);
    await field.updateComplete;
    input = field.shadowRoot.querySelector('input');
  });

  afterEach(() => field.remove());

  it('labels a native search input and updates programmatic values without events', async () => {
    expect(input.type).to.equal('search');
    expect(field.variant).to.be.undefined;
    expect(field.size).to.be.undefined;
    expect(field.hasAttribute('variant')).to.be.false;
    expect(field.hasAttribute('size')).to.be.false;
    expect(input.getAttribute('aria-label')).to.equal('Search files');
    let count = 0;
    field.addEventListener('input', () => { count += 1; });
    field.value = 'plan';
    await field.updateComplete;
    expect(input.value).to.equal('plan');
    expect(count).to.equal(0);
  });

  it('uses the field appearance only when explicitly requested', async () => {
    field.style.setProperty('--s2-gray-300', '#ccc');
    const container = field.shadowRoot.querySelector('.search-field');
    const icon = field.shadowRoot.querySelector('.search-icon');
    const smallWidth = icon.getBoundingClientRect().width;
    expect(getComputedStyle(container).borderTopWidth).to.equal('0px');
    expect(getComputedStyle(container).paddingLeft).to.equal('0px');
    field.variant = 'field';
    field.size = 'm';
    await field.updateComplete;
    expect(field.getAttribute('variant')).to.equal('field');
    expect(field.getAttribute('size')).to.equal('m');
    expect(getComputedStyle(container).borderTopWidth).to.equal('2px');
    expect(parseFloat(getComputedStyle(container).paddingLeft)).to.be.greaterThan(0);
    field.variant = undefined;
    field.size = undefined;
    await field.updateComplete;
    expect(field.hasAttribute('variant')).to.be.false;
    expect(field.hasAttribute('size')).to.be.false;
    expect(getComputedStyle(container).borderTopWidth).to.equal('0px');
    expect(getComputedStyle(container).paddingLeft).to.equal('0px');
    expect(icon.getBoundingClientRect().width).to.equal(smallWidth);
    field.remove();
    document.body.append(field);
    await field.updateComplete;
    expect(field.variant).to.be.undefined;
    expect(field.size).to.be.undefined;
  });

  it('supports sizes independently of appearance', async () => {
    const smallIcon = field.shadowRoot.querySelector('.search-icon');
    const smallWidth = smallIcon.getBoundingClientRect().width;
    for (const variant of [undefined, 'field']) {
      field.variant = variant;
      field.size = 'm';
      // eslint-disable-next-line no-await-in-loop
      await field.updateComplete;
      expect(field.getAttribute('variant')).to.equal(variant ?? null);
      expect(field.getAttribute('size')).to.equal('m');
      expect(smallIcon.getBoundingClientRect().width).to.be.greaterThan(smallWidth);
      expect(field.shadowRoot.querySelector('.search-field').getBoundingClientRect().height)
        .to.be.at.least(32);
    }
  });

  it('exposes typing once with a retargeted host and forwards committed changes', () => {
    const events = [];
    field.addEventListener('input', (event) => events.push(event));
    input.value = 'new plan';
    input.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
    expect(field.value).to.equal('new plan');
    expect(events.length).to.equal(1);
    expect(events[0].target).to.equal(field);
    let change;
    field.addEventListener('change', (event) => { change = event; });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(change.target).to.equal(field);
    expect(change.composed).to.be.true;
  });

  it('clears once with the button or Escape, restores focus, and ignores empty clears', async () => {
    let count = 0;
    field.addEventListener('input', () => { count += 1; });
    field.value = 'plan';
    await field.updateComplete;
    field.shadowRoot.querySelector('button').click();
    expect(field.value).to.equal('');
    expect(input.value).to.equal('');
    expect(field.shadowRoot.activeElement).to.equal(input);
    expect(count).to.equal(1);
    field.clear();
    expect(count).to.equal(1);
    field.value = 'other';
    await field.updateComplete;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(field.value).to.equal('');
    expect(count).to.equal(2);
  });

  it('submits raw values on Enter without form navigation or IME submission', async () => {
    field.value = ' plan ';
    await field.updateComplete;
    const events = [];
    field.addEventListener('search-submit', (event) => events.push(event));
    const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    input.dispatchEvent(enter);
    expect(enter.defaultPrevented).to.be.true;
    expect(events[0].detail).to.deep.equal({ value: ' plan ' });
    expect(events[0].bubbles && events[0].composed).to.be.true;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true }));
    expect(events.length).to.equal(1);
  });

  it('disables the input and clear control', async () => {
    field.value = 'plan';
    field.disabled = true;
    await field.updateComplete;
    expect(input.disabled).to.be.true;
    expect(field.shadowRoot.querySelector('button').disabled).to.be.true;
    field.clear();
    expect(field.value).to.equal('plan');
  });
});

describe('prompts search integration', () => {
  it('filters and restores prompts through shared input and clear events', async () => {
    const prompts = document.createElement('nx-prompts');
    prompts.prompts = [
      { title: 'First plan', prompt: 'First' },
      { title: 'Second idea', prompt: 'Second' },
    ];
    document.body.append(prompts);
    try {
      await prompts.updateComplete;
      const field = prompts.shadowRoot.querySelector('nx-search');
      await field.updateComplete;
      const input = field.shadowRoot.querySelector('input');
      input.value = 'plan';
      input.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
      await prompts.updateComplete;
      expect(prompts.shadowRoot.querySelectorAll('.prompt-item').length).to.equal(1);
      field.clear();
      await prompts.updateComplete;
      expect(prompts.shadowRoot.querySelectorAll('.prompt-item').length).to.equal(2);
      prompts.focus();
      expect(field.shadowRoot.activeElement).to.equal(input);
    } finally {
      prompts.remove();
    }
  });
});
