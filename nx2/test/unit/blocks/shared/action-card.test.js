import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setConfig } from '../../../../scripts/nx.js';

await setConfig({ hostnames: [] });
await import('../../../../blocks/shared/action-card/action-card.js');
const { attachCardSearch } = await import('../../../../blocks/shared/action-card/search.js');

async function make(props = {}) {
  const card = document.createElement('nx-action-card');
  Object.assign(card, { heading: 'Traverse', description: 'Get a birds eye view.', ...props });
  document.body.append(card);
  await card.updateComplete;
  return card;
}

const $ = (card, sel) => card.shadowRoot.querySelector(sel);

async function openMenu(card) {
  $(card, '.more').click();
  let menu;
  for (let i = 0; i < 50 && !menu?.items?.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, 10); });
    menu = $(card, 'nx-menu');
  }
  await menu.updateComplete;
  return menu;
}

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

  it('renders the icon from a short name', async () => {
    const card = await make({ icon: 'Tree-View' });
    const use = $(card, '.tile use');
    expect(use.getAttribute('href')).to.match(/\/img\/icons\/s2-icon-treeview-20-n\.svg#icon$/);
    expect([use.getAttribute('width'), use.getAttribute('height')]).to.deep.equal(['100%', '100%']);
  });

  it('skips icons with unsafe names', async () => {
    const card = await make({ icon: 's2"><img' });
    expect($(card, '.tile svg')).to.equal(null);
  });

  it('prefers the image over the icon', async () => {
    const card = await make({ icon: 'calendar', image: '/media/app.png' });
    expect($(card, '.tile img').getAttribute('src')).to.equal('/media/app.png');
    expect($(card, '.tile svg')).to.equal(null);
  });

  it('applies a valid tint and sizes the icon', async () => {
    const tinted = await make({ icon: 'calendar', tint: '#F4EBFC' });
    const plain = await make({ icon: 'calendar' });
    expect($(tinted, '.tile').classList.contains('has-bg')).to.be.true;
    expect($(tinted, '.tile').style.getPropertyValue('--tile-bg')).to.equal('#F4EBFC');
    expect(getComputedStyle($(tinted, '.tile svg')).width).to.equal('20px');
    expect(getComputedStyle($(plain, '.tile svg')).width).to.equal('40px');
  });

  it('ignores an invalid tint', async () => {
    const card = await make({ icon: 'calendar', tint: 'not a color' });
    expect($(card, '.tile').classList.contains('has-bg')).to.be.false;
  });

  it('renders the byline with its logo', async () => {
    const card = await make({ byline: 'By Adobe', bylineIcon: 'byadobe' });
    expect($(card, '.byline-text').textContent.trim()).to.equal('By Adobe');
    expect($(card, '.byline use').getAttribute('href')).to.match(/s2-icon-byadobe-20-n\.svg#icon$/);
  });

  it('renders the byline without a logo', async () => {
    const card = await make({ byline: 'By Admin' });
    expect($(card, '.byline-text').textContent.trim()).to.equal('By Admin');
    expect($(card, '.byline svg')).to.equal(null);
  });

  it('hides when the hidden attribute is set', async () => {
    const card = await make();
    card.hidden = true;
    expect(getComputedStyle(card).display).to.equal('none');
  });
});

describe('nx-action-card open', () => {
  it('renders an M open link from href', async () => {
    const card = await make({ href: '/apps/traverse' });
    const open = $(card, '.open');
    expect(open.getAttribute('href')).to.equal('/apps/traverse');
    expect(open.textContent.trim()).to.equal('Open');
    expect(open.getAttribute('aria-label')).to.equal('Open Traverse');
    expect(open.hasAttribute('target')).to.be.false;
    const cs = getComputedStyle(open);
    expect([cs.height, cs.fontSize, cs.fontWeight]).to.deep.equal(['32px', '14px', '700']);
  });

  it('opens external links in a new tab', async () => {
    const card = await make({ href: 'https://labs.aem.live/x' });
    expect($(card, '.open').getAttribute('target')).to.equal('_blank');
    expect($(card, '.open').getAttribute('rel')).to.equal('noopener');
  });

  it('omits open without href', async () => {
    const card = await make();
    expect($(card, '.open')).to.equal(null);
  });
});

