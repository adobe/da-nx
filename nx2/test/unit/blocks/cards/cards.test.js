import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setConfig, getConfig } from '../../../../scripts/nx.js';

await setConfig({ hostnames: [] });
const { default: init } = await import('../../../../blocks/cards/cards.js');
const { attachCardSearch } = await import('../../../../blocks/cards/search.js');

const { codeBase } = getConfig();

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

async function buildBlock(rowsHtml, variant = 'tools') {
  const section = document.createElement('div');
  section.className = 'section';
  const el = document.createElement('div');
  el.className = `nx-cards ${variant}`.trim();
  el.innerHTML = rowsHtml;
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
    expect(card.icon).to.equal(`${codeBase}/img/icons/s2-icon-treeview-20-n.svg`);
    expect(card.tint).to.equal('#F4EBFC');
    expect(card.action).to.equal(new URL('/apps/traverse', window.location.href).href);
    expect(card.actionLabel).to.equal('Open');
  });

  it('skips icons with unsafe names', async () => {
    const section = document.createElement('div');
    section.className = 'section';
    const el = document.createElement('div');
    el.className = 'nx-cards tools';
    el.innerHTML = row();
    el.querySelector('span.icon').className = 'icon icon-s2"><img';
    section.append(el);
    document.body.append(section);
    await init(el);
    expect(cards(el)[0].icon).to.equal(undefined);
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

  it('opens the selected menu entry in a new tab', async () => {
    const stub = sinon.stub(window, 'open');
    const el = await buildBlock(row());
    const [card] = cards(el);
    card.dispatchEvent(new CustomEvent('select', { detail: { id: 'learn-more' }, bubbles: true }));
    card.dispatchEvent(new CustomEvent('select', { detail: { id: 'open-new-tab' }, bubbles: true }));
    expect(stub.firstCall.args).to.deep.equal(['https://www.adobe.com/learn', '_blank', 'noopener']);
    expect(stub.secondCall.args).to.deep.equal([new URL('/apps/traverse', window.location.href).href, '_blank', 'noopener']);
  });

  it('puts the by adobe byline into the extra slot for the tools variant', async () => {
    const el = await buildBlock(row());
    const extra = cards(el)[0].querySelector('[slot="extra"]');
    expect(extra.querySelector('.byline-text').textContent).to.equal('By Adobe');
    expect(extra.querySelector('use').getAttribute('href')).to.equal(`${codeBase}/img/icons/s2-icon-byadobe-20-n.svg#icon`);
    expect(getComputedStyle(extra.querySelector('svg')).width).to.equal('18px');
  });

  it('has no extra content without the tools variant', async () => {
    const el = await buildBlock(row(), '');
    expect(cards(el)[0].querySelector('[slot="extra"]')).to.equal(null);
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
  let siteHash;
  const original = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const setHash = (hash) => window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
  const local = (path) => new URL(path, window.location.href).href;

  before(async () => {
    siteHash = await import('../../../../blocks/cards/site-hash.js');
  });

  afterEach(() => window.history.replaceState(null, '', original));

  it('withSiteHash replaces the url hash with the page hash', () => {
    setHash('#/org/site');
    expect(siteHash.withSiteHash('/apps/traverse')).to.equal(local('/apps/traverse#/org/site'));
    expect(siteHash.withSiteHash('https://example.com/app#old')).to.equal('https://example.com/app#/org/site');
  });

  it('withSiteHash leaves the url alone without a page hash', () => {
    setHash('');
    expect(siteHash.withSiteHash('/apps/traverse')).to.equal('/apps/traverse');
  });

  it('withSiteHash leaves unparsable urls alone', () => {
    setHash('#/org/site');
    expect(siteHash.withSiteHash('http://')).to.equal('http://');
  });

  it('isSiteTool matches this site, da.live and author.aem.live only', () => {
    expect(siteHash.isSiteTool('/apps/traverse')).to.be.true;
    expect(siteHash.isSiteTool('https://da.live/apps/scheduler')).to.be.true;
    expect(siteHash.isSiteTool('https://author.aem.live/x')).to.be.true;
    expect(siteHash.isSiteTool('https://labs.aem.live/tools/x')).to.be.false;
    expect(siteHash.isSiteTool('https://stage.da.live/x')).to.be.false;
    expect(siteHash.isSiteTool('https://www.aem.live/tools/rum/explorer.html')).to.be.false;
  });

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

  it('opens the hashed url in a new tab but leaves learn more alone', async () => {
    setHash('#/org/site');
    const stub = sinon.stub(window, 'open');
    const el = await buildBlock(row());
    const [card] = cards(el);
    card.dispatchEvent(new CustomEvent('select', { detail: { id: 'open-new-tab' }, bubbles: true }));
    card.dispatchEvent(new CustomEvent('select', { detail: { id: 'learn-more' }, bubbles: true }));
    expect(stub.firstCall.args[0]).to.equal(local('/apps/traverse#/org/site'));
    expect(stub.secondCall.args[0]).to.equal('https://www.adobe.com/learn');
  });

  it('updates the links when the page hash changes', async () => {
    setHash('#/org/site');
    const el = await buildBlock(row());
    setHash('#/org/other');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(cards(el)[0].action).to.equal(local('/apps/traverse#/org/other'));
  });
});
