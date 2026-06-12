import { expect } from '@esm-bundle/chai';
import '../../../../../nx2/blocks/form/fields/input.js';
import '../../../../../nx2/blocks/form/fields/picker.js';
import '../../../../../nx2/blocks/form/fields/checkbox.js';
import '../../../../../nx2/blocks/form/fields/button.js';
import '../../../../../nx2/blocks/form/fields/number.js';

const tick = () => new Promise((resolve) => { requestAnimationFrame(resolve); });

async function mount(html) {
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  const el = wrap.firstElementChild;
  document.body.append(el);
  await el.updateComplete;
  // Let any post-render slotchange (sl-picker moves <option>s) settle.
  await tick();
  await el.updateComplete;
  return el;
}

describe('sl-input', () => {
  it('reflects value onto the inner input', async () => {
    const el = await mount('<sl-input></sl-input>');
    el.value = 'hello';
    await el.updateComplete;
    const input = el.shadowRoot.querySelector('input');
    expect(input.value).to.equal('hello');
  });

  it('fires an input event and updates value on user input', async () => {
    const el = await mount('<sl-input></sl-input>');
    let fired;
    el.addEventListener('input', (e) => { fired = e.target.value; });
    const input = el.shadowRoot.querySelector('input');
    input.value = 'typed';
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    expect(el.value).to.equal('typed');
    expect(fired).to.equal('typed');
  });

  it('renders the label and error message', async () => {
    const el = await mount('<sl-input></sl-input>');
    el.label = 'Title';
    el.error = 'Required';
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('label').textContent).to.equal('Title');
    expect(el.shadowRoot.querySelector('.sl-field-error').textContent).to.equal('Required');
    expect(el.shadowRoot.querySelector('.sl-field').classList.contains('has-error')).to.be.true;
  });

  it('honors disabled', async () => {
    const el = await mount('<sl-input disabled></sl-input>');
    expect(el.shadowRoot.querySelector('input').disabled).to.be.true;
  });

  it('honors the type attribute', async () => {
    const el = await mount('<sl-input type="number"></sl-input>');
    expect(el.shadowRoot.querySelector('input').type).to.equal('number');
  });
});

describe('sl-number-field', () => {
  it('reflects value onto the inner input', async () => {
    const el = await mount('<sl-number-field></sl-number-field>');
    el.value = '5';
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('input').value).to.equal('5');
  });

  it('fires an input event and updates value on user input', async () => {
    const el = await mount('<sl-number-field></sl-number-field>');
    let fired;
    el.addEventListener('input', (e) => { fired = e.target.value; });
    const input = el.shadowRoot.querySelector('input');
    input.value = '42';
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    expect(el.value).to.equal('42');
    expect(fired).to.equal('42');
  });

  it('renders stacked stepper buttons', async () => {
    const el = await mount('<sl-number-field></sl-number-field>');
    const steps = el.shadowRoot.querySelectorAll('.sl-number-step');
    expect(steps.length).to.equal(2);
  });

  it('increments by step on the up button and fires input', async () => {
    const el = await mount('<sl-number-field></sl-number-field>');
    el.value = '3';
    await el.updateComplete;
    let fired;
    el.addEventListener('input', (e) => { fired = e.target.value; });
    el.shadowRoot.querySelector('.sl-number-step-up')
      .dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
    expect(el.value).to.equal('4');
    expect(fired).to.equal('4');
  });

  it('decrements on the down button', async () => {
    const el = await mount('<sl-number-field></sl-number-field>');
    el.value = '3';
    await el.updateComplete;
    el.shadowRoot.querySelector('.sl-number-step-down')
      .dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
    expect(el.value).to.equal('2');
  });

  it('clamps to max and disables the up button at the limit', async () => {
    const el = await mount('<sl-number-field></sl-number-field>');
    el.max = 5;
    el.value = '5';
    await el.updateComplete;
    const up = el.shadowRoot.querySelector('.sl-number-step-up');
    expect(up.disabled).to.be.true;
    up.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
    expect(el.value).to.equal('5');
  });

  it('clamps to min and disables the down button at the limit', async () => {
    const el = await mount('<sl-number-field></sl-number-field>');
    el.min = 0;
    el.value = '0';
    await el.updateComplete;
    const down = el.shadowRoot.querySelector('.sl-number-step-down');
    expect(down.disabled).to.be.true;
    down.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
    expect(el.value).to.equal('0');
  });

  it('steps with the arrow keys', async () => {
    const el = await mount('<sl-number-field></sl-number-field>');
    el.value = '7';
    await el.updateComplete;
    const input = el.shadowRoot.querySelector('input');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(el.value).to.equal('8');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(el.value).to.equal('7');
  });

  it('honors disabled', async () => {
    const el = await mount('<sl-number-field disabled></sl-number-field>');
    expect(el.shadowRoot.querySelector('input').disabled).to.be.true;
  });
});

