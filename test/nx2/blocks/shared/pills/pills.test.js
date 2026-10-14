import { expect } from '@esm-bundle/chai';

async function makePills(props) {
  const el = document.createElement('nx-pills');
  Object.assign(el, props);
  document.body.append(el);
  await el.updateComplete;
  return el;
}

describe('nx-pills', () => {
  let el;

  before(async () => {
    await import('../../../../../nx2/blocks/shared/pills/pills.js');
  });

  afterEach(() => {
    el?.remove();
  });

  it('renders a remove button by default', async () => {
    el = await makePills({ items: [{ id: '1', label: 'hero.png', type: 'image' }] });
    const button = el.shadowRoot.querySelector('.pill button');
    expect(button.getAttribute('aria-label')).to.equal('Remove hero.png');
  });

  it('omits the action button when an item is not removable', async () => {
    el = await makePills({
      items: [
        { id: 'app', label: 'App', removable: false },
        { id: 'plugin', label: 'Plugin', removable: false },
      ],
    });
    const pills = [...el.shadowRoot.querySelectorAll('.pill')];
    expect(pills.map((pill) => pill.textContent.trim())).to.deep.equal(['App', 'Plugin']);
    expect(el.shadowRoot.querySelectorAll('.pill button').length).to.equal(0);
  });

  it('labels the list with "Attached items" by default', async () => {
    el = await makePills({ items: [{ id: '1', label: 'hero.png' }] });
    const list = el.shadowRoot.querySelector('.pills-container');
    expect(list.getAttribute('aria-label')).to.equal('Attached items');
  });

  it('uses a custom list label when provided', async () => {
    el = await makePills({ label: 'Type', items: [{ id: 'app', label: 'App', removable: false }] });
    const list = el.shadowRoot.querySelector('.pills-container');
    expect(list.getAttribute('aria-label')).to.equal('Type');
  });

  it('lets hosts recolor pills via custom properties', async () => {
    el = await makePills({ items: [{ id: 'app', label: 'App', removable: false }] });
    el.style.setProperty('--nx-pill-background', 'rgb(1, 2, 3)');
    el.style.setProperty('--nx-pill-color', 'rgb(4, 5, 6)');
    const pill = el.shadowRoot.querySelector('.pill');
    const label = el.shadowRoot.querySelector('.pill-label');
    expect(getComputedStyle(pill).backgroundColor).to.equal('rgb(1, 2, 3)');
    expect(getComputedStyle(label).color).to.equal('rgb(4, 5, 6)');
  });
});
