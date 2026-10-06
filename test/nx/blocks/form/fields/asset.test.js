import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../../../../nx/blocks/form/fields/asset.js';

const CANCELLED = { cancelled: true };
const mounted = [];

afterEach(() => {
  sinon.restore();
  while (mounted.length) mounted.pop().remove();
});

const source = ({
  id, label = id, select = async () => CANCELLED, accepts = () => true, localFileTypes,
}) => ({
  id, label, select, accepts, localFileTypes,
});

const upload = (overrides = {}) => source({
  id: 'upload', label: 'Upload', localFileTypes: () => ['image/png', 'application/pdf'], ...overrides,
});
const aem = (overrides = {}) => source({ id: 'aem-assets', label: 'AEM Assets', ...overrides });

async function mount(options = {}) {
  const field = document.createElement('form-asset');
  Object.assign(field, { label: 'Hero image', sources: [upload(), aem()], ...options });
  document.body.append(field);
  mounted.push(field);
  await field.updateComplete;
  return field;
}

const settle = async (field) => {
  await new Promise((done) => { setTimeout(done, 0); });
  await field.updateComplete;
};

const query = (field, selector) => field.shadowRoot.querySelector(selector);
const button = (field, text) => [...field.shadowRoot.querySelectorAll('button')]
  .find((element) => element.textContent.trim() === text);
const menu = (field) => query(field, 'nx-menu');
const box = (field) => query(field, '.asset');
const heightOf = (element) => element.getBoundingClientRect().height;
const message = (field) => query(field, '.form-field-error, .form-field-description');

function recordChanges(field) {
  const values = [];
  field.addEventListener('change', (event) => values.push(event.target.value));
  return values;
}

async function pick(field, id) {
  menu(field).dispatchEvent(new CustomEvent('select', { detail: { id } }));
  await field.updateComplete;
}

function answerFilePicker(field, file) {
  const input = query(field, '.file-input');
  sinon.stub(input, 'click').callsFake(() => {
    if (!file) {
      input.dispatchEvent(new Event('cancel'));
      return;
    }
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change'));
  });
  return input;
}

