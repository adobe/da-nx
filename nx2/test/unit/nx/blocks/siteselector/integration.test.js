import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setConfig } from '../../../../../scripts/nx.js';

await setConfig({ hostnames: [] });
await import('../../../../../blocks/siteselector/siteselector.js');
const { source, config } = await import('../../../../../utils/api.js');
const tick = () => new Promise((resolve) => { setTimeout(resolve, 0); });
const openDialog = (selector, open = () => selector.dispatchEvent(new CustomEvent('site-add', { bubbles: true }))) => new Promise((resolve) => {
  const observer = new MutationObserver(() => {
    const dialog = document.querySelector('nx-add-site');
    if (dialog) {
      observer.disconnect();
      resolve(dialog);
    }
  });
  observer.observe(document.body, { childList: true });
  open();
});

describe('standalone site selector behavior', () => {
  let selector;
  let href;
  let recentSites;
  let list;
  let permission;

  async function mount() {
    const refresh = sinon.spy(selector, 'refresh');
    document.body.append(selector);
    await refresh.firstCall.returnValue;
    refresh.restore();
    await selector.updateComplete;
  }

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
    await mount();
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
    selector.addEventListener('site-select', ({ detail }) => onSelect(detail));
    await mount();
    const currentHref = window.location.href;
    selector.onChange({ stopPropagation() {}, detail: { value: 'other/site' } });
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
    selector.onChange({ stopPropagation() {}, detail: { value: 'unknown/site' } });
    expect(onSelect.calledOnce).to.be.true;
    expect(selector.error).to.include('no longer available');
  });

  it('lazily adds a verified site without requiring consumer routing or server writes', async () => {
    localStorage.setItem('da-sites', '[]');
    const saveSource = sinon.spy(source, 'save');
    const saveConfig = sinon.spy(config, 'save');
    await mount();
    await selector.updateComplete;
    expect(selector.hidden).to.be.true;
    expect(selector.shadowRoot.querySelector('nx-picker')).to.be.null;
    const currentHref = window.location.href;
    const cancelled = await openDialog(selector);
    await cancelled.updateComplete;
    cancelled.shadowRoot.querySelector('[slot="actions"][type="button"]').click();
    await tick();
    expect(cancelled.isConnected).to.be.false;
    expect(selector.hidden).to.be.true;
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
    await selector.updateComplete;
    const picker = selector.shadowRoot.querySelector('nx-picker');
    await picker.updateComplete;
    expect(selector.hidden).to.be.false;
    expect(picker.shadowRoot.activeElement).to.equal(picker.shadowRoot.querySelector('button'));
  });

  it('uses only the host-provided Create destination after checking admin access', async () => {
    window.history.replaceState(null, '', '#/org/site');
    selector.getCreateSiteHref = ({ org }) => `/custom-create?org=${org}`;
    await mount();
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
      await mount();
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
    await mount();
    const dialog = await openDialog(selector);
    await dialog.updateComplete;
    expect(dialog.createHref).to.be.undefined;
    expect(permission.called).to.be.false;
    expect(dialog.shadowRoot.querySelector('.site-creation')).to.be.null;
    expect(dialog.shadowRoot.querySelector('input')).to.exist;
  });

  it('rechecks access on reconnect and releases the previous lifecycle', async () => {
    await mount();
    const previous = selector._connection.signal;
    selector.remove();
    expect(previous.aborted).to.be.true;
    list.resetHistory();
    await mount();
    expect(selector._connection.signal.aborted).to.be.false;
    expect(list.calledTwice).to.be.true;
    selector.onChange({ stopPropagation() {}, detail: { value: 'org/site' } });
    await tick();
    expect(selector.value).to.equal('org/site');
  });

  it('cancels initialization when removed before the API loads', async () => {
    document.body.append(selector);
    selector.remove();
    await tick();
    expect(list.called).to.be.false;
    expect(selector.error).to.be.undefined;
  });

  it('filters confirmed denials and restores access on retry without deleting history', async () => {
    const saved = localStorage.getItem('da-sites');
    list.callsFake(async (path) => ({ ok: path !== '/org/site', items: [] }));
    sinon.stub(source, 'getMetadata').resolves(new Response(null, { status: 403 }));
    await mount();
    expect(selector.sites.map(({ value }) => value)).to.deep.equal(['other/site']);
    expect(localStorage.getItem('da-sites')).to.equal(saved);
    list.resolves({ ok: true, items: [] });
    await selector.onRetry();
    expect(selector.sites.map(({ value }) => value)).to.deep.equal(['org/site', 'other/site']);
    expect(localStorage.getItem('da-sites')).to.equal(saved);
  });
});
