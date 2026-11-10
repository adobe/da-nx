import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setConfig } from '../../../../scripts/nx.js';

await setConfig({ hostnames: [] });
await import('../../../../blocks/shared/action-card/action-card.js');

const ICON = '/img/icons/s2-icon-treeview-20-n.svg';

async function make(props = {}, extraHtml = '') {
  const card = document.createElement('nx-action-card');
  Object.assign(card, { heading: 'Traverse', description: 'Get a birds eye view.', ...props });
  card.innerHTML = extraHtml;
  document.body.append(card);
  await card.updateComplete;
  return card;
}

const $ = (card, sel) => card.shadowRoot.querySelector(sel);

async function openMenu(card) {
  $(card, '.more').click();
  let menu;
  for (let i = 0; i < 50 && !menu?.open; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, 10); });
    menu = $(card, 'nx-menu');
  }
  await menu.updateComplete;
  return menu;
}

const MENU = [{ id: 'learn-more', label: 'Learn more' }, { id: 'open-new-tab', label: 'Open in new tab' }];

afterEach(() => {
  document.body.innerHTML = '';
  sinon.restore();
});

describe('nx-action-card content', () => {
  it('renders heading and description', async () => {
    const card = await make();
    expect($(card, '.heading').textContent.trim()).to.equal('Traverse');
    expect($(card, '.description').textContent.trim()).to.equal('Get a birds eye view.');
  });

  it('renders the icon from an svg url', async () => {
    const card = await make({ icon: ICON });
    const use = $(card, '.tile use');
    expect(use.getAttribute('href')).to.equal(`${ICON}#icon`);
    expect([use.getAttribute('width'), use.getAttribute('height')]).to.deep.equal(['100%', '100%']);
  });

  it('renders no tile without icon and tint', async () => {
    const card = await make();
    expect(!!$(card, '.tile')).to.be.false;
    expect(!!$(card, '.header')).to.be.false;
  });

  it('renders a tinted tile without an icon', async () => {
    const card = await make({ tint: '#F4EBFC' });
    expect($(card, '.tile').classList.contains('has-bg')).to.be.true;
    expect(!!$(card, '.tile svg')).to.be.false;
  });

  it('keeps the more button on the right without a tile', async () => {
    const card = await make({ menu: MENU });
    expect(!!$(card, '.tile')).to.be.false;
    const header = $(card, '.header').getBoundingClientRect();
    const btn = $(card, '.more').getBoundingClientRect();
    expect(Math.round(header.right - btn.right)).to.equal(0);
  });

  it('applies a valid tint and sizes the icon', async () => {
    const tinted = await make({ icon: ICON, tint: '#F4EBFC' });
    const plain = await make({ icon: ICON });
    expect($(tinted, '.tile').classList.contains('has-bg')).to.be.true;
    expect($(tinted, '.tile').style.getPropertyValue('--tile-bg')).to.equal('#F4EBFC');
    expect(getComputedStyle($(tinted, '.tile svg')).width).to.equal('20px');
    expect(getComputedStyle($(plain, '.tile svg')).width).to.equal('40px');
  });

  it('ignores an invalid tint', async () => {
    const card = await make({ icon: ICON, tint: 'not a color' });
    expect($(card, '.tile').classList.contains('has-bg')).to.be.false;
  });

  it('puts extra content into the footer', async () => {
    const card = await make({}, '<span slot="extra">By Admin</span>');
    const slot = $(card, '.footer slot[name="extra"]');
    expect(slot.assignedElements().map((e) => e.textContent)).to.deep.equal(['By Admin']);
  });
});

describe('nx-action-card action', () => {
  it('renders an M action link with its label', async () => {
    const card = await make({ action: '/apps/traverse', actionLabel: 'Launch' });
    const link = $(card, '.action');
    expect(link.getAttribute('href')).to.equal('/apps/traverse');
    expect(link.textContent.trim()).to.equal('Launch');
    expect(link.getAttribute('aria-label')).to.equal('Launch Traverse');
    expect(link.hasAttribute('target')).to.be.false;
    const cs = getComputedStyle(link);
    expect([cs.height, cs.fontSize, cs.fontWeight]).to.deep.equal(['32px', '14px', '700']);
  });

  it('defaults the label to Open', async () => {
    const card = await make({ action: '/apps/traverse' });
    expect($(card, '.action').textContent.trim()).to.equal('Open');
  });

  it('opens external actions in a new tab', async () => {
    const card = await make({ action: 'https://labs.aem.live/x' });
    expect($(card, '.action').getAttribute('target')).to.equal('_blank');
    expect($(card, '.action').getAttribute('rel')).to.equal('noopener');
  });

  it('omits the action without a url', async () => {
    const card = await make({ actionLabel: 'Open' });
    expect(!!$(card, '.action')).to.be.false;
  });
});

describe('nx-action-card menu', () => {
  it('renders the more button for menu items', async () => {
    const card = await make({ menu: MENU });
    const btn = $(card, '.more');
    expect(btn.getAttribute('aria-label')).to.equal('More options for Traverse');
    expect(btn.getAttribute('aria-haspopup')).to.equal('menu');
    expect(btn.getAttribute('aria-expanded')).to.equal('false');
  });

  it('ships its own more icon inline', async () => {
    const card = await make({ menu: MENU });
    const svg = $(card, '.more svg');
    expect(!!svg.querySelector('use')).to.be.false;
    expect(svg.querySelectorAll('circle').length).to.be.greaterThan(0);
  });

  it('omits the more button without menu items', async () => {
    expect(!!$(await make(), '.more')).to.be.false;
    expect(!!$(await make({ menu: [] }), '.more')).to.be.false;
  });

  it('shows the menu items', async () => {
    const card = await make({ menu: MENU });
    const menu = await openMenu(card);
    expect(menu.items).to.deep.equal(MENU);
    expect($(card, '.more').getAttribute('aria-expanded')).to.equal('true');
  });

  it('lets the select event bubble out of the card', async () => {
    const card = await make({ menu: MENU });
    const spy = sinon.spy();
    card.addEventListener('select', (e) => spy(e.detail.id));
    const menu = await openMenu(card);
    menu.shadowRoot.querySelector('[data-id="open-new-tab"]').click();
    expect(spy.calledOnceWith('open-new-tab')).to.be.true;
  });

  it('clicking more again closes the menu', async () => {
    const card = await make({ menu: MENU });
    const menu = await openMenu(card);
    $(card, '.more').click();
    await new Promise((r) => { setTimeout(r, 20); });
    expect(menu.open).to.be.false;
    expect($(card, '.more').getAttribute('aria-expanded')).to.equal('false');
  });
});
