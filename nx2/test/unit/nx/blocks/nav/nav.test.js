import { expect } from '@esm-bundle/chai';
import { setConfig } from '../../../../../scripts/nx.js';
import { getHomeHref } from '../../../../../utils/utils.js';

// fragment.js (a transitive dependency of nav.js) captures getConfig() into a
// module-level constant at import time, so setConfig() must resolve before
// nav.js is ever imported — see the same pattern in feedback.test.js.
await setConfig({ hostnames: [] });
await import('../../../../../blocks/breadcrumb/breadcrumb.js');
const { default: NxBreadcrumb } = await import('../../../../../blocks/shared/breadcrumb/breadcrumb.js');
// Isolate nav composition from the components' auth and lifecycle behavior.
['nx-nav-test', 'nx-editortoggle'].forEach((tag) => {
  customElements.define(tag, class extends HTMLElement {});
});
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

describe('nav site navigation', () => {
  let nav;
  let restoreFetch;
  let originalHref;

  beforeEach(() => {
    originalHref = window.location.href;
    nav = document.createElement('nx-nav');
  });

  afterEach(() => {
    nav.remove();
    restoreFetch?.();
    window.history.replaceState(null, '', originalHref);
    document.querySelectorAll('nx-dialog').forEach((el) => el.remove());
  });

  async function mountFragment({
    middle, breadcrumb = '', actions = '<li><button type="button">Action</button></li>',
  } = {}) {
    restoreFetch = mockFragmentFetch(`
      <div><p><a href="/">Brand</a></p>${breadcrumb ? `<ul>${breadcrumb}</ul>` : ''}</div>
      ${middle === undefined ? '' : `<div>${middle}</div>`}
      <div><ul>${actions}</ul></div>
    `);
    nav.path = '/fragments/nav/site-navigation';
    await nav.loadNav();
    nav.loadNav = async () => {};
    document.body.append(nav);
    await nav.updateComplete;
  }

  it('populates the middle section directly after the brand, using action decoration instead of legacy breadcrumbs', async () => {
    await mountFragment({
      middle: `<ul>
        <li>nav-test</li>
        <li><nx-nav-test data-test="authored"></nx-nav-test></li>
        <li><button data-pathname="/fragments/nav/help">Site help</button></li>
      </ul>`,
      breadcrumb: '<li>breadcrumbs</li>',
    });

    const cluster = nav.shadowRoot.querySelector('.brand-cluster');
    const siteNav = cluster.querySelector('.site-nav');
    const actions = nav.shadowRoot.querySelector('.action-area');
    expect(cluster.firstElementChild).to.equal(nav._brand);
    expect(nav._brand.nextElementSibling).to.equal(siteNav);
    expect(siteNav.querySelector('ul')).to.equal(nav._siteNav);
    expect(siteNav.querySelectorAll('nx-nav-test')).to.have.length(2);
    expect(siteNav.querySelector('[data-test="authored"]')).to.exist;
    expect(siteNav.querySelector('nx-editortoggle')).to.be.null;
    expect(siteNav.querySelector('nx-breadcrumb')).to.be.null;
    expect(actions.querySelectorAll('nx-editortoggle')).to.have.length(1);
    expect(getComputedStyle(actions.querySelector('ul')).marginRight).to.equal('16px');

    const button = siteNav.querySelector('button');
    expect(button.classList.contains('has-label')).to.be.true;
    button.click();
    await new Promise((resolve) => { setTimeout(resolve, 50); });
    expect(document.querySelector('nx-dialog')).to.exist;
  });

  [
    { name: 'two-section breadcrumb markers', breadcrumb: '<li><a href="/browse">breadcrumbs</a></li>' },
    { name: 'existing breadcrumb elements', breadcrumb: '<li><nx-breadcrumb></nx-breadcrumb></li>' },
    { name: 'empty middle lists', middle: '<ul><li><br></li></ul>', breadcrumb: '<li class="breadcrumbs">Browse</li>' },
    { name: 'legacy-only middle sections', middle: '<ul><li>breadcrumbs</li></ul>' },
    { name: 'classed legacy-only middle sections', middle: '<ul><li class="breadcrumbs">Browse</li></ul>' },
  ].forEach(({ name, ...fragment }) => {
    it(`keeps route-aware breadcrumbs for ${name}`, async () => {
      window.history.replaceState(null, '', '/?preview=true#/adobe/site/docs');
      await mountFragment(fragment);
      const breadcrumb = nav.shadowRoot.querySelector('.site-nav nx-breadcrumb');
      expect(breadcrumb).to.exist;
      expect(nav._siteNav).to.be.null;
      expect(breadcrumb.pathSegments).to.deep.equal(['adobe', 'site', 'docs']);

      window.history.replaceState(null, '', '/?preview=true#/adobe/site/images');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      await nav.updateComplete;
      expect(breadcrumb.pathSegments).to.deep.equal(['adobe', 'site', 'images']);
      if (fragment.breadcrumb?.includes('href="/browse"')) {
        await breadcrumb.updateComplete;
        const { href } = breadcrumb.shadowRoot.querySelector('a');
        expect(href).to.equal(`${window.location.origin}/browse?preview=true#/adobe`);
      }
    });
  });

  it('loads named breadcrumbs through the block wrapper and updates their route', async () => {
    nav.decorateBreadcrumbs = () => { throw new Error('Legacy decoration should not run'); };
    window.history.replaceState(null, '', '/#/adobe/site/docs');
    await mountFragment({ middle: '<ul><li>breadcrumb</li></ul>' });
    const breadcrumb = nav.shadowRoot.querySelector('.site-nav nx-breadcrumb');
    expect(breadcrumb).to.be.instanceOf(NxBreadcrumb);
    expect(breadcrumb.pathSegments).to.deep.equal(['adobe', 'site', 'docs']);

    window.history.replaceState(null, '', '/#/adobe/site/images');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await nav.updateComplete;
    expect(breadcrumb.pathSegments).to.deep.equal(['adobe', 'site', 'images']);
  });

  [
    { href: 'https://da.live/', baseUrl: 'https://da.live/' },
    { href: '/browse', baseUrl: `${window.location.origin}/browse` },
  ].forEach(({ href, baseUrl }) => {
    it(`preserves ${href} as the site-nav breadcrumb destination from canvas`, async () => {
      window.history.replaceState(null, '', '/canvas?nx=nxnav#/adobe/site/docs');
      await mountFragment({
        middle: `<ul><li><a href="${href}">breadcrumb</a></li></ul>`,
      });
      const breadcrumb = nav._siteNav.querySelector('nx-breadcrumb');
      await breadcrumb.updateComplete;
      expect(breadcrumb.baseUrl).to.equal(baseUrl);
      expect([...breadcrumb.shadowRoot.querySelectorAll('a')].map((link) => link.href))
        .to.deep.equal([
          `${baseUrl}?nx=nxnav#/adobe`,
          `${baseUrl}?nx=nxnav#/adobe/site`,
        ]);
    });
  });

  it('keeps an authored site-nav breadcrumb alongside other components without legacy decoration', async () => {
    nav.decorateBreadcrumbs = () => { throw new Error('Legacy decoration should not run'); };
    window.history.replaceState(null, '', '/#/adobe/site/docs');
    await mountFragment({
      middle: `<ul>
        <li><nx-breadcrumb data-test="authored"></nx-breadcrumb></li>
        <li>nav-test</li>
      </ul>`,
      breadcrumb: '<li><a href="/browse">breadcrumbs</a></li>',
    });
    const breadcrumb = nav._siteNav.querySelector('nx-breadcrumb');
    expect(nav._breadcrumbs).to.be.null;
    expect(breadcrumb.dataset.test).to.equal('authored');
    expect(breadcrumb.pathSegments).to.deep.equal(['adobe', 'site', 'docs']);
    expect(nav._siteNav.querySelector('nx-nav-test')).to.exist;
    expect(nav._siteNav.children).to.have.length(2);
  });

  it('treats a lone authored breadcrumb inside site-nav as a normal component', async () => {
    nav.decorateBreadcrumbs = () => { throw new Error('Legacy decoration should not run'); };
    window.history.replaceState(null, '', '/#/adobe/site/docs');
    await mountFragment({
      middle: '<ul><li class="breadcrumbs"><nx-breadcrumb></nx-breadcrumb></li></ul>',
    });
    expect(nav._breadcrumbs).to.be.null;
    expect(nav._siteNav.querySelector('nx-breadcrumb').pathSegments)
      .to.deep.equal(['adobe', 'site', 'docs']);
  });

  it('skips failed components without losing later siblings, the brand, or either nav area', async () => {
    await mountFragment({
      middle: '<ul><li>nav-missing-component</li><li>nav-test</li></ul>',
      actions: '<li>nav-missing-action</li><li>nav-test</li><li><button>Action</button></li>',
    });
    expect(nav._brand.textContent).to.equal('Brand');
    expect(nav._siteNav.children).to.have.length(1);
    expect(nav._siteNav.querySelector('nx-nav-test')).to.exist;
    expect(nav._actions.querySelector('nx-nav-test')).to.exist;
    expect(nav._actions.querySelector('button').textContent).to.equal('Action');
    expect(nav._actions.querySelector('nx-editortoggle')).to.exist;
    expect(nav._actions.children).to.have.length(3);
  });

  it('preserves the current nav when reloading its fragment fails', async () => {
    const loadNav = nav.loadNav.bind(nav);
    await mountFragment({ middle: '<ul><li>nav-test</li></ul>' });
    const { _brand, _siteNav, _actions } = nav;
    window.fetch = async () => { throw new TypeError('Network unavailable'); };
    await loadNav();
    expect(nav._brand).to.equal(_brand);
    expect(nav._siteNav).to.equal(_siteNav);
    expect(nav._actions).to.equal(_actions);
  });

  it('starts all areas together and retains the current nav until the reload completes', async () => {
    const loadNav = nav.loadNav.bind(nav);
    await mountFragment({ breadcrumb: '<li>breadcrumbs</li>' });
    const { _brand, _siteNav, _breadcrumbs, _actions } = nav;
    const started = [];
    const siteStarted = Promise.withResolvers();
    const siteReady = Promise.withResolvers();
    const decorateNavItems = nav.decorateNavItems.bind(nav);
    const decorateBrand = nav.decorateBrand.bind(nav);
    const decorateActions = nav.decorateActions.bind(nav);
    nav.decorateNavItems = async (section) => {
      if (section.querySelector('button')?.textContent === 'New site') {
        started.push('site');
        siteStarted.resolve();
        await siteReady.promise;
      }
      return decorateNavItems(section);
    };
    nav.decorateBrand = (section) => {
      started.push('brand');
      return decorateBrand(section);
    };
    nav.decorateActions = (section) => {
      started.push('actions');
      return decorateActions(section);
    };
    window.fetch = async () => new Response(`
      <main>
        <div><p><a href="/">New brand</a></p></div>
        <div><ul><li><button>New site</button></li></ul></div>
        <div><ul><li><button>New action</button></li></ul></div>
      </main>
    `);
    const pending = loadNav();
    try {
      await siteStarted.promise;
      expect(started).to.deep.equal(['site', 'brand', 'actions']);
      expect(nav._brand).to.equal(_brand);
      expect(nav._siteNav).to.equal(_siteNav);
      expect(nav._breadcrumbs).to.equal(_breadcrumbs);
      expect(nav._actions).to.equal(_actions);
      expect(nav.shadowRoot.querySelector('.site-nav nx-breadcrumb')).to.equal(_breadcrumbs);
    } finally {
      siteReady.resolve();
      await pending;
    }
    await nav.updateComplete;
    expect(nav._brand.textContent).to.equal('New brand');
    expect(nav._siteNav.querySelector('button').textContent).to.equal('New site');
    expect(nav._breadcrumbs).to.be.null;
    expect(nav._actions.querySelector('button').textContent).to.equal('New action');
  });

  ['fetch', 'decoration'].forEach((stage) => {
    it(`ignores an older load that finishes ${stage} after a newer nav is applied`, async () => {
      const loadNav = nav.loadNav.bind(nav);
      await mountFragment({ middle: '<ul><li>nav-test</li></ul>' });
      const olderStarted = Promise.withResolvers();
      const olderReady = Promise.withResolvers();
      const decorateBrand = nav.decorateBrand.bind(nav);
      nav.decorateBrand = async (section) => {
        if (stage === 'decoration' && section.textContent.includes('Older')) {
          olderStarted.resolve();
          await olderReady.promise;
        }
        return decorateBrand(section);
      };
      window.fetch = async (path) => {
        const older = String(path).endsWith('/older');
        if (stage === 'fetch' && older) {
          olderStarted.resolve();
          await olderReady.promise;
        }
        const name = older ? 'Older' : 'Newer';
        return new Response(`
          <main>
            <div><p><a href="/">${name}</a></p>${older ? '' : '<ul><li>breadcrumbs</li></ul>'}</div>
            ${older ? '<div><ul><li>nav-test</li></ul></div>' : ''}
            <div><ul><li><button>${name} action</button></li></ul></div>
          </main>
        `);
      };
      nav.path = '/fragments/nav/older';
      const olderLoad = loadNav();
      let latest;
      try {
        await olderStarted.promise;
        nav.path = '/fragments/nav/newer';
        await loadNav();
        expect(nav._brand.textContent).to.equal('Newer');
        expect(nav._siteNav).to.be.null;
        expect(nav._breadcrumbs).to.exist;
        expect(nav._actions.querySelector('button').textContent).to.equal('Newer action');
        latest = [nav._brand, nav._siteNav, nav._breadcrumbs, nav._actions];
      } finally {
        olderReady.resolve();
        await olderLoad;
      }
      [nav._brand, nav._siteNav, nav._breadcrumbs, nav._actions].forEach((value, index) => {
        expect(value).to.equal(latest[index]);
      });
    });
  });

  it('still loads the brand and actions if breadcrumb loading rejects', async () => {
    nav.decorateBreadcrumbs = async () => { throw new TypeError('Breadcrumb unavailable'); };
    await mountFragment({ breadcrumb: '<li>breadcrumbs</li>' });
    expect(nav._breadcrumbs).to.be.null;
    expect(nav._brand.textContent).to.equal('Brand');
    expect(nav._actions.querySelector('button').textContent).to.equal('Action');
  });

  it('keeps brand text and actions when the brand SVG fetch rejects', async () => {
    restoreFetch = mockFragmentFetch(`
      <div><p><a href="/missing-brand.svg">Brand</a></p></div>
      <div><ul><li>nav-test</li></ul></div>
      <div><ul><li><button>Action</button></li></ul></div>
    `);
    const fragmentFetch = window.fetch;
    window.fetch = async (url, opts) => {
      if (String(url).endsWith('/missing-brand.svg')) throw new TypeError('SVG unavailable');
      return fragmentFetch(url, opts);
    };
    nav.path = '/fragments/nav/site-navigation';
    await nav.loadNav();
    expect(nav._brand.textContent).to.equal('Brand');
    expect(nav._brand.getAttribute('href')).to.equal('/');
    expect(nav._siteNav.querySelector('nx-nav-test')).to.exist;
    expect(nav._actions.querySelector('button')).to.exist;
  });

  it('keeps the site nav against the brand without overlapping right actions at narrow widths', async () => {
    await mountFragment({
      middle: '<ul><li><button style="width: 160px">Site navigation</button></li></ul>',
    });
    const brand = nav.shadowRoot.querySelector('.brand-area');
    const cluster = nav.shadowRoot.querySelector('.brand-cluster');
    const siteNav = nav.shadowRoot.querySelector('.site-nav');
    const actions = nav.shadowRoot.querySelector('.action-area');
    actions.innerHTML = '<span style="display: block; width: 240px">Actions</span>';
    actions.style.display = 'block';
    nav.style.setProperty('--s2-spacing-100', '8px');
    for (const width of [900, 480, 320]) {
      nav.style.width = `${width}px`;
      const siteRect = siteNav.getBoundingClientRect();
      const actionsRect = actions.getBoundingClientRect();
      expect(siteRect.left).to.be.closeTo(brand.getBoundingClientRect().right + 8, 1);
      expect(siteRect.right).to.be.closeTo(cluster.getBoundingClientRect().right, 1);
      expect(siteRect.right + 8).to.be.closeTo(actionsRect.left, 1);
      expect(actionsRect.width).to.equal(240);
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

  it('handles a failed dialog fetch and lets a later click succeed', async () => {
    restoreFetch = mockFragmentFetch();
    const fragmentFetch = window.fetch;
    window.fetch = async () => { throw new TypeError('Dialog unavailable'); };
    const section = buildActionsSection({
      buttonHtml: '<button data-pathname="/fragments/nav/help">Help</button>',
    });
    await nav.decorateActions(section);
    const button = section.querySelector('button');
    button.click();
    await new Promise((resolve) => { setTimeout(resolve, 50); });
    expect(document.querySelector('nx-dialog')).to.be.null;

    window.fetch = fragmentFetch;
    button.click();
    await new Promise((resolve) => { setTimeout(resolve, 50); });
    expect(document.querySelector('nx-dialog')).to.exist;
  });
});
