import { expect } from '@esm-bundle/chai';
import { setConfig } from '../../../../scripts/nx.js';

await setConfig({ hostnames: [] });
const { default: init } = await import('../../../../blocks/cards-filter/cards-filter.js');

// Mirror the global nx2 rule (styles.css) that forces sections to display: block.
const globalSheet = new CSSStyleSheet();
globalSheet.replaceSync('html:has(body.edge) .section { display: block; }');
document.adoptedStyleSheets = [...document.adoptedStyleSheets, globalSheet];
document.body.classList.add('edge');

// Stand-in for cards blocks: reports a match count per section id.
let counts = {};
let events = [];
document.addEventListener('nx-cards-filter', ({ detail }) => {
  events.push(detail.query);
  Object.entries(counts).forEach(([id, count]) => {
    const section = document.getElementById(id);
    if (section) detail.results.push({ section, count });
  });
});

async function setup() {
  const main = document.createElement('main');
  main.innerHTML = `
    <div class="section"><div class="default-content"><h1 id="tools">Tools</h1></div>
      <div class="block-content"><div class="nx-cards-filter"><div><div></div></div></div></div></div>
    <div class="section"><div class="default-content"><h2 id="a">A</h2></div></div>
    <div class="section"><div class="default-content"><h3 id="b">B</h3></div></div>
    <div class="section"><div class="default-content"><p>No heading</p></div></div>
    <div class="section"><div class="default-content"><h2>No id</h2></div></div>`;
  document.body.append(main);
  const el = main.querySelector('.nx-cards-filter');
  await init(el);
  const pills = el.querySelector('nx-segmented-btn');
  const search = el.querySelector('nx-search');
  await pills.updateComplete;
  await search.updateComplete;
  const sections = [...main.querySelectorAll(':scope > .section')];
  return { main, el, pills, search, sections };
}

const select = (pills, value) => {
  pills.value = value;
  pills.dispatchEvent(new CustomEvent('change', { detail: { value } }));
};

const type = (search, value) => {
  search.value = value;
  search.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
};

const visibleIds = (sections) => sections.slice(1).filter((s) => !s.hidden).map((s) => s.id || '-');

afterEach(() => {
  document.body.innerHTML = '';
  counts = {};
  events = [];
});

describe('cards-filter categories', () => {
  it('sets category ids on sections with a heading id', async () => {
    const { sections } = await setup();
    expect(sections.map((s) => s.id)).to.deep.equal(['', 'category-a', 'category-b', '', '']);
  });

  it('builds pills for all and each category', async () => {
    const { el, pills } = await setup();
    expect(pills.items.map((i) => i.value)).to.deep.equal(['all', 'category-a', 'category-b']);
    expect(pills.items.map((i) => i.label)).to.deep.equal(['All', 'A', 'B']);
    expect(pills.value).to.equal('all');
    expect(pills.getAttribute('size')).to.equal('m');
    expect(el.querySelector('nx-search').getAttribute('size')).to.equal('m');
  });

  it('shows only the selected category', async () => {
    const { pills, sections } = await setup();
    select(pills, 'category-b');
    expect(visibleIds(sections)).to.deep.equal(['category-b']);
    expect(sections[0].hidden).to.be.false;
    expect(getComputedStyle(sections[1]).display).to.equal('none');
  });

  it('all shows every section', async () => {
    const { pills, sections } = await setup();
    select(pills, 'category-b');
    select(pills, 'all');
    expect(visibleIds(sections)).to.deep.equal(['category-a', 'category-b', '-', '-']);
  });

  it('drops the pill when its section is removed later', async () => {
    const { pills, sections } = await setup();
    select(pills, 'category-a');
    sections[1].remove();
    await new Promise((r) => { setTimeout(r, 0); });
    expect(pills.items.map((i) => i.value)).to.deep.equal(['all', 'category-b']);
    expect(pills.value).to.equal('all');
    expect(sections[2].hidden).to.be.false;
  });
});

describe('cards-filter search', () => {
  it('resets the category to all and hides sections without matches', async () => {
    const { pills, search, sections } = await setup();
    select(pills, 'category-b');
    counts = { 'category-a': 1, 'category-b': 0 };
    type(search, 'x');
    expect(pills.value).to.equal('all');
    expect(events.at(-1)).to.equal('x');
    expect(visibleIds(sections)).to.deep.equal(['category-a']);
  });

  it('shows everything again when the search is cleared', async () => {
    const { search, sections } = await setup();
    counts = { 'category-a': 0, 'category-b': 0 };
    type(search, 'x');
    type(search, '');
    expect(visibleIds(sections)).to.deep.equal(['category-a', 'category-b', '-', '-']);
  });

  it('selecting a category clears the search', async () => {
    const { pills, search, sections } = await setup();
    counts = { 'category-a': 0, 'category-b': 1 };
    type(search, 'x');
    select(pills, 'category-a');
    expect(search.value).to.equal('');
    expect(events.at(-1)).to.equal('');
    expect(visibleIds(sections)).to.deep.equal(['category-a']);
  });

  it('announces the empty state when nothing matches', async () => {
    const { el, search } = await setup();
    const empty = el.querySelector('.cards-filter-empty');
    expect(empty.getAttribute('role')).to.equal('status');
    expect(empty.hidden).to.be.false;
    expect(empty.textContent).to.equal('');
    counts = { 'category-a': 0, 'category-b': 0 };
    type(search, 'zzz');
    expect(empty.textContent.trim()).to.equal('No tools found');
    counts = { 'category-a': 1 };
    type(search, 'zz');
    expect(empty.textContent).to.equal('');
  });

  it('re-sends the query when a cards block is ready', async () => {
    const { search } = await setup();
    type(search, 'x');
    events = [];
    document.dispatchEvent(new CustomEvent('nx-cards-ready'));
    expect(events).to.deep.equal(['x']);
  });

  it('does not re-send an empty query', async () => {
    await setup();
    document.dispatchEvent(new CustomEvent('nx-cards-ready'));
    expect(events).to.deep.equal([]);
  });
});
