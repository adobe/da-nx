import { expect } from '@esm-bundle/chai';
import '../../../../../../blocks/shared/menu/menu.js';

async function createMenu(items) {
  const el = document.createElement('nx-menu');
  el.items = items;
  document.body.append(el);
  await el.updateComplete;
  return el;
}

describe('nx-menu description', () => {
  afterEach(() => {
    document.querySelectorAll('nx-menu').forEach((el) => el.remove());
  });

  it('renders a description line when item.description is set', async () => {
    const el = await createMenu([
      { id: 'idea', label: 'Submit an idea', description: 'Suggestions and feature requests' },
    ]);
    const desc = el.shadowRoot.querySelector('.menu-item-description');
    expect(desc).to.not.be.null;
    expect(desc.textContent).to.equal('Suggestions and feature requests');
  });

  it('does not render a description line when item.description is absent', async () => {
    const el = await createMenu([{ id: 'files', label: 'Files or images' }]);
    expect(el.shadowRoot.querySelector('.menu-item-description')).to.be.null;
  });

  it('still renders the label when description is present', async () => {
    const el = await createMenu([
      { id: 'bug', label: 'Report a bug', description: 'Problems using AEM' },
    ]);
    const label = el.shadowRoot.querySelector('.menu-item-label');
    expect(label.textContent).to.equal('Report a bug');
  });
});

describe('nx-menu disabled', () => {
  afterEach(() => {
    document.querySelectorAll('nx-menu').forEach((el) => el.remove());
  });

  it('renders a disabled item as a disabled button', async () => {
    const el = await createMenu([{ id: 'lib', label: 'Open block library', disabled: true }]);
    const btn = el.shadowRoot.querySelector('[data-id="lib"]');
    expect(btn.disabled).to.be.true;
    expect(btn.getAttribute('aria-disabled')).to.equal('true');
  });

  it('does not emit select when a disabled item is clicked', async () => {
    const el = await createMenu([{ id: 'lib', label: 'Open block library', disabled: true }]);
    let selected = false;
    el.addEventListener('select', () => { selected = true; });
    el.shadowRoot.querySelector('[data-id="lib"]').click();
    expect(selected).to.be.false;
  });

  it('skips disabled items when picking the initial active item', async () => {
    const el = await createMenu([
      { id: 'lib', label: 'Open block library', disabled: true },
      { id: 'insert', label: 'Insert block' },
    ]);
    el._onMenuToggle({ newState: 'open' });
    await el.updateComplete;
    expect(el._active).to.equal('insert');
  });

  it('skips disabled items during keyboard navigation', async () => {
    const el = await createMenu([
      { id: 'insert', label: 'Insert block' },
      { id: 'lib', label: 'Open block library', disabled: true },
    ]);
    el._active = 'insert';
    el.handleKey('ArrowDown');
    expect(el._active).to.equal('insert');
  });
});
