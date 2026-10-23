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
  let styles;

  before(async () => {
    styles = document.createElement('link');
    styles.rel = 'stylesheet';
    styles.href = '/nx2/styles/styles.css';
    await new Promise((resolve, reject) => {
      styles.onload = resolve;
      styles.onerror = reject;
      document.head.append(styles);
    });
    await import('../../../../../nx2/blocks/shared/pills/pills.js');
  });

  after(() => {
    styles.remove();
  });

  afterEach(() => {
    el?.remove();
  });

  it('accepts the medium size attribute', async () => {
    el = document.createElement('nx-pills');
    el.setAttribute('size', 'm');
    document.body.append(el);
    await el.updateComplete;
    expect(el.size).to.equal('m');
  });

  it('uses production sizing tokens and restores compact sizing', async () => {
    el = await makePills({
      items: [
        { id: 'file', label: 'notes.pdf', type: 'file' },
        { id: 'block', label: 'Block', type: 'block', pinnable: true },
        {
          id: 'image',
          label: 'hero.png',
          type: 'image',
          thumbnail: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
        },
      ],
    });
    const pill = el.shadowRoot.querySelector('.pill');
    const label = el.shadowRoot.querySelector('.pill-label');
    const close = el.shadowRoot.querySelector('.pill-icon svg');
    const pin = el.shadowRoot.querySelector('.pill-pin svg');
    const typeIcon = el.shadowRoot.querySelector('.pill-type-icon');
    const thumbnail = el.shadowRoot.querySelector('.pill-thumbnail');
    const list = el.shadowRoot.querySelector('.pills-container');
    const sizes = () => {
      const pillStyle = getComputedStyle(pill);
      const listStyle = getComputedStyle(list);
      return [
        getComputedStyle(label).fontSize, getComputedStyle(label).lineHeight,
        ...[close, pin, typeIcon, thumbnail].map((icon) => getComputedStyle(icon).width),
        pillStyle.padding, pillStyle.gap,
        pillStyle.borderRadius, pillStyle.maxWidth,
        listStyle.gap, listStyle.padding,
        getComputedStyle(thumbnail).borderRadius,
      ];
    };
    const small = sizes();
    expect(small).to.deep.equal([
      '12px', '16px', '12px', '14px', '14px', '16px',
      '4px 8px', '4px', '7px', '200px', '8px', '4px 0px', '2px',
    ]);

    el.size = 'm';
    await el.updateComplete;
    expect(el.getAttribute('size')).to.equal('m');
    expect(sizes()).to.deep.equal([
      '14px', '18px', '14px', '16px', '18px', '20px',
      '8px 12px', '8px', '8px', '240px', '12px', '8px 0px', '3px',
    ]);

    el.size = 's';
    await el.updateComplete;
    expect(sizes()).to.deep.equal(small);
  });

  ['s', 'm'].forEach((size) => {
    it(`fits two thumbnail rows and scrolls a third at size ${size}`, async () => {
      const items = ['first', 'second', 'third'].map((id) => ({
        id,
        label: id,
        type: 'image',
        thumbnail: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
      }));
      el = await makePills({ size, items: items.slice(0, 2) });
      el.style.display = 'block';
      el.style.width = '100px';
      const list = el.shadowRoot.querySelector('.pills-container');
      const rows = () => new Set(
        [...list.children].map((pill) => pill.getBoundingClientRect().top),
      ).size;
      expect(rows()).to.equal(2);
      expect(list.scrollHeight).to.equal(list.clientHeight);

      el.items = items;
      await el.updateComplete;
      expect(rows()).to.equal(3);
      expect(list.scrollHeight).to.be.greaterThan(list.clientHeight);
    });

    it(`lets hosts lift the two-row cap via --nx-pills-max-height at size ${size}`, async () => {
      const items = ['first', 'second', 'third'].map((id) => ({
        id,
        label: id,
        type: 'image',
        thumbnail: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
      }));
      el = await makePills({ size, items });
      el.style.display = 'block';
      el.style.width = '100px';
      el.style.setProperty('--nx-pills-max-height', 'none');
      const list = el.shadowRoot.querySelector('.pills-container');
      expect(getComputedStyle(list).maxHeight).to.equal('none');
      expect(list.scrollHeight).to.equal(list.clientHeight);
    });
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