describe('nx-action-card menu', () => {
  it('renders the more button when there are menu items', async () => {
    const card = await make({ href: '/apps/traverse' });
    const btn = $(card, '.more');
    expect(btn.getAttribute('aria-label')).to.equal('More options for Traverse');
    expect(btn.getAttribute('aria-haspopup')).to.equal('menu');
    expect(btn.getAttribute('aria-expanded')).to.equal('false');
  });

  it('omits the more button without menu items', async () => {
    const card = await make();
    expect($(card, '.more')).to.equal(null);
  });

  it('lists learn more and open in new tab', async () => {
    const card = await make({ href: '/apps/traverse', learnMoreHref: 'https://www.adobe.com/learn' });
    const menu = await openMenu(card);
    expect(menu.items.map((i) => i.id)).to.deep.equal(['learn-more', 'open-new-tab']);
    expect(menu.items.map((i) => i.label)).to.deep.equal(['Learn more', 'Open in new tab']);
    expect($(card, '.more').getAttribute('aria-expanded')).to.equal('true');
  });

  it('opens the selected url in a new tab', async () => {
    const stub = sinon.stub(window, 'open');
    const card = await make({ href: '/apps/traverse', learnMoreHref: 'https://www.adobe.com/learn' });
    const menu = await openMenu(card);
    menu.dispatchEvent(new CustomEvent('select', { detail: { id: 'open-new-tab' } }));
    const expected = new URL('/apps/traverse', window.location.href).href;
    expect(stub.calledOnceWith(expected, '_blank', 'noopener')).to.be.true;
  });

  it('clicking more again closes the menu', async () => {
    const card = await make({ href: '/apps/traverse' });
    const menu = await openMenu(card);
    $(card, '.more').click();
    await new Promise((r) => { setTimeout(r, 20); });
    expect(menu.open).to.be.false;
    expect($(card, '.more').getAttribute('aria-expanded')).to.equal('false');
  });
});

describe('attachCardSearch', () => {
  async function setup() {
    const section = document.createElement('div');
    section.className = 'section';
    const container = document.createElement('div');
    section.append(container);
    document.body.append(section);
    const a = await make({ heading: 'Traverse', description: 'Birds eye view.' });
    const b = await make({ heading: 'Bulk Operations', description: 'Preview, publish.' });
    container.append(a, b);
    return { section, container, a, b };
  }

  const search = (query) => {
    const results = [];
    document.dispatchEvent(new CustomEvent('nx-cards-filter', { detail: { query, results } }));
    return results;
  };

  it('hides cards that do not match and reports the count', async () => {
    const { section, container, a, b } = await setup();
    attachCardSearch(container);
    const results = search('  BIRDS ');
    expect([a.hidden, b.hidden]).to.deep.equal([false, true]);
    expect(results.find((r) => r.section === section).count).to.equal(1);
  });

  it('shows all cards for an empty query', async () => {
    const { container, a, b } = await setup();
    attachCardSearch(container);
    search('trav');
    search('');
    expect([a.hidden, b.hidden]).to.deep.equal([false, false]);
  });

  it('ignores events once the container is removed', async () => {
    const { section, container } = await setup();
    attachCardSearch(container);
    section.remove();
    expect(search('trav').some((r) => r.section === section)).to.be.false;
  });

  it('announces readiness', async () => {
    const { container } = await setup();
    const spy = sinon.spy();
    document.addEventListener('nx-cards-ready', spy);
    attachCardSearch(container);
    document.removeEventListener('nx-cards-ready', spy);
    expect(spy.calledOnce).to.be.true;
  });
});
