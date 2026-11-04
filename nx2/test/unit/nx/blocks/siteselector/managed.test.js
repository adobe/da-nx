import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setConfig } from '../../../../../scripts/nx.js';
import { getSiteApi } from '../../../../../blocks/siteselector/site-access.js';

await setConfig({ hostnames: [] });
await import('../../../../../blocks/siteselector/siteselector.js');
const { source, config } = await getSiteApi();
const tick = () => new Promise((resolve) => { setTimeout(resolve, 0); });
const openDialog = (selector) => new Promise((resolve) => {
  const observer = new MutationObserver(() => {
    const dialog = document.querySelector('nx-add-site');
    if (dialog) {
      observer.disconnect();
      resolve(dialog);
    }
  });
  observer.observe(document.body, { childList: true });
  selector.dispatchEvent(new CustomEvent('site-add', { bubbles: true }));
});

describe('standalone site selector behavior', () => {
  let selector;
  let href;
  let recentSites;
  let list;
  let permission;

  beforeEach(() => {
    href = window.location.href;
    window.history.replaceState(null, '', window.location.pathname);
    recentSites = '["org/site","other/site"]';
    const readSites = sinon.stub(Storage.prototype, 'getItem').callThrough();
    readSites.withArgs('da-sites').callsFake(() => recentSites);
    const saveSites = sinon.stub(Storage.prototype, 'setItem').callThrough();
    saveSites.withArgs('da-sites').callsFake((key, value) => { recentSites = value; });
    list = sinon.stub(source, 'list').callsFake(async (path) => ({
      ok: true, items: path === '/org' ? [{ name: 'site' }] : [],
    }));
    permission = sinon.stub(config, 'get').resolves(new Response('{}', {
      headers: { 'x-da-actions': '/=read,write' },
    }));
    selector = document.createElement('nx-siteselector');
  });

  afterEach(() => {
    selector.remove();
    window.history.replaceState(null, '', href);
    sinon.restore();
  });

  it('loads history and checks access without any consumer adapter', async () => {
    expect(customElements.get('nx-add-site')).to.be.undefined;
    document.body.append(selector);
    await selector.ready;
    await selector.updateComplete;
    expect(selector.sites.map(({ value }) => value)).to.deep.equal(['org/site', 'other/site']);
    expect(selector.value).to.equal('');
    expect(selector.size).to.equal('s');
    expect(list.calledTwice).to.be.true;
    const picker = selector.shadowRoot.querySelector('nx-picker');
    expect(picker.placeholder).to.equal('Your recent sites');
    expect(picker.items[0].section).to.equal('Your recent sites');
    expect(customElements.get('nx-add-site')).to.be.undefined;
  });

  it('owns selection and persistence while the consumer owns page reactions', async () => {
    const onSelect = sinon.spy();
    selector.onSelect = onSelect;
    document.body.append(selector);
    await selector.ready;
    const currentHref = window.location.href;
    selector.dispatchEvent(new CustomEvent('site-select', { detail: { value: 'other/site' } }));
    await tick();
    expect(onSelect.calledOnceWithExactly({ value: 'other/site' })).to.be.true;
    expect(selector.value).to.equal('other/site');
    expect(JSON.parse(localStorage.getItem('da-sites'))[0]).to.equal('other/site');
    expect(window.location.href).to.equal(currentHref);
    await selector.updateComplete;
    const picker = selector.shadowRoot.querySelector('nx-picker');
    await picker.updateComplete;
    expect(picker.shadowRoot.querySelector('[part="label"]').textContent).to.equal('other/site');
    expect(picker.items.find((item) => item.value === 'other/site'))
      .to.include({ label: 'Site', description: 'other/site' });
    selector.dispatchEvent(new CustomEvent('site-select', { detail: { value: 'unknown/site' } }));
    expect(onSelect.calledOnce).to.be.true;
    expect(selector.error).to.include('no longer available');
  });

  it('lazily adds a verified site without requiring consumer routing or server writes', async () => {
    localStorage.setItem('da-sites', '[]');
    const saveSource = sinon.spy(source, 'save');
    const saveConfig = sinon.spy(config, 'save');
    document.body.append(selector);
    await selector.ready;
    const currentHref = window.location.href;
    const dialog = await openDialog(selector);
    await dialog.updateComplete;
    dialog.shadowRoot.querySelector('input').value = 'https://main--site--org.aem.live';
    await dialog.submitForm({ preventDefault() {} });
    await tick();
    expect(dialog.isConnected).to.be.false;
    expect(selector.value).to.equal('org/site');
    expect(JSON.parse(localStorage.getItem('da-sites'))).to.deep.equal(['org/site']);
    expect(window.location.href).to.equal(currentHref);
    expect(permission.called).to.be.false;
    expect(saveSource.called || saveConfig.called).to.be.false;
  });

  it('uses only the host-provided Create destination after checking admin access', async () => {
    window.history.replaceState(null, '', '#/org/site');
    selector.getCreateSiteHref = ({ org }) => `/custom-create?org=${org}`;
    document.body.append(selector);
    await selector.ready;
    const dialog = await openDialog(selector);
    await dialog.loadCreationPermission();
    await dialog.updateComplete;
    expect(dialog.shadowRoot.querySelector('.site-creation a').getAttribute('href'))
      .to.equal('/custom-create?org=org');
    expect(permission.calledWith({ org: 'org' })).to.be.true;
  });

  [['read,write', true], ['read', false]].forEach(([actions, canCreate]) => {
    it(`handles default creation routing without a DA listener for ${actions} permissions`, async () => {
      permission.resolves(new Response('{}', { headers: { 'x-da-actions': `/=${actions}` } }));
      window.history.replaceState(null, '', '?nx=siteselector-main&nxver=2&theme=dark&browse=2&site=old#/org/site/folder');
      const currentHref = window.location.href;
      document.body.append(selector);
      await selector.ready;
      expect(selector.getCreateSiteHref).to.be.undefined;
      const dialog = await openDialog(selector);
      await dialog.loadCreationPermission();
      await dialog.updateComplete;
      expect(permission.calledWith({ org: 'org' })).to.be.true;
      const link = dialog.shadowRoot.querySelector('.site-creation a');
      expect(!!link).to.equal(canCreate);
      if (canCreate) {
        const url = new URL(link.href);
        expect(url.origin).to.equal(window.location.origin);
        expect(url.pathname).to.equal('/start');
        expect(url.searchParams.get('org')).to.equal('org');
        expect(url.searchParams.get('nx')).to.equal('siteselector-main');
        expect(url.searchParams.get('nxver')).to.equal('2');
        expect(url.searchParams.get('theme')).to.equal('dark');
        expect(url.searchParams.has('browse')).to.be.false;
        expect(url.searchParams.has('site')).to.be.false;
        expect(url.hash).to.equal('');
      }
      expect(window.location.href).to.equal(currentHref);
    });
  });

  it('lets a host explicitly suppress creation without disabling Add existing', async () => {
    window.history.replaceState(null, '', '#/org/site');
    selector.getCreateSiteHref = () => undefined;
    document.body.append(selector);
    await selector.ready;
    const dialog = await openDialog(selector);
    await dialog.updateComplete;
    expect(dialog.createHref).to.be.undefined;
    expect(permission.called).to.be.false;
    expect(dialog.shadowRoot.querySelector('.site-creation')).to.be.null;
    expect(dialog.shadowRoot.querySelector('input')).to.exist;
  });

  it('reconnects its controller and releases the previous lifecycle', async () => {
    document.body.append(selector);
    await selector.ready;
    const previous = selector._connection.signal;
    selector.remove();
    expect(previous.aborted).to.be.true;
    list.resetHistory();
    document.body.append(selector);
    await selector.ready;
    expect(selector._connection.signal.aborted).to.be.false;
    expect(list.calledTwice).to.be.true;
    selector.dispatchEvent(new CustomEvent('site-select', { detail: { value: 'org/site' } }));
    await tick();
    expect(selector.value).to.equal('org/site');
  });

  it('keeps explicitly supplied data under consumer control', async () => {
    selector.sites = [{ value: 'custom/site', label: 'Custom site' }];
    document.body.append(selector);
    await selector.updateComplete;
    expect(selector.ready).to.be.undefined;
    expect(list.called).to.be.false;
    expect(selector.sites).to.deep.equal([{ value: 'custom/site', label: 'Custom site' }]);
    selector.value = 'custom/site';
    await selector.updateComplete;
    const picker = selector.shadowRoot.querySelector('nx-picker');
    await picker.updateComplete;
    expect(picker.shadowRoot.querySelector('[part="label"]').textContent).to.equal('Custom site');
  });

  it('cancels initialization when removed before the controller loads', async () => {
    document.body.append(selector);
    const { ready } = selector;
    selector.remove();
    await ready;
    expect(list.called).to.be.false;
    expect(selector.error).to.be.undefined;
    expect(selector._adapter).to.be.undefined;
  });

  it('filters confirmed denials and restores access on retry without deleting history', async () => {
    const saved = localStorage.getItem('da-sites');
    list.callsFake(async (path) => ({ ok: path !== '/org/site', items: [] }));
    sinon.stub(source, 'getMetadata').resolves(new Response(null, { status: 403 }));
    document.body.append(selector);
    await selector.ready;
    expect(selector.sites.map(({ value }) => value)).to.deep.equal(['other/site']);
    expect(localStorage.getItem('da-sites')).to.equal(saved);
    list.resolves({ ok: true, items: [] });
    selector.dispatchEvent(new CustomEvent('site-retry'));
    await tick();
    expect(selector.sites.map(({ value }) => value)).to.deep.equal(['org/site', 'other/site']);
    expect(localStorage.getItem('da-sites')).to.equal(saved);
  });
});
