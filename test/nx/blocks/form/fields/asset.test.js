import { expect } from '@esm-bundle/chai';
import '../../../../../nx/blocks/form/fields/asset.js';

const mounted = [];
afterEach(() => {
  while (mounted.length) mounted.pop().remove();
});

async function mount(options = {}) {
  const field = document.createElement('form-asset');
  Object.assign(field, {
    label: 'Hero image',
    aemAssetsAvailable: true,
    ...options,
  });
  field.addEventListener('asset-change', (event) => {
    field.value = event.detail.value;
  });
  document.body.append(field);
  mounted.push(field);
  await field.updateComplete;
  return field;
}

const button = (field, text) => [...field.shadowRoot.querySelectorAll('button, form-button')]
  .find((element) => (element.querySelector('.source-title')?.textContent
    ?? element.textContent).trim() === text);

async function openSources(field, action = 'Select') {
  button(field, action).click();
  await field.updateComplete;
  return field.shadowRoot.querySelector('dialog');
}

describe('form-asset', () => {
  it('shows the empty state and label without a persistent deletion warning', async () => {
    const field = await mount({ required: true, description: 'Choose a hero image.' });
    expect(field.shadowRoot.querySelector('label').textContent).to.include('Hero image');
    expect(field.shadowRoot.querySelector('.form-required')).to.exist;
    expect(field.shadowRoot.querySelector('.asset-empty').hidden).to.be.false;
    expect(button(field, 'Select')).to.exist;
    expect(field.shadowRoot.querySelector('.asset-guidance')).to.equal(null);
  });

  it('renders an existing reference with Replace and Remove actions', async () => {
    const field = await mount({ value: './media_abc.png', displayName: 'hero.png' });
    expect(field.shadowRoot.querySelector('.asset-empty').hidden).to.be.true;
    expect(field.shadowRoot.querySelector('.asset-name').textContent).to.equal('hero.png');
    expect(button(field, 'Replace')).to.exist;
    expect(button(field, 'Remove')).to.exist;
  });

  it('opens a source dialog without preselecting Upload and closes on cancel', async () => {
    const field = await mount();
    const dialog = await openSources(field);
    expect(dialog.open).to.be.true;
    expect(field.shadowRoot.activeElement?.id).to.equal('asset-dialog-title');
    expect(button(field, 'Upload')).to.exist;
    expect(button(field, 'AEM Assets')).to.exist;
    button(field, 'Cancel').click();
    await new Promise((done) => { requestAnimationFrame(done); });
    expect(dialog.open).to.be.false;
    expect(field.shadowRoot.activeElement?.textContent.trim()).to.equal('Select');
  });

  it('does not offer AEM Assets when the site has no repository config', async () => {
    const field = await mount({ aemAssetsAvailable: false });
    const dialog = await openSources(field);
    expect(button(field, 'Upload')).to.exist;
    expect(button(field, 'AEM Assets')).to.equal(undefined);
    const sources = field.shadowRoot.querySelector('.asset-sources');
    expect(dialog.classList.contains('asset-dialog-single')).to.be.true;
    expect(getComputedStyle(sources).gridTemplateColumns.split(' ')).to.have.lengthOf(1);
    expect(parseFloat(getComputedStyle(dialog).width)).to.be.lessThan(500);
  });

  it('lays out two source choices when AEM Assets is configured', async () => {
    const field = await mount();
    const dialog = await openSources(field);
    const sources = field.shadowRoot.querySelector('.asset-sources');
    expect(dialog.classList.contains('asset-dialog-single')).to.be.false;
    expect(getComputedStyle(sources).gridTemplateColumns.split(' ')).to.have.lengthOf(2);
  });

  it('explains a repository configuration error while keeping Upload available', async () => {
    const field = await mount({
      aemAssetsAvailable: false,
      aemAssetsError: 'Configuration request failed.',
    });
    await openSources(field);
    expect(button(field, 'Upload')).to.exist;
    expect(button(field, 'AEM Assets')).to.equal(undefined);
    expect(field.shadowRoot.querySelector('.asset-config-error').textContent)
      .to.include('Configuration request failed.');
  });

  it('commits only a successful source URL, not a pending selection', async () => {
    let resolve;
    const select = ({ source }) => {
      expect(source).to.equal('upload');
      return new Promise((done) => { resolve = done; });
    };
    const field = await mount({ value: './media_old.png', onSelectSource: select });
    const changes = [];
    field.addEventListener('asset-change', (event) => changes.push(event.detail.value));
    await openSources(field, 'Replace');
    button(field, 'Upload').click();
    await field.updateComplete;
    expect(field.value).to.equal('./media_old.png');
    expect(changes).to.have.lengthOf(0);
    expect(field.shadowRoot.querySelector('[role="status"]').textContent).to.include('Selecting');

    resolve({ href: './media_new.png', name: 'new.png' });
    await new Promise((done) => { setTimeout(done, 0); });
    await field.updateComplete;
    expect(changes).to.deep.equal(['./media_new.png']);
    expect(field.shadowRoot.querySelector('.asset-name').textContent).to.equal('new.png');
  });

  it('keeps the old value on cancellation and shows errors without changing it', async () => {
    const field = await mount({
      value: 'https://example.com/old.png',
      onSelectSource: () => ({ cancelled: true }),
    });
    const changes = [];
    field.addEventListener('asset-change', (event) => changes.push(event.detail.value));
    await openSources(field, 'Replace');
    button(field, 'AEM Assets').click();
    await field.updateComplete;
    expect(changes).to.have.lengthOf(0);
    expect(field.value).to.equal('https://example.com/old.png');

    field.onSelectSource = async () => { throw new Error('Asset unavailable'); };
    await openSources(field, 'Replace');
    button(field, 'AEM Assets').click();
    await new Promise((done) => { setTimeout(done, 0); });
    await field.updateComplete;
    expect(field.shadowRoot.querySelector('[role="alert"]').textContent).to.include('Asset unavailable');
    expect(changes).to.have.lengthOf(0);
    expect(field.value).to.equal('https://example.com/old.png');
  });

  it('reports a missing source adapter instead of pretending selection succeeded', async () => {
    const field = await mount();
    await openSources(field);
    button(field, 'Upload').click();
    await field.updateComplete;
    expect(field.shadowRoot.querySelector('[role="alert"]').textContent).to.include('unavailable');
    expect(field.value).to.equal(undefined);
  });

  it('removes only the reference and offers Undo', async () => {
    const field = await mount({ value: './media_abc.png' });
    const changes = [];
    field.addEventListener('asset-change', (event) => changes.push(event.detail.value));
    button(field, 'Remove').click();
    await field.updateComplete;
    expect(changes).to.deep.equal([undefined]);
    expect(field.shadowRoot.querySelector('[role="status"]').textContent)
      .to.include('Image removed from this field.');
    expect(getComputedStyle(field.shadowRoot.querySelector('.asset-undo')).position).to.equal('fixed');
    button(field, 'Undo').click();
    await field.updateComplete;
    expect(changes).to.deep.equal([undefined, './media_abc.png']);
  });

  it('disables changes but shows a saved value and validation message when readonly', async () => {
    const field = await mount({ value: './media_abc.png', disabled: true, error: 'Required' });
    expect(button(field, 'Replace').disabled).to.be.true;
    expect(button(field, 'Remove').disabled).to.be.true;
    expect(field.shadowRoot.querySelector('.form-field-error').textContent).to.equal('Required');
  });

  it('ignores a selection that finishes after the field is disconnected', async () => {
    let resolve;
    const field = await mount({
      onSelectSource: () => new Promise((done) => { resolve = done; }),
    });
    const changes = [];
    field.addEventListener('asset-change', (event) => changes.push(event.detail.value));
    await openSources(field);
    button(field, 'Upload').click();
    field.remove();
    resolve({ href: './media_late.png' });
    await new Promise((done) => { setTimeout(done, 0); });
    expect(changes).to.have.lengthOf(0);
  });
});
