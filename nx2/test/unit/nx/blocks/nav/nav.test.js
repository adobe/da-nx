import { expect } from '@esm-bundle/chai';
import { setConfig } from '../../../../../scripts/nx.js';
import { getHomeHref } from '../../../../../utils/utils.js';

// fragment.js (a transitive dependency of nav.js) captures getConfig() into a
// module-level constant at import time, so setConfig() must resolve before
// nav.js is ever imported — see the same pattern in feedback.test.js.
await setConfig({ hostnames: [] });
await import('../../../../../blocks/nav/nav.js');
await import('../../../../../blocks/sidenav/sidenav.js');

function buildActionsSection({ buttonHtml }) {
  const section = document.createElement('div');
  section.innerHTML = `<ul><li>${buttonHtml}</li></ul>`;
  return section;
}

function mockFragmentFetch(html = '<div><p>Help content</p></div>') {
  const originalFetch = window.fetch;
  window.fetch = async (url, opts) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    if (urlStr.includes('/fragments/nav/')) {
      return new Response(`<html><body><main>${html}</main></body></html>`, {
        status: 200,
        headers: new Headers({ 'Content-Type': 'text/html' }),
      });
    }
    return originalFetch.call(window, url, opts);
  };
  return () => { window.fetch = originalFetch; };
}

