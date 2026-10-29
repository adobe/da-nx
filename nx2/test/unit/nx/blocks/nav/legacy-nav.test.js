import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setConfig } from '../../../../../../nx/scripts/nexter.js';

setConfig({ hostnames: [] });
await import('../../../../../../nx/blocks/nav/nav.js');
await import('../../../../../../nx/blocks/sidenav/sidenav.js');

describe('legacy shell branding', () => {
  let originalFetch;
  let originalHref;

  beforeEach(() => {
    originalFetch = window.fetch;
    originalHref = window.location.href;
    window.fetch = (resource, options) => {
      const path = new URL(resource, window.location.href).pathname;
      if (path === '/test/legacy-nav.plain.html') {
        return Promise.resolve(new Response('<div><p><a href="/">Author</a></p></div>'));
      }
      if (path === '/test/legacy-sidenav.plain.html') {
        return Promise.resolve(new Response('<div><ul><li><a href="/" title="Home">Home</a></li><li><a href="/apps?nx=lp&landing=home" title="Apps">Apps</a></li></ul></div>'));
      }
      return originalFetch(resource, options);
    };
  });

  afterEach(() => {
    window.fetch = originalFetch;
    window.history.replaceState(null, '', originalHref);
    setConfig({ hostnames: [] });
    sinon.restore();
  });

  async function getBrand() {
    const nav = document.createElement('nx-nav');
    nav.path = '/test/legacy-nav';
    return (await nav.fetchNav()).querySelector('.nx-nav-brand');
  }

  async function getSidebar() {
    const nav = document.createElement('nx-sidenav');
    nav.path = '/test/legacy-sidenav';
    return nav.fetchNav();
  }

  it('uses the same configured logo and product title as NX2', async () => {
    setConfig({
      hostnames: [],
      brand: { title: 'Example Product', logoHref: '/nx2/img/favicons/favicon.ico' },
      homeHref: '/?landing=true&nx=lp#/org/site',
    });
    const brand = await getBrand();
    expect(brand.querySelector('.brand-label').textContent).to.equal('Example Product');
    expect(brand.getAttribute('aria-label')).to.equal('Example Product home');
    expect(brand.textContent).not.to.include('Author');
    const logo = brand.querySelector('img');
    expect([logo.width, logo.height, logo.alt]).to.deep.equal([24, 24, '']);
    expect(brand.getAttribute('href')).to.equal('/?landing=true&nx=lp#/org/site');
  });

  it('updates the logo destination at click time for the current workspace', async () => {
    window.history.replaceState(null, '', '/apps/loc#/org/site');
    setConfig({
      hostnames: [],
      homeHref: () => `/?landing=true&nx=lp${window.location.hash}`,
    });
    const brand = await getBrand();
    window.history.replaceState(null, '', '/apps/loc#/org/other');
    brand.dispatchEvent(new MouseEvent('click', { cancelable: true }));
    expect(brand.hash).to.equal('#/org/other');
    expect(brand.search).to.include('landing=true');
  });

  it('returns sidebar Home to Landing without the legacy new-window path', async () => {
    window.history.replaceState(null, '', '/apps/loc#/org/site');
    setConfig({ hostnames: [], homeHref: '/?landing=true&nx=lp#/org/site' });
    const sidebar = await getSidebar();
    const home = sidebar.querySelector('[title="Home"]');
    const open = sinon.stub(window, 'open');
    const event = new MouseEvent('click', { cancelable: true });
    home.dispatchEvent(event);
    expect(event.defaultPrevented).to.equal(false);
    expect(open.called).to.equal(false);
    expect(home.getAttribute('href')).to.equal('/?landing=true&nx=lp#/org/site');
    const apps = sidebar.querySelector('[title="Apps"]');
    apps.dispatchEvent(new MouseEvent('click', { cancelable: true }));
    expect(open.firstCall.args[0]).to.equal(`${window.location.origin}/apps?nx=lp&landing=home#/org/site`);
  });

  it('preserves the original fragment logo and Home behavior without configuration', async () => {
    const brand = await getBrand();
    expect(brand.textContent).to.equal('Author');
    expect(brand.querySelector('svg use').getAttribute('href')).to.equal('#spectrum-ExperienceCloud');
    expect(brand.querySelector('.brand-logo')).to.equal(null);
    window.history.replaceState(null, '', '/apps/loc#/org/site');
    const sidebar = await getSidebar();
    const open = sinon.stub(window, 'open');
    sidebar.querySelector('[title="Home"]').dispatchEvent(new MouseEvent('click', { cancelable: true }));
    expect(open.firstCall.args[0]).to.equal(`${window.location.origin}/#/org/site`);
  });
});
