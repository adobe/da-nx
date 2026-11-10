import { expect } from '@esm-bundle/chai';
import { setConfig } from '../../../../../scripts/nx.js';

await setConfig({ hostnames: [] });
// daFetch uses the nx1 IMS module, which the test import map does not mock, so the
// config fetch is covered by a live check; rendering is tested through renderApps.
const { default: init, renderApps } = await import('../../../../../../nx/blocks/site-apps/site-apps.js');

const APPS = [
  { title: 'Bulk Helper', description: 'Bulk things.', path: '/tools/bulk', image: '/media/bulk.png' },
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

const cards = (el) => [...el.querySelectorAll(':scope > nx-tool-card')];

afterEach(() => {
  document.body.innerHTML = '';
});

describe('site-apps init', () => {
  it('removes its section without a site hash', async () => {
    const { hash } = window.location;
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    const { main, el } = build();
    await init(el);
    expect(main.querySelector('.section')).to.equal(null);
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
  });
});

describe('site-apps renderApps', () => {
  it('renders an nx-tool-card per allowed app in a list', () => {
    const { el } = build();
    renderApps({ el, apps: APPS });
    expect(cards(el).map((c) => c.heading)).to.deep.equal(['Bulk Helper', 'Plain App']);
    expect(el.getAttribute('role')).to.equal('list');
    expect(el.querySelectorAll(':scope > div').length).to.equal(0);
  });

  it('maps app data to card properties', () => {
    const { el } = build();
    renderApps({ el, apps: APPS });
    const [first, second] = cards(el);
    expect(first.description).to.equal('Bulk things.');
    expect(first.href).to.equal('/tools/bulk');
    expect(first.image).to.equal('/media/bulk.png');
    expect(first.byline).to.equal('By Admin');
    expect(first.bylineIcon).to.equal(undefined);
    expect(first.getAttribute('role')).to.equal('listitem');
    expect(second.image).to.equal(undefined);
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
    expect(results.find((r) => r.section === el.closest('.section')).count).to.equal(1);
  });
});
