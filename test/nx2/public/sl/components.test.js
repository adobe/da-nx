import { expect } from '@esm-bundle/chai';
import '../../../../nx2/public/sl/components.js';

const mount = async (attrs = '') => {
  document.body.innerHTML = `<sl-input ${attrs}></sl-input>`;
  const el = document.querySelector('sl-input');
  await el.updateComplete;
  return el;
};

describe('sl-input', () => {
  it('defaults to type="text"', async () => {
    const el = await mount();
    expect(el.shadowRoot.querySelector('input').getAttribute('type')).to.equal('text');
  });

  it('keeps an explicit type', async () => {
    const el = await mount('type="number"');
    expect(el.shadowRoot.querySelector('input').getAttribute('type')).to.equal('number');
  });

  it('selects the inner input text', async () => {
    const el = await mount('value="hello"');
    el.select();
    const input = el.shadowRoot.querySelector('input');
    expect(input.selectionStart).to.equal(0);
    expect(input.selectionEnd).to.equal(5);
  });
});