describe('nav search slot', () => {
  let nav;
  let originalHref;

  beforeEach(() => {
    originalHref = window.location.href;
    nav = document.createElement('nx-nav');
    nav.loadNav = async () => { };
  });

  afterEach(() => {
    nav.remove();
    window.history.replaceState(null, '', originalHref);
  });

  it('shares a configurable Home destination and leaves other consumers unchanged', async () => {
    try {
      await setConfig({ homeHref: () => '/?landing=true&nx=lp#/org/site' });
      const section = document.createElement('div');
      section.innerHTML = '<a href="/">Brand</a>';
      const brand = await nav.decorateBrand(section);
      expect(brand.getAttribute('href')).to.equal('/?landing=true&nx=lp#/org/site');
      expect(brand.textContent).to.equal('Brand');
      expect(brand.querySelector('.brand-logo')).to.equal(null);
      expect(getHomeHref()).to.equal('/?landing=true&nx=lp#/org/site');
      await setConfig({ homeHref: '/custom-home' });
      expect(getHomeHref()).to.equal('/custom-home');
      await setConfig({});
      expect(getHomeHref()).to.equal('/');
      expect(getHomeHref({ fallback: '/original-home' })).to.equal('/original-home');
    } finally {
      await setConfig({ hostnames: [] });
    }
  });

  async function mount(path) {
    window.history.replaceState(null, '', path);
    document.body.append(nav);
    await nav.updateComplete;
  }

  async function settleSlots() {
    await new Promise((resolve) => { setTimeout(resolve); });
  }

  it('renders configured branding in the shell without a landing component or fragment brand', async () => {
    try {
      await setConfig({
        brand: {
          title: 'Example Product',
          logoHref: '/nx2/img/favicons/favicon.ico',
          logoSize: 24,
        },
        homeHref: '/custom-home',
      });
      nav._brand = await nav.decorateBrand(document.createElement('div'));
      await mount('/canvas');
      const brand = nav.shadowRoot.querySelector('.brand-area');
      expect(brand.getAttribute('aria-label')).to.equal('Example Product home');
      expect(brand.getAttribute('href')).to.equal('/custom-home');
      expect(brand.querySelector('.brand-label').textContent).to.equal('Example Product');
      const logo = brand.querySelector('img');
      expect(logo.getAttribute('src')).to.equal('/nx2/img/favicons/favicon.ico');
      expect([logo.width, logo.height, logo.alt]).to.deep.equal([24, 24, '']);
      const style = getComputedStyle(brand);
      expect([style.fontSize, style.fontWeight, style.lineHeight]).to.deep.equal([
        '14px', '700', '18px',
      ]);
      const mark = brand.querySelector('.brand-logo').getBoundingClientRect();
      expect([mark.width, mark.height]).to.deep.equal([32, 32]);
    } finally {
      await setConfig({ hostnames: [] });
    }
  });

  it('keeps the configured title and logo size across page routes and fragment reloads', async () => {
    try {
      await setConfig({
        brand: { title: 'Example Product', logoHref: '/nx2/img/favicons/favicon.ico' },
      });
      const section = document.createElement('div');
      section.innerHTML = '<a href="/">Original author brand</a>';
      for (const path of ['/', '/canvas', '/sheet', '/media', '/apps']) {
        nav._brand = await nav.decorateBrand(section);
        await mount(`${path}?nx=lp#/org/site`);
        const brand = nav.shadowRoot.querySelector('.brand-area');
        expect(brand.querySelector('.brand-label').textContent).to.equal('Example Product');
        expect(brand.textContent).not.to.include('Original author brand');
        expect(brand.querySelectorAll('img')).to.have.length(1);
        expect(brand.querySelector('img').width).to.equal(24);
      }
    } finally {
      await setConfig({ hostnames: [] });
    }
  });

  it('provides an empty search slot without a fragment or loaded profile', async () => {
    await mount('/');
    const slot = nav.shadowRoot.querySelector('slot[name="search"]');
    expect(slot).to.exist;
    expect(slot.closest('.action-area')).to.be.null;
    expect(slot.assignedElements()).to.deep.equal([]);
    expect(nav.shadowRoot.querySelector('nx-search')).to.be.null;
  });

  it('renders independently of the page route', async () => {
    await mount('/edit');
    expect(nav.shadowRoot.querySelector('.nav-search')).to.exist;
  });

  it('keeps consumer context on the left without moving centered search or replacing branding', async () => {
    nav._brand = document.createElement('a');
    nav._brand.className = 'brand-area';
    nav._brand.textContent = 'Brand';
    nav._breadcrumbs = document.createElement('span');
    nav._breadcrumbs.textContent = 'Breadcrumbs';
    nav._getSegments = () => [];
    const context = document.createElement('button');
    context.slot = 'context';
    context.textContent = 'Context';
    const field = document.createElement('input');
    field.slot = 'search';
    nav.append(context, field);
    nav.style.width = '1200px';
    await mount('/');
    await settleSlots();
    const contextSlot = nav.shadowRoot.querySelector('slot[name="context"]');
    const searchSlot = nav.shadowRoot.querySelector('slot[name="search"]');
    expect(contextSlot.closest('.brand-cluster')).to.exist;
    expect(contextSlot.assignedElements()).to.deep.equal([context]);
    expect(searchSlot.assignedElements()).to.deep.equal([field]);
    expect(nav._brand.isConnected).to.be.true;
    expect(nav._breadcrumbs.isConnected).to.be.true;
    const navRect = nav.getBoundingClientRect();
    const searchRect = nav.shadowRoot.querySelector('.nav-search').getBoundingClientRect();
    expect(context.getBoundingClientRect().right).to.be.lessThan(searchRect.left);
    expect(searchRect.left + searchRect.width / 2)
      .to.be.closeTo(navRect.left + navRect.width / 2, 1);
    context.remove();
    await settleSlots();
    expect(contextSlot.assignedElements()).to.deep.equal([]);
    expect(searchSlot.assignedElements()).to.deep.equal([field]);
    expect(nav.hasAttribute('data-has-search')).to.be.true;
  });

  it('uses the configured Home for the sidebar without changing Apps or its click behavior', async () => {
    await mount('/#/org/site/page');
    const sidenav = document.createElement('nx-sidenav');
    sidenav.loadNav = async () => {};
    const home = { text: 'Home', href: `${window.location.origin}/` };
    const apps = { text: 'Apps', href: `${window.location.origin}/apps` };
    sidenav._navLinks = [home, apps];
    try {
      await setConfig({ homeHref: () => '/?landing=true&nx=lp#/org/site' });
      document.body.append(sidenav);
      await sidenav.updateComplete;
      const [homeLink, appsLink] = sidenav.shadowRoot.querySelectorAll('a');
      expect(homeLink.getAttribute('href')).to.equal('/?landing=true&nx=lp#/org/site');
      expect(appsLink.href).to.equal(apps.href);
      let prevented = false;
      const event = { currentTarget: homeLink, preventDefault: () => { prevented = true; } };
      sidenav.handleClick(event, home);
      expect(prevented).to.equal(false);
      expect(homeLink.search).to.equal('?landing=true&nx=lp');
    } finally {
      sidenav.remove();
      await setConfig({ hostnames: [] });
    }
  });

  it('uses consumer branding when supplied and restores the fragment brand when removed', async () => {
    const fallback = document.createElement('a');
    fallback.textContent = 'Default brand';
    nav._brand = fallback;
    await mount('/');
    const slot = nav.shadowRoot.querySelector('slot[name="brand"]');
    expect(slot.querySelector('a')).to.equal(fallback);
    expect(slot.assignedElements()).to.deep.equal([]);
    const custom = document.createElement('a');
    custom.slot = 'brand';
    custom.textContent = 'Consumer brand';
    nav.append(custom);
    await settleSlots();
    expect(slot.assignedElements()).to.deep.equal([custom]);
    expect(slot.querySelector('a')).to.equal(fallback);
    custom.remove();
    await settleSlots();
    expect(slot.assignedElements()).to.deep.equal([]);
    expect(slot.querySelector('a')).to.equal(fallback);
  });

  it('keeps consumer-owned search content assigned across navigation', async () => {
    await mount('/#/adobe/site/products');
    const field = document.createElement('input');
    field.type = 'search';
    field.slot = 'search';
    field.value = 'project plan';
    nav.append(field);
    const slot = nav.shadowRoot.querySelector('slot[name="search"]');
    expect(slot.assignedElements()).to.deep.equal([field]);
    window.history.replaceState(null, '', '/#/adobe/site/images');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await nav.updateComplete;
    expect(field.value).to.equal('project plan');
    expect(slot.assignedElements()).to.deep.equal([field]);
  });

  it('reclaims empty search space and keeps actions at their natural width', async () => {
    await mount('/');
    const brand = nav.shadowRoot.querySelector('.brand-cluster');
    const actions = nav.shadowRoot.querySelector('.action-area');
    const search = nav.shadowRoot.querySelector('.nav-search');
    brand.innerHTML = '<span style="width: 56px; flex-shrink: 0">Brand</span>';
    actions.innerHTML = '<span style="display: block; width: 240px">Actions</span>';
    actions.style.display = 'block';
    nav.style.setProperty('--s2-spacing-100', '8px');
    for (const width of [900, 480, 320]) {
      nav.style.width = `${width}px`;
      const hostRect = nav.getBoundingClientRect();
      const brandRect = brand.getBoundingClientRect();
      const actionsRect = actions.getBoundingClientRect();
      expect(getComputedStyle(search).display).to.equal('none');
      expect(actionsRect.width).to.equal(240);
      expect(actionsRect.right).to.be.closeTo(hostRect.right, 1);
      expect(brandRect.width).to.be.closeTo(width - 248, 1);
      expect(brandRect.right + 8).to.be.closeTo(actionsRect.left, 1);
    }
    actions.style.display = 'none';
    expect(brand.getBoundingClientRect().width).to.equal(320);
  });

  it('switches layouts when search is added, removed, or reassigned', async () => {
    await mount('/');
    const search = nav.shadowRoot.querySelector('.nav-search');
    const field = document.createElement('input');
    field.type = 'search';
    field.slot = 'search';
    expect(getComputedStyle(nav).display).to.equal('flex');
    nav.append(field);
    await settleSlots();
    expect(getComputedStyle(nav).display).to.equal('grid');
    expect(getComputedStyle(search).display).not.to.equal('none');
    field.slot = 'other';
    await settleSlots();
    expect(getComputedStyle(nav).display).to.equal('flex');
    expect(getComputedStyle(search).display).to.equal('none');
    field.slot = 'search';
    await settleSlots();
    expect(getComputedStyle(nav).display).to.equal('grid');
    field.remove();
    await settleSlots();
    expect(getComputedStyle(nav).display).to.equal('flex');
    expect(getComputedStyle(search).display).to.equal('none');
  });

  it('keeps square and wide brand SVGs at nav height even when the row grows', async () => {
    await mount('/');
    const brand = nav.shadowRoot.querySelector('.brand-cluster');
    for (const svgWidth of [56, 112]) {
      brand.innerHTML = `<a class="brand-area"><svg viewBox="0 0 ${svgWidth} 56" width="${svgWidth}" height="56"></svg></a>`;
      const svg = brand.querySelector('svg');
      for (const width of [900, 480, 320]) {
        nav.style.width = `${width}px`;
        nav.style.height = width < 600 ? '112px' : '56px';
        expect(svg.getBoundingClientRect().height).to.equal(56);
        expect(svg.getBoundingClientRect().width).to.equal(svgWidth);
      }
    }
    nav.style.height = '40px';
    expect(brand.querySelector('svg').getBoundingClientRect().height).to.equal(40);
  });

  it('centers search with missing or unequal fragment areas at wide and narrow sizes', async () => {
    await mount('/');
    const brand = nav.shadowRoot.querySelector('.brand-cluster');
    const actions = nav.shadowRoot.querySelector('.action-area');
    const search = nav.shadowRoot.querySelector('.nav-search');
    const field = document.createElement('input');
    field.type = 'search';
    field.slot = 'search';
    nav.append(field);
    await settleSlots();
    brand.innerHTML = '<span style="width: 80px">Brand</span>';
    actions.innerHTML = '<span style="width: 160px">Actions</span>';
    nav.style.setProperty('--s2-spacing-100', '8px');
    for (const width of [900, 480]) {
      nav.style.width = `${width}px`;
      for (const [left, right] of [[true, true], [false, true], [true, false], [false, false]]) {
        brand.style.display = left ? 'flex' : 'none';
        actions.style.display = right ? 'block' : 'none';
        const hostRect = nav.getBoundingClientRect();
        const searchRect = search.getBoundingClientRect();
        expect(searchRect.width).to.be.greaterThan(0);
        expect(searchRect.left + searchRect.width / 2)
          .to.be.closeTo(hostRect.left + hostRect.width / 2, 1);
      }
    }
  });
});

describe('nav decorateActions', () => {
  let restoreFetch;
  let nav;

  beforeEach(() => {
    nav = document.createElement('nx-nav');
  });

  afterEach(() => {
    restoreFetch?.();
    document.querySelectorAll('nx-dialog').forEach((el) => el.remove());
  });

  it('wires the generic dialog handler for a Help-style button (unknown data-pathname) and opens a fragment dialog on click', async () => {
    restoreFetch = mockFragmentFetch();
    const section = buildActionsSection({
      buttonHtml: '<button class="nx-dialog auto-block" data-pathname="/fragments/nav/help">Help</button>',
    });
    await nav.decorateActions(section);

    const button = section.querySelector('button');
    button.click();
    await new Promise((r) => { setTimeout(r, 50); });

    expect(document.querySelector('nx-dialog')).to.not.be.null;
  });

  // The plain-label <li> path (no button; e.g. "profile" and now "feedback")
  // dynamically imports `../${name}/${name}.js` with a runtime-computed
  // specifier. This harness's dev-server transform only rewrites bare
  // specifiers (like da-lit) for statically-discoverable imports, so it
  // can't be exercised here without a false failure unrelated to app
  // behavior — verify manually instead (see nav.js's decorateActions).
});
