import { expect } from '@esm-bundle/chai';
import '../../../../../nx2/blocks/chat-ao/artifacts/page-evaluation.js';

function mount(data) {
  const el = document.createElement('nx-page-eval');
  el.data = data;
  document.body.append(el);
  return el;
}

function dataWith(items) {
  return {
    title: 'Test',
    summary: [],
    sections: [{
      label: 'Failed checks', tone: 'negative', defaultOpen: true, items,
    }],
  };
}

describe('nx-page-eval item category chip', () => {
  afterEach(() => {
    document.querySelectorAll('nx-page-eval').forEach((el) => el.remove());
  });

  it('renders a category chip when the item has one', async () => {
    const el = mount(dataWith([{ title: 'H1', category: 'Content', check: { label: 'H1' } }]));
    await el.updateComplete;

    const chip = el.shadowRoot.querySelector('.ui-artifact-pe-item-category');
    expect(chip).to.exist;
    expect(chip.textContent).to.equal('Content');
  });

  it('omits the chip when the item has no category', async () => {
    const el = mount(dataWith([{ title: 'H1', check: { label: 'H1' } }]));
    await el.updateComplete;

    expect(el.shadowRoot.querySelector('.ui-artifact-pe-item-category')).to.equal(null);
  });
});
