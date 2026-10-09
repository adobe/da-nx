import { expect } from '@esm-bundle/chai';
import '../../../../../nx/blocks/form/views/editor.js';

const tick = () => new Promise((resolve) => { requestAnimationFrame(resolve); });

const mediaNode = (extra = {}) => ({
  kind: 'string',
  pointer: '/data/heroImage',
  label: 'Hero image',
  semanticType: 'media',
  ...extra,
});

function objectRoot(children) {
  return { kind: 'object', pointer: '/data', label: 'Data', children };
}

async function mountEditor(root) {
  const el = document.createElement('nx-editor');
  el.editor = {};
  el.onSelect = () => {};
  el.assetSources = [];
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

  it('renders a file field for a string node annotated as media', async () => {
    const root = objectRoot([
      mediaNode({ value: './media_example.png' }),
    ]);
    const el = await mountEditor(root);
    const field = el.shadowRoot.querySelector('form-asset');
    expect(field).to.exist;
    expect(field.value).to.equal('./media_example.png');
    expect(el.shadowRoot.querySelector('form-input')).to.equal(null);
  });

  it('passes the preview origin to the file field while keeping the stored value', async () => {
    const root = objectRoot([
      mediaNode({ value: './media_example.png' }),
    ]);
    const el = await mountEditor(root);
    el.previewOrigin = 'https://main--site--example.preview.da.live';
    await el.updateComplete;
    const field = el.shadowRoot.querySelector('form-asset');
    expect(field.value).to.equal('./media_example.png');
    expect(field.previewOrigin).to.equal('https://main--site--example.preview.da.live');
  });

  it('previews a newly selected Media Bus image once the model stores it', async () => {
    const previewOrigin = 'https://main--site--example.preview.da.live';
    const imageNode = mediaNode();
    const el = await mountEditor(objectRoot([imageNode]));
    el.editor = {
      setField: (pointer, value) => {
        el.state = { model: { root: objectRoot([{ ...imageNode, value }]) } };
      },
    };
    el.previewOrigin = previewOrigin;
    el.assetSources = [{
      id: 'test-source',
      label: 'Test source',
      select: async () => ({ href: './media_new.png', name: 'new.png', type: 'image/png' }),
    }];
    await el.updateComplete;
    const field = el.shadowRoot.querySelector('form-asset');
    field.shadowRoot.querySelector('.asset-source-trigger').click();
    await new Promise((done) => { setTimeout(done, 0); });
    await el.updateComplete;
    await field.updateComplete;
    expect(field.value).to.equal('./media_new.png');
    expect(field.shadowRoot.querySelector('.asset-preview img').getAttribute('src'))
      .to.equal(`${previewOrigin}/media_new.png`);
  });

  it('still renders the file field while sources load', async () => {
    const root = objectRoot([mediaNode()]);
    const el = await mountEditor(root);
    el.assetSources = undefined;
    await el.updateComplete;
    const field = el.shadowRoot.querySelector('form-asset');
    expect(field).to.exist;
    expect(el.shadowRoot.querySelector('form-input')).to.equal(null);
    await field.updateComplete;
    expect(field.shadowRoot.querySelector('.asset-source-trigger').disabled).to.be.true;
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
