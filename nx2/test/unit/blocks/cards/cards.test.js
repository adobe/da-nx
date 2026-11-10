import { expect } from '@esm-bundle/chai';
import { setConfig } from '../../../../scripts/nx.js';

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

const cards = (el) => [...el.querySelectorAll(':scope > nx-tool-card')];

afterEach(() => {
  document.body.innerHTML = '';
});

describe('cards block', () => {
  it('renders one nx-tool-card per row in a list', async () => {
    const el = await buildBlock(row() + row());
    expect(el.getAttribute('role')).to.equal('list');
    expect(cards(el).length).to.equal(2);
    cards(el).forEach((c) => expect(c.getAttribute('role')).to.equal('listitem'));
    expect(el.querySelectorAll(':scope > div').length).to.equal(0);
  });

  it('maps the row to card properties', async () => {
    const el = await buildBlock(row({ icon: 'icon-TreeView', em: '<em>#F4EBFC</em>' }));
    const [card] = cards(el);
    expect(card.heading).to.equal('Traverse');
    expect(card.description).to.equal('Get a birds eye view.');
    expect(card.href).to.equal(new URL('/apps/traverse', window.location.href).href);
    expect(card.learnMoreHref).to.equal('https://www.adobe.com/learn');
    expect(card.icon).to.equal('TreeView');
    expect(card.tint).to.equal('#F4EBFC');
  });

  it('leaves optional properties unset', async () => {
    const el = await buildBlock(row({ title: 'Plain', learnMore: '' }));
    const [card] = cards(el);
    expect(card.heading).to.equal('Plain');
    expect(card.href).to.equal(undefined);
    expect(card.learnMoreHref).to.equal(undefined);
    expect(card.tint).to.equal(undefined);
  });

  it('adds the by adobe byline for the tools variant', async () => {
    const el = await buildBlock(row());
    const [card] = cards(el);
    expect(card.byline).to.equal('By Adobe');
    expect(card.bylineIcon).to.equal('byadobe');
  });

  it('has no byline without the tools variant', async () => {
    const el = await buildBlock(row(), '');
    expect(cards(el)[0].byline).to.equal(undefined);
  });

  it('answers the cards-filter search', async () => {
    const el = await buildBlock(row() + row({ title: '<a href="/apps/bulk">Bulk Operations</a>', desc: 'Preview.' }));
    const results = [];
    document.dispatchEvent(new CustomEvent('nx-cards-filter', { detail: { query: 'trav', results } }));
    expect(cards(el).map((c) => c.hidden)).to.deep.equal([false, true]);
    expect(results.find((r) => r.section === el.closest('.section')).count).to.equal(1);
  });
});
