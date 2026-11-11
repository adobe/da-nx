import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setConfig } from '../../../../../scripts/nx.js';

await setConfig({ hostnames: [] });
// daFetch uses the nx1 IMS module, which the test import map does not mock, so the
// config fetch is covered by a live check; rendering is tested through renderApps.
const { default: init, renderApps } = await import('../../../../../../nx/blocks/site-apps/site-apps.js');

const APPS = [
  { title: 'Bulk Helper', description: 'Bulk things.', path: '/tools/bulk', image: '/media/bulk.svg' },
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

afterEach(() => {
  document.body.innerHTML = '';
  sinon.restore();
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
    const [first, second] = cards(el);
    expect(first.description).to.equal('Bulk things.');
    const img = first.querySelector(':scope > img[slot="icon"]');
    expect(img.getAttribute('src')).to.equal('/media/bulk.svg');
    expect(img.getAttribute('alt')).to.equal('');
    expect(first.action).to.equal('/tools/bulk');
    expect(first.actionLabel).to.equal('Open');
    expect(first.menu).to.deep.equal([{ id: 'open-new-tab', label: 'Open in new tab' }]);
    expect(first.getAttribute('role')).to.equal('listitem');
    expect(!!second.querySelector('[slot="icon"]')).to.be.false;
  });

  it('puts by admin into the extra slot', () => {
    const { el } = build();
    renderApps({ el, apps: APPS });
    expect(cards(el)[0].querySelector('[slot="extra"]').textContent).to.equal('By Admin');
  });

  it('opens the app in a new tab from the menu', () => {
    const stub = sinon.stub(window, 'open');
    const { el } = build();
    renderApps({ el, apps: APPS });
    cards(el)[1].dispatchEvent(new CustomEvent('select', { detail: { id: 'open-new-tab' }, bubbles: true }));
    expect(stub.calledOnceWith('https://example.com/app', '_blank', 'noopener')).to.be.true;
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
  const original = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const setHash = (hash) => window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
  const local = (path) => new URL(path, window.location.href).href;

  afterEach(() => window.history.replaceState(null, '', original));

  it('always adds the page hash to the app url', () => {
    setHash('#/org/site');
    const { el } = build();
    renderApps({ el, apps: APPS });
    expect(cards(el).map((c) => c.action)).to.deep.equal([
      local('/tools/bulk#/org/site'),
      'https://example.com/app#/org/site',
    ]);
  });

  it('opens the hashed app url in a new tab', () => {
    setHash('#/org/site');
    const stub = sinon.stub(window, 'open');
    const { el } = build();
    renderApps({ el, apps: APPS });
    cards(el)[1].dispatchEvent(new CustomEvent('select', { detail: { id: 'open-new-tab' }, bubbles: true }));
    expect(stub.calledOnceWith('https://example.com/app#/org/site', '_blank', 'noopener')).to.be.true;
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
