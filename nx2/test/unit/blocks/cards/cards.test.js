import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setConfig } from '../../../../scripts/nx.js';

// cards.js reads getConfig() at import time, so config must be set first.
await setConfig({ hostnames: [] });
const { default: init } = await import('../../../../blocks/cards/cards.js');

const row = ({
  icon = 'icon-calendar',
  em = '',
  title = '<a href="/apps/traverse">Traverse</a>',
  desc = 'Get a birds eye view.',
  learnMore = '<ul><li><a href="https://www.adobe.com/learn">Learn more</a></li></ul>',
} = {}) => `
  <div>
    <div><span class="icon ${icon}"></span>${em}</div>
    <div>
      <h3>${title}</h3>
      <p>${desc}</p>
      ${learnMore}
    </div>
  </div>`;

function buildBlock(rowsHtml) {
  const el = document.createElement('div');
  el.className = 'nx-cards tools';
  el.innerHTML = rowsHtml;
  document.body.append(el);
  init(el);
  return el;
}

async function openMenu(el, idx = 0) {
  el.querySelectorAll('.card-more')[idx].click();
  let menu;
  for (let i = 0; i < 50 && !menu; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, 10); });
    menu = document.querySelector('nx-menu');
  }
  await menu.updateComplete;
  return menu;
}

afterEach(() => {
  document.body.innerHTML = '';
  sinon.restore();
});

