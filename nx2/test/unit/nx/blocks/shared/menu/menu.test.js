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
