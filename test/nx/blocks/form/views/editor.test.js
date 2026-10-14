import { expect } from '@esm-bundle/chai';
import '../../../../../nx/blocks/form/views/editor.js';
import FormRichtext from '../../../../../nx/blocks/form/fields/richtext.js';
import * as pm from '../fields/mocks/pm.js';

FormRichtext.loadProseMirror = () => Promise.resolve(pm);

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

  it('renders a rich-text editor for a rich-text string node', async () => {
    const root = objectRoot([
      { kind: 'string', pointer: '/data/body', label: 'Body', semanticType: 'rich-text', value: '<p>hi</p>' },
    ]);
    const el = await mountEditor(root);
    const field = el.shadowRoot.querySelector('[data-pointer="/data/body"]');
    expect(field.tagName).to.equal('FORM-RICHTEXT');
    expect(field.value).to.equal('<p>hi</p>');
    expect(el.shadowRoot.querySelector('form-textarea')).to.equal(null);
  });

  it('commits a rich-text value immediately on change', async () => {
    const root = objectRoot([
      { kind: 'string', pointer: '/data/body', label: 'Body', semanticType: 'rich-text', value: '<p>hi</p>' },
    ]);
    const el = await mountEditor(root);
    const calls = [];
    el.editor = { setField: (pointer, value) => calls.push([pointer, value]) };
    const field = el.shadowRoot.querySelector('form-richtext');
    field.value = '<p>bye</p>';
    field.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    expect(el._inputTimers.has('/data/body')).to.equal(true);
    field.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    expect(el._inputTimers.has('/data/body')).to.equal(false);
    expect(calls).to.deep.equal([['/data/body', '<p>bye</p>']]);
  });

  it('clears an emptied rich-text value on change', async () => {
    const root = objectRoot([
      { kind: 'string', pointer: '/data/body', label: 'Body', semanticType: 'rich-text', value: '<p>hi</p>' },
    ]);
    const el = await mountEditor(root);
    const calls = [];
    el.editor = { setField: (pointer, value) => calls.push([pointer, value]) };
    const field = el.shadowRoot.querySelector('form-richtext');
    field.value = '';
    field.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    expect(calls).to.deep.equal([['/data/body', undefined]]);
  });

  it('stretches a rich-text item to fill an array row', async () => {
    const root = objectRoot([
      {
        kind: 'array',
        pointer: '/data/notes',
        label: 'Notes',
        itemLabel: 'Note',
        items: [
          { kind: 'string', pointer: '/data/notes/0', label: 'Note', semanticType: 'rich-text', value: '<p>a</p>' },
        ],
      },
    ]);
    const el = await mountEditor(root);
    const field = el.shadowRoot.querySelector('.form-array-item-input-row > form-richtext');
    expect(field).to.exist;
    expect(getComputedStyle(field).flexGrow).to.equal('1');
  });

  it('renders a single-line input for a plain string node', async () => {
    const root = objectRoot([
      { kind: 'string', pointer: '/data/title', label: 'Title', value: 'x' },
    ]);
    const el = await mountEditor(root);
    expect(el.shadowRoot.querySelector('form-input')).to.exist;
    expect(el.shadowRoot.querySelector('form-textarea')).to.equal(null);
  });

  it('renders a date widget for a string node with format date', async () => {
    const root = objectRoot([
      { kind: 'string', pointer: '/data/when', label: 'When', format: 'date', value: '2026-08-14' },
    ]);
    const el = await mountEditor(root);
    const field = el.shadowRoot.querySelector('[data-pointer="/data/when"]');
    expect(field.tagName).to.equal('FORM-DATE');
    expect(el.shadowRoot.querySelector('form-input')).to.equal(null);
    expect(field.value).to.equal('2026-08-14');
  });

  it('renders a time widget for a string node with format time', async () => {
    const root = objectRoot([
      { kind: 'string', pointer: '/data/opens', label: 'Opens', format: 'time', value: '09:00' },
    ]);
    const el = await mountEditor(root);
    const field = el.shadowRoot.querySelector('[data-pointer="/data/opens"]');
    expect(field.tagName).to.equal('FORM-DATE');
    expect(field.type).to.equal('time');
    expect(field.value).to.equal('09:00');
  });

  it('renders a datetime widget for a string node with format date-time', async () => {
    const iso = '2026-08-14T09:30:00.000Z';
    const root = objectRoot([
      { kind: 'string', pointer: '/data/start', label: 'Start', format: 'date-time', value: iso },
    ]);
    const el = await mountEditor(root);
    const field = el.shadowRoot.querySelector('[data-pointer="/data/start"]');
    expect(field.tagName).to.equal('FORM-DATE');
    expect(field.type).to.equal('datetime');
    expect(field.value).to.equal(iso);
  });

  it('surfaces the SDK format error on the date widget', async () => {
    const root = objectRoot([
      { kind: 'string', pointer: '/data/when', label: 'When', format: 'date' },
    ]);
    const el = document.createElement('nx-editor');
    el.editor = {};
    el.onSelect = () => {};
    el.nav = {};
    el.state = {
      model: { root },
      validation: { errors: { '/data/when': { message: 'Must be a valid date (YYYY-MM-DD).' } } },
    };
    document.body.append(el);
    await el.updateComplete;
    const field = el.shadowRoot.querySelector('[data-pointer="/data/when"]');
    expect(field.error).to.equal('Must be a valid date (YYYY-MM-DD).');
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
