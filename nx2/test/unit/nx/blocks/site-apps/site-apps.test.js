import { expect } from '@esm-bundle/chai';
import { setConfig, getConfig } from '../../../../../scripts/nx.js';

await setConfig({ hostnames: [] });
// daFetch uses the nx1 IMS module, which the test import map does not mock, so the
// config fetch is covered by a live check; rendering is tested through renderApps.
const { default: init, renderApps } = await import('../../../../../../nx/blocks/site-apps/site-apps.js');

const APPS = [
  { title: 'Bulk Helper', description: 'Bulk things.', path: '/tools/bulk', image: '/media/bulk.jpeg' },
  { title: 'Feature App', description: 'Branch only.', path: '/tools/feature', ref: 'feature' },
  { title: 'Plain App', description: 'No image.', path: 'https://example.com/app', ref: 'main' },
];

function build() {
  const main = document.createElement('main');
  main.innerHTML = `
    <div class="section"><div class="default-content"><h2 id="your-apps">Your Apps</h2></div>
      <div class="block-content"><div class="nx-site-apps"><div><div></div></div></div></div></div>`;
  document.body.append(main);
  return { main, el: main.querySelector('.nx-site-apps') };
}

const cards = (el) => [...el.querySelectorAll(':scope > nx-action-card')];

// Element presence is asserted as booleans (`!!el`): the test reporter crashes printing DOM nodes.
const original = `${window.location.pathname}${window.location.search}${window.location.hash}`;
const setHash = (hash) => window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
const local = (path) => new URL(path, window.location.href).href;

afterEach(() => {
  document.body.innerHTML = '';
  window.history.replaceState(null, '', original);
});

describe('site-apps init', () => {
  it('removes its section without a site hash', async () => {
    setHash('');
    const { main, el } = build();
    await init(el);
    expect(!!main.querySelector('.section')).to.be.false;
  });
});

describe('site-apps renderApps', () => {
  it('renders an nx-action-card per allowed app in a list', () => {
    const { el } = build();
    renderApps({ el, apps: APPS });
    expect(cards(el).map((c) => c.heading)).to.deep.equal(['Bulk Helper', 'Plain App']);
    expect(el.getAttribute('role')).to.equal('list');
    expect(el.querySelectorAll(':scope > div').length).to.equal(0);
  });

  it('maps app data to card properties', () => {
    const { el } = build();
    renderApps({ el, apps: APPS });
    const [first] = cards(el);
    expect(first.description).to.equal('Bulk things.');
    expect(first.action).to.equal('/tools/bulk');
    expect(first.actionLabel).to.equal('Open');
    expect(first.menu ?? []).to.deep.equal([]);
    expect(first.getAttribute('role')).to.equal('listitem');
  });

  it('uses the configured image as an untinted icon', () => {
    const { el } = build();
    renderApps({ el, apps: APPS });
    const [first] = cards(el);
    const img = first.querySelector(':scope > img[slot="icon"]');
    expect([img.getAttribute('src'), img.getAttribute('alt')]).to.deep.equal(['/media/bulk.jpeg', '']);
    expect(first.tint).to.equal(undefined);
  });

  it('falls back to the tools icon on a light blue tile', () => {
    const { el } = build();
    renderApps({ el, apps: APPS });
    const [, second] = cards(el);
    const fallback = second.querySelector(':scope > svg[slot="icon"]');
    expect(fallback.querySelector('use').getAttribute('href')).to.equal(`${getConfig().codeBase}/img/icons/s2-icon-tools-20-n.svg#icon`);
    expect(fallback.getAttribute('aria-hidden')).to.equal('true');
    expect(second.tint).to.equal('#E5F0FE');
  });

  it('puts by admin into the extra slot', () => {
    const { el } = build();
    renderApps({ el, apps: APPS });
    expect(cards(el)[0].querySelector('[slot="extra"]').textContent).to.equal('By Admin');
  });

  it('renders nothing for an empty list', () => {
    const { el } = build();
    renderApps({ el, apps: [] });
    expect(cards(el).length).to.equal(0);
  });

  it('answers the cards-filter search', () => {
    const { el } = build();
    renderApps({ el, apps: APPS });
    const results = [];
    document.dispatchEvent(new CustomEvent('nx-cards-filter', { detail: { query: 'plain', results } }));
    expect(cards(el).map((c) => c.hidden)).to.deep.equal([true, false]);
    expect(getComputedStyle(cards(el)[0]).display).to.equal('none');
    expect(results.find((r) => r.section === el.closest('.section')).count).to.equal(1);
  });
});

describe('site-apps site hash', () => {
  it('always adds the page hash to the app url', () => {
    setHash('#/org/site');
    const { el } = build();
    renderApps({ el, apps: APPS });
    expect(cards(el).map((c) => c.action)).to.deep.equal([
      local('/tools/bulk#/org/site'),
      'https://example.com/app#/org/site',
    ]);
  });

  it('updates the app urls when the page hash changes', () => {
    setHash('#/org/site');
    const { el } = build();
    renderApps({ el, apps: APPS });
    setHash('#/org/other');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(cards(el)[0].action).to.equal(local('/tools/bulk#/org/other'));
  });
});