describe('form-asset', () => {
  it('shows the label, required marker and an empty row', async () => {
    const field = await mount({ required: true, contentMediaType: 'image/*' });
    expect(query(field, 'label').textContent).to.include('Hero image');
    expect(query(field, '.form-required')).to.exist;
    expect(query(field, '.asset-placeholder').textContent).to.equal('No image selected');
    expect(query(field, 'nx-dialog')).to.equal(null);
  });

  it('calls the field a file unless it only accepts images', async () => {
    const field = await mount();
    expect(query(field, '.asset-placeholder').textContent).to.equal('No file selected');
  });

  it('offers every available source in a menu anchored to the trigger end', async () => {
    const field = await mount();
    expect(menu(field).items).to.deep.equal([
      { id: 'upload', label: 'Upload' },
      { id: 'aem-assets', label: 'AEM Assets' },
    ]);
    expect(menu(field).getAttribute('placement')).to.equal('below-end');
  });

  it('opens the only source that accepts the field directly', async () => {
    const select = sinon.fake.resolves(CANCELLED);
    const field = await mount({
      contentMediaType: 'audio/*',
      sources: [upload({ accepts: () => false }), aem({ select })],
    });
    expect(menu(field)).to.equal(null);
    button(field, 'Select').click();
    await settle(field);
    expect(select.calledOnceWith({ contentMediaType: 'audio/*' })).to.be.true;
  });

  it('waits for sources to load without explaining anything yet', async () => {
    const field = await mount({ sources: undefined });
    expect(button(field, 'Select').disabled).to.be.true;
    expect(message(field)).to.equal(null);
  });

  it('disables Select and explains why when no source accepts the field', async () => {
    const field = await mount({ sources: [upload({ accepts: () => false })] });
    expect(button(field, 'Select').disabled).to.be.true;
    expect(message(field).textContent).to.equal('No source is available for this field.');
  });

  it('keeps an image field and its preview area the same size when empty or selected', async () => {
    const field = await mount({ contentMediaType: 'image/*' });
    const emptyBox = heightOf(box(field));
    const emptyPreview = heightOf(query(field, '.asset-preview'));
    field.value = './media_abc.png';
    await field.updateComplete;
    expect(emptyBox).to.be.greaterThan(200);
    expect(heightOf(box(field))).to.equal(emptyBox);
    expect(heightOf(query(field, '.asset-preview'))).to.equal(emptyPreview);
  });

  it('uses one compact row for fields that are not image-only, even for image values', async () => {
    const types = [undefined, '*/*', 'application/pdf', 'video/mp4'];
    const fields = await Promise.all(types.map((contentMediaType) => mount({ contentMediaType })));
    const emptyHeights = fields.map((field) => heightOf(box(field)));
    fields.forEach((field) => { field.value = './media_abc.png'; });
    await Promise.all(fields.map((field) => field.updateComplete));
    fields.forEach((field, index) => {
      expect(emptyHeights[index]).to.be.within(40, 80);
      expect(heightOf(box(field))).to.equal(emptyHeights[index]);
      expect(query(field, '.asset-preview')).to.equal(null);
    });
  });

  it('shows the stored file name with Replace and Remove', async () => {
    const field = await mount({ value: 'https://x.test/files/data%20sheet.pdf' });
    expect(query(field, '.asset-name').textContent).to.equal('data sheet.pdf');
    expect(query(field, '.asset-name').title).to.equal('data sheet.pdf');
    expect(menu(field).querySelector('[slot="trigger"]').textContent.trim()).to.equal('Replace');
    expect(button(field, 'Remove')).to.exist;
  });

  it('flags a stored value whose type the field does not accept and previews nothing', async () => {
    const field = await mount({ contentMediaType: 'image/*', value: 'https://x.test/spec.pdf' });
    expect(query(field, '.form-field').classList.contains('has-error')).to.be.true;
    expect(message(field).textContent).to.equal('This file type is not allowed here.');
    expect(query(field, '.asset-preview img')).to.equal(null);
  });

  it('previews an image only after it has loaded', async () => {
    const href = `${window.location.origin}/img/favicons/favicon-180.png`;
    const field = await mount({ contentMediaType: 'image/*', value: href });
    const img = query(field, '.asset-preview img');
    expect(img.getAttribute('src')).to.equal(href);
    expect(img.classList.contains('is-loaded')).to.be.false;
    await new Promise((resolve) => { img.addEventListener('load', resolve, { once: true }); });
    await field.updateComplete;
    expect(img.classList.contains('is-loaded')).to.be.true;
  });

  it('resolves Media Bus previews against the preview origin once it is known', async () => {
    const field = await mount({ contentMediaType: 'image/*', value: './media_a.png' });
    expect(query(field, '.asset-preview img')).to.equal(null);
    field.previewOrigin = 'https://main--site--example.preview.da.live';
    await field.updateComplete;
    expect(query(field, '.asset-preview img').getAttribute('src'))
      .to.equal('https://main--site--example.preview.da.live/media_a.png');
  });

  it('uploads the picked file and announces the new value with a change event', async () => {
    const pdf = new File(['%PDF'], 'spec.pdf', { type: 'application/pdf' });
    const select = sinon.fake.resolves({ href: 'https://x.test/spec.pdf', name: 'spec.pdf', type: 'application/pdf' });
    const field = await mount({ contentMediaType: 'application/pdf', sources: [upload({ select })] });
    const input = answerFilePicker(field, pdf);
    const changes = recordChanges(field);

    button(field, 'Select').click();
    await settle(field);

    expect(input.accept).to.equal('image/png,application/pdf');
    expect(select.calledOnceWith({ contentMediaType: 'application/pdf', file: pdf })).to.be.true;
    expect(changes).to.deep.equal(['https://x.test/spec.pdf']);
    expect(query(field, '.asset-name').textContent).to.equal('spec.pdf');
  });

  it('does nothing when the file picker is cancelled', async () => {
    const select = sinon.fake.resolves(CANCELLED);
    const field = await mount({ sources: [upload({ select })] });
    answerFilePicker(field, undefined);
    const changes = recordChanges(field);
    button(field, 'Select').click();
    await settle(field);
    expect(select.called).to.be.false;
    expect(changes).to.deep.equal([]);
    expect(query(field, '[role="alert"]')).to.equal(null);
  });

  it('commits only a finished result and shows progress meanwhile', async () => {
    let resolve;
    const field = await mount({
      value: './media_old.png',
      sources: [upload(), aem({ select: () => new Promise((done) => { resolve = done; }) })],
    });
    const changes = recordChanges(field);
    await pick(field, 'aem-assets');
    expect(field.value).to.equal('./media_old.png');
    expect(query(field, '.nx-loading-spinner[role="status"]')).to.exist;
    expect(button(field, 'Remove')).to.equal(undefined);

    resolve({ href: 'https://x.test/new.pdf', name: 'new.pdf', type: 'application/pdf' });
    await settle(field);
    expect(changes).to.deep.equal(['https://x.test/new.pdf']);
    expect(query(field, '.nx-loading-spinner')).to.equal(null);
  });

  it('keeps the old value when a source cancels, reports an error or throws', async () => {
    const outcomes = [CANCELLED, { error: 'Asset unavailable' }, new Error('Network down')];
    const field = await mount({ value: 'https://x.test/old.png' });
    const changes = recordChanges(field);
    const messages = [];
    // eslint-disable-next-line no-restricted-syntax
    for (const outcome of outcomes) {
      field.sources = [upload(), aem({
        select: async () => {
          if (outcome instanceof Error) throw outcome;
          return outcome;
        },
      })];
      // eslint-disable-next-line no-await-in-loop
      await field.updateComplete;
      // eslint-disable-next-line no-await-in-loop
      await pick(field, 'aem-assets');
      // eslint-disable-next-line no-await-in-loop
      await settle(field);
      messages.push(query(field, '[role="alert"]')?.textContent);
    }
    expect(messages).to.deep.equal([undefined, 'Asset unavailable', 'Network down']);
    expect(changes).to.deep.equal([]);
    expect(field.value).to.equal('https://x.test/old.png');
  });

  it('rejects a result without a usable URL', async () => {
    const field = await mount({ sources: [aem({ select: async () => ({ href: 'data:text/html,hi' }) })] });
    button(field, 'Select').click();
    await settle(field);
    expect(query(field, '[role="alert"]').textContent).to.equal('The selected file did not return a usable URL.');
    expect(field.value).to.equal(undefined);
  });

  it('forgets an in-flight selection and its details when the value changes from outside', async () => {
    let resolve;
    const field = await mount({
      sources: [aem({ select: () => new Promise((done) => { resolve = done; }) })],
    });
    const changes = recordChanges(field);
    button(field, 'Select').click();
    await field.updateComplete;

    field.value = 'https://x.test/moved-item.pdf';
    await field.updateComplete;
    resolve({ href: 'https://x.test/late.png', name: 'late.png', type: 'image/png' });
    await settle(field);

    expect(changes).to.deep.equal([]);
    expect(field.value).to.equal('https://x.test/moved-item.pdf');
    expect(query(field, '.asset-name').textContent).to.equal('moved-item.pdf');
    expect(query(field, '.nx-loading-spinner')).to.equal(null);
  });

  it('asks for confirmation and keeps the value on Cancel', async () => {
    const field = await mount({ contentMediaType: 'image/*', value: './media_abc.png' });
    const focus = sinon.spy(query(field, '.asset-remove'), 'focus');
    const changes = recordChanges(field);
    button(field, 'Remove').click();
    await field.updateComplete;
    const dialog = query(field, 'nx-dialog');
    expect(dialog.title).to.equal('Remove image?');
    expect(dialog.textContent).to.include('without deleting the original file');

    button(field, 'Cancel').click();
    await field.updateComplete;
    expect(query(field, 'nx-dialog')).to.equal(null);
    expect(changes).to.deep.equal([]);
    expect(focus.calledOnce).to.be.true;
  });

  it('removes only the field reference after confirmation', async () => {
    const field = await mount({ value: './media_abc.png' });
    const focus = sinon.spy(query(field, '.asset-source-trigger'), 'focus');
    const changes = recordChanges(field);
    button(field, 'Remove').click();
    await field.updateComplete;
    query(field, '.asset-remove-confirm').click();
    await field.updateComplete;
    expect(query(field, 'nx-dialog')).to.equal(null);
    expect(changes).to.deep.equal([undefined]);
    expect(query(field, '.asset-placeholder')).to.exist;
    expect(focus.calledOnce).to.be.true;
  });

  it('disables changes but shows a saved value and validation message when readonly', async () => {
    const field = await mount({ value: './media_abc.png', disabled: true, error: 'Required' });
    expect(menu(field).querySelector('[slot="trigger"]').disabled).to.be.true;
    expect(button(field, 'Remove').disabled).to.be.true;
    expect(query(field, '.form-field-error').textContent).to.equal('Required');
  });

  it('ignores a selection that finishes after the field is disconnected', async () => {
    let resolve;
    const field = await mount({
      sources: [aem({ select: () => new Promise((done) => { resolve = done; }) })],
    });
    const changes = recordChanges(field);
    button(field, 'Select').click();
    field.remove();
    resolve({ href: './media_late.png' });
    await new Promise((done) => { setTimeout(done, 0); });
    expect(changes).to.deep.equal([]);
  });
});
