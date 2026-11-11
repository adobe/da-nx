import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setConfig, getConfig } from '../../../../scripts/nx.js';

await setConfig({ hostnames: [] });
const { default: init } = await import('../../../../blocks/cards/cards.js');
const { attachCardSearch } = await import('../../../../blocks/cards/search.js');

const { codeBase } = getConfig();

// Element presence is asserted as booleans (`!!el`): the test reporter crashes printing DOM nodes.
const original = `${window.location.pathname}${window.location.search}${window.location.hash}`;
const setHash = (hash) => window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
const local = (path) => new URL(path, window.location.href).href;

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

async function buildBlock(rowsHtml, { variant = 'tools', prepare } = {}) {
  const section = document.createElement('div');
  section.className = 'section';
  const el = document.createElement('div');
  el.className = `nx-cards ${variant}`.trim();
  el.innerHTML = rowsHtml;
  prepare?.(el);
  section.append(el);
  document.body.append(section);
  await init(el);
  return el;
}

const cards = (el) => [...el.querySelectorAll(':scope > nx-action-card')];

const search = (query) => {
  const results = [];
  document.dispatchEvent(new CustomEvent('nx-cards-filter', { detail: { query, results } }));
  return results;
};

afterEach(() => {
  document.body.innerHTML = '';
  sinon.restore();
  window.history.replaceState(null, '', original);
});

describe('cards block', () => {
  it('renders one nx-action-card per row in a list', async () => {
    const el = await buildBlock(row() + row());
    expect(el.getAttribute('role')).to.equal('list');
    expect(cards(el).length).to.equal(2);
    cards(el).forEach((c) => expect(c.getAttribute('role')).to.equal('listitem'));
    expect(el.querySelectorAll(':scope > div').length).to.equal(0);
  });

  it('maps the row to card properties', async () => {
    const el = await buildBlock(row({ icon: 'icon-Tree-View', em: '<em>#F4EBFC</em>' }));
    const [card] = cards(el);
    expect(card.heading).to.equal('Traverse');
    expect(card.description).to.equal('Get a birds eye view.');
    const icon = card.querySelector(':scope > svg[slot="icon"]');
    expect(icon.querySelector('use').getAttribute('href')).to.equal(`${codeBase}/img/icons/s2-icon-treeview-20-n.svg#icon`);
    expect(icon.getAttribute('aria-hidden')).to.equal('true');
    expect(card.tint).to.equal('#F4EBFC');
    expect(card.action).to.equal(local('/apps/traverse'));
    expect(card.actionLabel).to.equal('Open');
  });

  it('skips icons with unsafe names', async () => {
    const el = await buildBlock(row(), {
      prepare: (block) => { block.querySelector('span.icon').className = 'icon icon-s2"><img'; },
    });
    expect(!!cards(el)[0].querySelector('[slot="icon"]')).to.be.false;
  });

  it('leaves action and tint unset when not authored', async () => {
    const el = await buildBlock(row({ title: 'Plain', learnMore: '' }));
    const [card] = cards(el);
    expect(card.action).to.equal(undefined);
    expect(card.tint).to.equal(undefined);
    expect(card.menu).to.deep.equal([]);
  });

  it('builds the menu from learn more and the title link', async () => {
    const el = await buildBlock(row());
    expect(cards(el)[0].menu).to.deep.equal([
      { id: 'learn-more', label: 'Learn more' },
      { id: 'open-new-tab', label: 'Open in new tab' },
    ]);
  });

  it('puts the by adobe byline into the extra slot for the tools variant', async () => {
    const el = await buildBlock(row());
    const extra = cards(el)[0].querySelector('[slot="extra"]');
    expect(extra.querySelector('.byline-text').textContent).to.equal('By Adobe');
    expect(extra.querySelector('use').getAttribute('href')).to.equal(`${codeBase}/img/icons/s2-icon-byadobe-20-n.svg#icon`);
    expect(getComputedStyle(extra.querySelector('svg')).width).to.equal('18px');
  });

  it('has no extra content without the tools variant', async () => {
    const el = await buildBlock(row(), { variant: '' });
    expect(!!cards(el)[0].querySelector('[slot="extra"]')).to.be.false;
  });

  it('hides cards that do not match the search', async () => {
    const el = await buildBlock(row() + row({ title: '<a href="/apps/bulk">Bulk Operations</a>', desc: 'Preview.' }));
    const results = search('trav');
    expect(cards(el).map((c) => c.hidden)).to.deep.equal([false, true]);
    expect(getComputedStyle(cards(el)[1]).display).to.equal('none');
    expect(results.find((r) => r.section === el.closest('.section')).count).to.equal(1);
  });
});

