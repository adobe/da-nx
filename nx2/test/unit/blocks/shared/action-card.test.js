import { expect } from '@esm-bundle/chai';
import { setConfig } from '../../../../scripts/nx.js';

// Note: element presence is asserted as booleans (`!!el`), not `to.equal(null)`;
// the custom test reporter crashes when it has to print a DOM element on failure.

await setConfig({ hostnames: [] });
await import('../../../../blocks/shared/action-card/action-card.js');
// Preload the menu the card lazy-loads on first click, so opening it needs no polling.
await import('../../../../blocks/shared/menu/menu.js');

const ICON = '/img/icons/s2-icon-treeview-20-n.svg';
const TINT = '#F4EBFC';
const MENU = [{ id: 'learn-more', label: 'Learn more' }, { id: 'open-new-tab', label: 'Open in new tab' }];

const tick = () => new Promise((r) => { setTimeout(r, 0); });

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
  await tick();
  return $(card, 'nx-menu');
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('nx-action-card content', () => {
  it('renders heading and description', async () => {
    const card = await make();
    expect($(card, '.heading').textContent.trim()).to.equal('Traverse');
    expect($(card, '.description').textContent.trim()).to.equal('Get a birds eye view.');
  });

  it('puts extra content into the footer', async () => {
    const card = await make({}, '<span slot="extra">By Admin</span>');
    const slot = $(card, '.footer slot[name="extra"]');
    expect(slot.assignedElements().map((e) => e.textContent)).to.deep.equal(['By Admin']);
  });
});

describe('nx-action-card tile', () => {
  it('renders the icon from an svg url', async () => {
    const card = await make({ icon: ICON });
    const use = $(card, '.tile use');
    expect(use.getAttribute('href')).to.equal(`${ICON}#icon`);
    expect([use.getAttribute('width'), use.getAttribute('height')]).to.deep.equal(['100%', '100%']);
  });

  it('applies a valid tint', async () => {
    const card = await make({ icon: ICON, tint: TINT });
    expect($(card, '.tile').classList.contains('has-bg')).to.be.true;
    expect($(card, '.tile').style.getPropertyValue('--tile-bg')).to.equal(TINT);
  });

  it('sizes the icon by tint: 20px tinted, 40px untinted', async () => {
    const tinted = await make({ icon: ICON, tint: TINT });
    const plain = await make({ icon: ICON });
    expect(getComputedStyle($(tinted, '.tile svg')).width).to.equal('20px');
    expect(getComputedStyle($(plain, '.tile svg')).width).to.equal('40px');
  });

  it('renders a tinted tile without an icon', async () => {
    const card = await make({ tint: TINT });
    expect(!!$(card, '.tile.has-bg')).to.be.true;
    expect(!!$(card, '.tile svg')).to.be.false;
  });

  it('ignores an invalid tint', async () => {
    const card = await make({ icon: ICON, tint: 'not a color' });
    expect($(card, '.tile').classList.contains('has-bg')).to.be.false;
  });

  it('renders no tile and no header without icon, tint and menu', async () => {
    const card = await make();
    expect(!!$(card, '.tile')).to.be.false;
    expect(!!$(card, '.header')).to.be.false;
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

  it('omits the more button without menu items', async () => {
    expect(!!$(await make(), '.more')).to.be.false;
    expect(!!$(await make({ menu: [] }), '.more')).to.be.false;
  });

  it('ships its own more icon inline', async () => {
    const card = await make({ menu: MENU });
    const svg = $(card, '.more svg');
    expect(!!svg.querySelector('use')).to.be.false;
    expect(svg.querySelectorAll('circle').length).to.be.greaterThan(0);
  });

  it('keeps the more button on the right without a tile', async () => {
    const card = await make({ menu: MENU });
    const header = $(card, '.header').getBoundingClientRect();
    const btn = $(card, '.more').getBoundingClientRect();
    expect(Math.round(header.right - btn.right)).to.equal(0);
  });

  it('opens with the menu items', async () => {
    const card = await make({ menu: MENU });
    const menu = await openMenu(card);
    expect(menu.open).to.be.true;
    expect(menu.items).to.deep.equal(MENU);
    expect($(card, '.more').getAttribute('aria-expanded')).to.equal('true');
  });

  it('lets the select event bubble out of the card', async () => {
    const card = await make({ menu: MENU });
    const selected = [];
    card.addEventListener('select', (e) => selected.push(e.detail.id));
    const menu = await openMenu(card);
    menu.shadowRoot.querySelector('[data-id="open-new-tab"]').click();
    expect(selected).to.deep.equal(['open-new-tab']);
  });

  it('clicking more again closes the menu', async () => {
    const card = await make({ menu: MENU });
    const menu = await openMenu(card);
    $(card, '.more').click();
    await tick();
    expect(menu.open).to.be.false;
    expect($(card, '.more').getAttribute('aria-expanded')).to.equal('false');
  });
});