describe('cards block structure', () => {
  it('adds card class and listitem role to every row', () => {
    const el = buildBlock(row() + row());
    expect(el.getAttribute('role')).to.equal('list');
    const cards = el.querySelectorAll(':scope > .card');
    expect(cards.length).to.equal(2);
    cards.forEach((card) => expect(card.getAttribute('role')).to.equal('listitem'));
  });

  it('renders icon from the short name', () => {
    const el = buildBlock(row({ icon: 'icon-treeview' }));
    const use = el.querySelector('.card-icon use');
    expect(use.getAttribute('href')).to.match(/\/img\/icons\/s2-icon-treeview-20-n\.svg#icon$/);
    expect(el.querySelector('span.icon')).to.be.null;
  });

  it('normalizes case and hyphens in the short name', () => {
    const el = buildBlock(row({ icon: 'icon-Tree-View' }));
    const use = el.querySelector('.card-icon use');
    expect(use.getAttribute('href')).to.match(/\/img\/icons\/s2-icon-treeview-20-n\.svg#icon$/);
  });

  it('skips icons with unsafe names', () => {
    const el = document.createElement('div');
    el.className = 'nx-cards tools';
    el.innerHTML = row();
    el.querySelector('span.icon').className = 'icon icon-s2"><img';
    document.body.append(el);
    init(el);
    expect(el.querySelector('.card-icon').children.length).to.equal(0);
  });

  it('applies em color to the tile', () => {
    const el = buildBlock(row({ em: '<em>#F4EBFC</em>' }));
    const tile = el.querySelector('.card-icon');
    expect(tile.classList.contains('has-bg')).to.be.true;
    expect(tile.style.getPropertyValue('--card-icon-bg')).to.equal('#F4EBFC');
    expect(el.querySelector('em')).to.be.null;
  });

  it('skips tile background without em', () => {
    const el = buildBlock(row());
    const tile = el.querySelector('.card-icon');
    expect(tile.classList.contains('has-bg')).to.be.false;
    expect(tile.style.getPropertyValue('--card-icon-bg')).to.equal('');
  });

  it('ignores invalid em color', () => {
    const el = buildBlock(row({ em: '<em>not a color</em>' }));
    expect(el.querySelector('.card-icon').classList.contains('has-bg')).to.be.false;
    expect(el.querySelector('em')).to.be.null;
  });

  it('unwraps the title link', () => {
    const el = buildBlock(row());
    const h3 = el.querySelector('.card-body h3');
    expect(h3.textContent.trim()).to.equal('Traverse');
    expect(h3.querySelector('a')).to.be.null;
  });

  it('renders by adobe byline', () => {
    const el = buildBlock(row());
    expect(el.querySelector('.card-footer .card-byline .card-byline-text').textContent.trim()).to.equal('By Adobe');
  });

  it('renders the by adobe logo', () => {
    const el = buildBlock(row());
    const svg = el.querySelector('.card-byline .card-byline-logo svg');
    expect(svg.querySelector('use').getAttribute('href')).to.match(/\/img\/icons\/s2-icon-byadobe-20-n\.svg#icon$/);
    expect(getComputedStyle(svg).width).to.equal('18px');
  });

  it('scales any icon file into the svg frame', () => {
    const el = buildBlock(row());
    el.querySelectorAll('svg.icon use').forEach((use) => {
      expect(use.getAttribute('width')).to.equal('100%');
      expect(use.getAttribute('height')).to.equal('100%');
    });
  });

  it('renders the icon at full tile size without a background', () => {
    const el = buildBlock(row() + row({ em: '<em>#F4EBFC</em>' }));
    const [plain, tinted] = [...el.querySelectorAll('.card-icon svg')].map((s) => getComputedStyle(s));
    expect([plain.width, plain.height]).to.deep.equal(['40px', '40px']);
    expect([tinted.width, tinted.height]).to.deep.equal(['20px', '20px']);
  });

  it('removes the learn more list from the body', () => {
    const el = buildBlock(row());
    expect(el.querySelector('ul')).to.be.null;
  });

  it('adopts the stylesheet before init returns', () => {
    buildBlock(row());
    const adopted = document.adoptedStyleSheets
      .some((s) => [...s.cssRules].some((r) => r.cssText.startsWith('.nx-cards')));
    expect(adopted).to.be.true;
  });
});

describe('cards open link', () => {
  it('renders open link from title link', () => {
    const el = buildBlock(row());
    const open = el.querySelector('.card-footer .card-open');
    expect(open.href).to.equal(new URL('/apps/traverse', window.location.href).href);
    expect(open.textContent.trim()).to.equal('Open');
    expect(open.getAttribute('aria-label')).to.equal('Open Traverse');
    expect(open.hasAttribute('target')).to.be.false;
  });

  it('renders the open button at size m', () => {
    const el = buildBlock(row());
    const open = el.querySelector('.card-open');
    const cs = getComputedStyle(open);
    expect([cs.height, cs.fontSize, cs.fontWeight]).to.deep.equal(['32px', '14px', '700']);
  });

  it('opens external links in a new tab', () => {
    const el = buildBlock(row({ title: '<a href="https://labs.aem.live/x">Config</a>' }));
    const open = el.querySelector('.card-open');
    expect(open.getAttribute('target')).to.equal('_blank');
    expect(open.getAttribute('rel')).to.equal('noopener');
  });

  it('omits open link without title link', () => {
    const el = buildBlock(row({ title: 'Plain' }));
    expect(el.querySelector('.card')).to.not.be.null;
    expect(el.querySelector('.card-open')).to.be.null;
    expect(el.querySelector('h3').textContent.trim()).to.equal('Plain');
  });
});

describe('cards more menu', () => {
  it('renders more button', () => {
    const el = buildBlock(row());
    const btn = el.querySelector('.card-header .card-more');
    expect(btn.getAttribute('type')).to.equal('button');
    expect(btn.getAttribute('aria-label')).to.equal('More options for Traverse');
    expect(btn.getAttribute('aria-haspopup')).to.equal('menu');
    expect(btn.querySelector('use').getAttribute('href')).to.match(/s2-icon-more-20-n\.svg#icon$/);
  });

  it('omits more button without any menu item', () => {
    const el = buildBlock(row({ title: 'Plain', learnMore: '' }));
    expect(el.querySelector('.card-more')).to.be.null;
  });

  it('opens menu with learn more and open in new tab', async () => {
    const el = buildBlock(row());
    const menu = await openMenu(el);
    expect(menu.items.map((i) => i.id)).to.deep.equal(['learn-more', 'open-new-tab']);
    expect(menu.items.map((i) => i.label)).to.deep.equal(['Learn more', 'Open in new tab']);
  });

  it('menu has only open in new tab without list', async () => {
    const el = buildBlock(row({ learnMore: '' }));
    const menu = await openMenu(el);
    expect(menu.items.map((i) => i.id)).to.deep.equal(['open-new-tab']);
  });

  it('selecting an item opens the url in a new tab', async () => {
    const stub = sinon.stub(window, 'open');
    const el = buildBlock(row());
    const menu = await openMenu(el);
    menu.dispatchEvent(new CustomEvent('select', { detail: { id: 'learn-more' } }));
    expect(stub.calledOnceWith('https://www.adobe.com/learn', '_blank', 'noopener')).to.be.true;
  });

  it('clicking more again closes the menu', async () => {
    const el = buildBlock(row());
    const menu = await openMenu(el);
    expect(menu.open).to.be.true;
    el.querySelector('.card-more').click();
    await new Promise((r) => { setTimeout(r, 20); });
    expect(menu.open).to.be.false;
  });

  it('reflects open state in aria-expanded', async () => {
    const el = buildBlock(row());
    const btn = el.querySelector('.card-more');
    expect(btn.getAttribute('aria-expanded')).to.equal('false');
    const menu = await openMenu(el);
    expect(btn.getAttribute('aria-expanded')).to.equal('true');
    menu.close();
    await new Promise((r) => { setTimeout(r, 20); });
    expect(btn.getAttribute('aria-expanded')).to.equal('false');
  });

  it('reuses one menu across cards', async () => {
    const stub = sinon.stub(window, 'open');
    const el = buildBlock(row() + row({ title: '<a href="/apps/bulk">Bulk</a>' }));
    await openMenu(el, 0);
    const menu = await openMenu(el, 1);
    expect(document.querySelectorAll('nx-menu').length).to.equal(1);
    expect(el.contains(document.querySelector('nx-menu'))).to.be.false;
    menu.dispatchEvent(new CustomEvent('select', { detail: { id: 'open-new-tab' } }));
    const expected = new URL('/apps/bulk', window.location.href).href;
    expect(stub.calledOnceWith(expected, '_blank', 'noopener')).to.be.true;
  });
});

describe('cards search', () => {
  const twoCards = () => row() + row({
    title: '<a href="/apps/bulk">Bulk Operations</a>',
    desc: 'Preview, publish, delete.',
  });

  function buildInSection(rowsHtml) {
    const section = document.createElement('div');
    section.className = 'section';
    document.body.append(section);
    const el = document.createElement('div');
    el.className = 'nx-cards tools';
    el.innerHTML = rowsHtml;
    section.append(el);
    init(el);
    return { section, el };
  }

  function search(query) {
    const results = [];
    document.dispatchEvent(new CustomEvent('nx-cards-filter', { detail: { query, results } }));
    return results;
  }

  const visibleTitles = (el) => [...el.querySelectorAll('.card:not([hidden]) h3')]
    .map((h) => h.textContent.trim());

  it('hides cards that do not match the query', () => {
    const { el } = buildInSection(twoCards());
    search('trav');
    expect(visibleTitles(el)).to.deep.equal(['Traverse']);
    const hiddenCard = el.querySelector('.card[hidden]');
    expect(getComputedStyle(hiddenCard).display).to.equal('none');
  });

  it('matches the description case-insensitively', () => {
    const { el } = buildInSection(twoCards());
    search('  BIRDS EYE ');
    expect(visibleTitles(el)).to.deep.equal(['Traverse']);
  });

  it('reports the match count for its section', () => {
    const { section } = buildInSection(twoCards());
    const results = search('trav');
    const own = results.filter((r) => r.section === section);
    expect(own.map((r) => r.count)).to.deep.equal([1]);
  });

  it('shows all cards for an empty query', () => {
    const { el, section } = buildInSection(twoCards());
    search('trav');
    const results = search('');
    expect(visibleTitles(el)).to.deep.equal(['Traverse', 'Bulk Operations']);
    expect(results.find((r) => r.section === section).count).to.equal(2);
  });

  it('ignores the event once removed from the page', () => {
    const { section } = buildInSection(twoCards());
    section.remove();
    expect(search('trav').some((r) => r.section === section)).to.be.false;
  });

  it('announces itself when ready', () => {
    const spy = sinon.spy();
    document.addEventListener('nx-cards-ready', spy);
    buildInSection(twoCards());
    document.removeEventListener('nx-cards-ready', spy);
    expect(spy.calledOnce).to.be.true;
  });
});