describe('attachCardSearch', () => {
  function setup() {
    const section = document.createElement('div');
    section.className = 'section';
    const container = document.createElement('div');
    section.append(container);
    document.body.append(section);
    const a = Object.assign(document.createElement('nx-action-card'), { heading: 'Traverse', description: 'Birds eye view.' });
    const b = Object.assign(document.createElement('nx-action-card'), { heading: 'Bulk Operations', description: 'Preview, publish.' });
    container.append(a, b);
    return { section, container, a, b };
  }

  it('matches heading and description case-insensitively', () => {
    const { section, container, a, b } = setup();
    attachCardSearch(container);
    const results = search('  BIRDS ');
    expect([a.hidden, b.hidden]).to.deep.equal([false, true]);
    expect(results.find((r) => r.section === section).count).to.equal(1);
  });

  it('shows all cards for an empty query', () => {
    const { container, a, b } = setup();
    attachCardSearch(container);
    search('trav');
    search('');
    expect([a.hidden, b.hidden]).to.deep.equal([false, false]);
  });

  it('ignores events once the container is removed', () => {
    const { section, container } = setup();
    attachCardSearch(container);
    section.remove();
    expect(search('trav').some((r) => r.section === section)).to.be.false;
  });

  it('announces readiness', () => {
    const { container } = setup();
    const spy = sinon.spy();
    document.addEventListener('nx-cards-ready', spy);
    attachCardSearch(container);
    document.removeEventListener('nx-cards-ready', spy);
    expect(spy.calledOnce).to.be.true;
  });
});

describe('site hash', () => {
  it('adds the page hash to site tools in the cards block', async () => {
    setHash('#/org/site');
    const el = await buildBlock(
      row()
      + row({ title: '<a href="https://da.live/apps/scheduler">Scheduler</a>' })
      + row({ title: '<a href="https://labs.aem.live/tools/x">Labs</a>' }),
    );
    expect(cards(el).map((c) => c.action)).to.deep.equal([
      local('/apps/traverse#/org/site'),
      'https://da.live/apps/scheduler#/org/site',
      'https://labs.aem.live/tools/x',
    ]);
  });

  it('opens menu entries in a new tab: tool url with the page hash, learn more unchanged', async () => {
    setHash('#/org/site');
    const stub = sinon.stub(window, 'open');
    const el = await buildBlock(row());
    const [card] = cards(el);
    card.dispatchEvent(new CustomEvent('select', { detail: { id: 'open-new-tab' }, bubbles: true }));
    card.dispatchEvent(new CustomEvent('select', { detail: { id: 'learn-more' }, bubbles: true }));
    expect(stub.firstCall.args).to.deep.equal([local('/apps/traverse#/org/site'), '_blank', 'noopener']);
    expect(stub.secondCall.args).to.deep.equal(['https://www.adobe.com/learn', '_blank', 'noopener']);
  });

  it('updates the links when the page hash changes', async () => {
    setHash('#/org/site');
    const el = await buildBlock(row());
    setHash('#/org/other');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(cards(el)[0].action).to.equal(local('/apps/traverse#/org/other'));
  });
});