describe('sl-picker', () => {
  it('defaults value to the first option', async () => {
    const el = await mount('<sl-picker><option value="a">A</option><option value="b">B</option></sl-picker>');
    await el.updateComplete;
    expect(el.value).to.equal('a');
    expect(el.shadowRoot.querySelector('select').value).to.equal('a');
  });

  it('updates value and fires change on selection', async () => {
    const el = await mount('<sl-picker><option value="a">A</option><option value="b">B</option></sl-picker>');
    await el.updateComplete;
    let fired;
    el.addEventListener('change', (e) => { fired = e.target.value; });
    const select = el.shadowRoot.querySelector('select');
    select.value = 'b';
    select.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    expect(el.value).to.equal('b');
    expect(fired).to.equal('b');
  });

  it('renders a placeholder option selected when empty', async () => {
    const el = await mount('<sl-picker placeholder="Pick one"><option value="a">A</option></sl-picker>');
    await el.updateComplete;
    const first = el.shadowRoot.querySelector('select option');
    expect(first.textContent).to.equal('Pick one');
    expect(first.disabled).to.be.true;
    expect(el.value).to.equal('');
  });

  it('honors disabled', async () => {
    const el = await mount('<sl-picker disabled><option value="a">A</option></sl-picker>');
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('select').disabled).to.be.true;
  });
});

describe('sl-checkbox', () => {
  it('toggles checked and fires change', async () => {
    const el = await mount('<sl-checkbox>Enabled</sl-checkbox>');
    let fired = 0;
    el.addEventListener('change', () => { fired += 1; });
    const input = el.shadowRoot.querySelector('input');
    input.checked = true;
    input.dispatchEvent(new Event('change'));
    expect(el.checked).to.be.true;
    expect(fired).to.equal(1);
  });

  it('renders the default-slot label', async () => {
    const el = await mount('<sl-checkbox>My label</sl-checkbox>');
    expect(el.textContent.trim()).to.equal('My label');
    expect(el.shadowRoot.querySelector('slot')).to.exist;
  });

  it('reflects the checked property to the input', async () => {
    const el = await mount('<sl-checkbox checked>On</sl-checkbox>');
    expect(el.shadowRoot.querySelector('input').checked).to.be.true;
  });

  it('honors disabled', async () => {
    const el = await mount('<sl-checkbox disabled>Off</sl-checkbox>');
    expect(el.shadowRoot.querySelector('input').disabled).to.be.true;
  });
});

describe('sl-button', () => {
  it('renders the slotted label', async () => {
    const el = await mount('<sl-button>Create</sl-button>');
    expect(el.textContent.trim()).to.equal('Create');
    expect(el.shadowRoot.querySelector('button')).to.exist;
  });

  it('passes the click through to host listeners', async () => {
    const el = await mount('<sl-button>Create</sl-button>');
    let clicks = 0;
    el.addEventListener('click', () => { clicks += 1; });
    el.shadowRoot.querySelector('button').click();
    expect(clicks).to.equal(1);
  });

  it('blocks click when disabled', async () => {
    const el = await mount('<sl-button disabled>Create</sl-button>');
    let clicks = 0;
    el.addEventListener('click', () => { clicks += 1; });
    el.shadowRoot.querySelector('button').click();
    expect(clicks).to.equal(0);
  });

  it('reflects the variant so variant styling can target it', async () => {
    const el = await mount('<sl-button>Create</sl-button>');
    el.variant = 'accent';
    await el.updateComplete;
    expect(el.getAttribute('variant')).to.equal('accent');
  });
});
