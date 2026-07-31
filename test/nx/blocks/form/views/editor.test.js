import { expect } from '@esm-bundle/chai';
import '../../../../../nx/blocks/form/views/editor.js';

const tick = () => new Promise((resolve) => { requestAnimationFrame(resolve); });

function objectRoot(children) {
  return { kind: 'object', pointer: '/data', label: 'Data', children };
}

async function mountEditor(root) {
  const el = document.createElement('nx-editor');
  el.editor = {};
  el.onSelect = () => {};
  el.state = { model: { root } };
  el.nav = {};
  document.body.append(el);
  await el.updateComplete;
  await tick();
  await el.updateComplete;
  return el;
}

describe('nx-editor primitive controls', () => {
  it('renders a textarea for a long-text string node', async () => {
    const root = objectRoot([
      { kind: 'string', pointer: '/data/body', label: 'Body', semanticType: 'long-text', value: 'hi' },
    ]);
    const el = await mountEditor(root);
    expect(el.shadowRoot.querySelector('form-textarea')).to.exist;
    expect(el.shadowRoot.querySelector('form-input')).to.equal(null);
  });

  it('renders a single-line input for a plain string node', async () => {
    const root = objectRoot([
      { kind: 'string', pointer: '/data/title', label: 'Title', value: 'x' },
    ]);
    const el = await mountEditor(root);
    expect(el.shadowRoot.querySelector('form-input')).to.exist;
    expect(el.shadowRoot.querySelector('form-textarea')).to.equal(null);
  });

  it('stretches a long-text item to fill an array row', async () => {
    const root = objectRoot([
      {
        kind: 'array',
        pointer: '/data/figures',
        label: 'Key Figures',
        itemLabel: 'Figure',
        items: [
          { kind: 'string', pointer: '/data/figures/0', label: 'Figure', semanticType: 'long-text', value: 'Alan Turing' },
        ],
      },
    ]);
    const el = await mountEditor(root);
    const textarea = el.shadowRoot.querySelector('.form-array-item-input-row > form-textarea');
    expect(textarea).to.exist;
    // flex:1 is what makes it take the row width beside the action menu.
    expect(getComputedStyle(textarea).flexGrow).to.equal('1');
  });
});
