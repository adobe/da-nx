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
    permission = sinon.stub(config, 'get').resolves(new Response(null, { status: 403 }));
    selector = document.createElement('nx-siteselector');
  });

  afterEach(() => {
    selector.remove();
    window.history.replaceState(null, '', href);
    sinon.restore();
  });

  it('preselects the most recent accessible site and notifies the consumer once', async () => {
    window.history.replaceState(null, '', '#/unrelated/route');
    const onSelect = sinon.spy();
    selector.addEventListener('site-select', onSelect);
    expect(customElements.get('nx-add-site')).to.be.undefined;
    await mount();
    expect(selector.sites.map(({ value }) => value)).to.deep.equal(['org/site', 'other/site']);
    expect(selector.value).to.equal('org/site');
    expect(onSelect.calledOnce).to.be.true;
    expect(onSelect.firstCall.args[0].detail).to.deep.equal({ value: 'org/site' });
    expect(onSelect.firstCall.args[0].bubbles).to.be.true;
    expect(onSelect.firstCall.args[0].composed).to.be.true;
    expect(selector.size).to.equal('s');
    expect(list.calledTwice).to.be.true;
    await selector.refresh();
    expect(onSelect.calledOnce).to.be.true;
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
    onSelect.resetHistory();
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

  it('uses a consumer-provided selection without interpreting the URL or emitting selection back', async () => {
    window.history.replaceState(null, '', '/different/consumer/path#/unrelated/route');
    selector.value = 'other/site';
    const onSelect = sinon.spy();
    selector.addEventListener('site-select', onSelect);
    await mount();
    expect(selector.value).to.equal('other/site');
    expect(selector.sites.map(({ value }) => value)).to.deep.equal(['other/site', 'org/site']);
    expect(onSelect.called).to.be.false;
    list.resetHistory();
    window.history.replaceState(null, '', '/another/path#/another/route');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await tick();
    expect(selector.value).to.equal('other/site');
    selector.value = 'org/site';
    await selector.updateComplete;
    expect(JSON.parse(recentSites)[0]).to.equal('org/site');
    expect(onSelect.called || list.called).to.be.false;
  });

  it('does not preselect an unverified recent site when another site has verified access', async () => {
    list.callsFake(async (path) => ({ ok: path !== '/org/site', items: [] }));
    sinon.stub(source, 'getMetadata').resolves(new Response(null, { status: 401 }));
    const onSelect = sinon.spy();
    selector.addEventListener('site-select', ({ detail }) => onSelect(detail));
    await mount();
    expect(selector.value).to.equal('other/site');
    expect(selector.sites.map(({ value }) => value)).to.have.members(['org/site', 'other/site']);
    expect(selector.error).to.include('Sign in to check access to org/site');
    expect(onSelect.calledOnceWithExactly({ value: 'other/site' })).to.be.true;
    expect(list.calledTwice).to.be.true;
  });

  it('remains unselected without emitting when no recent site has verified access', async () => {
    list.rejects(new Error('Offline'));
    const onSelect = sinon.spy();
    selector.addEventListener('site-select', onSelect);
    await mount();
    expect(selector.value).to.equal('');
    expect(selector.error).to.include('Offline');
    expect(onSelect.called).to.be.false;
  });

  it('does not replace an explicit selection when an older initialization finishes', async () => {
    let finish;
    const started = new Promise((resolveStarted) => {
      list.onFirstCall().callsFake(() => new Promise((resolve) => {
        finish = resolve;
        resolveStarted();
      }));
    });
    const onSelect = sinon.spy();
    selector.addEventListener('site-select', ({ detail }) => onSelect(detail));
    const mounting = mount();
    await started;
    await selector.selectSite('other/site');
    finish({ ok: true, items: [] });
    await mounting;
    expect(selector.value).to.equal('other/site');
    expect(onSelect.calledOnceWithExactly({ value: 'other/site' })).to.be.true;
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
    expect(cancelled.shadowRoot.querySelector('.site-creation a')).to.exist;
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

  it('uses the host-provided Create destination without passing an organization', async () => {
    window.history.replaceState(null, '', '#/org/site');
    selector.getCreateSiteHref = sinon.stub().returns('/custom-create');
    await mount();
    const dialog = await openDialog(selector);
    await dialog.updateComplete;
    expect(dialog.shadowRoot.querySelector('.site-creation a').getAttribute('href'))
      .to.equal('/custom-create');
    expect(selector.getCreateSiteHref.calledOnceWithExactly()).to.be.true;
    expect(permission.called).to.be.false;
  });

  it('opens the generic creation flow without forwarding the current organization', async () => {
    window.history.replaceState(null, '', '?nx=siteselector-main&nxver=2&theme=dark&browse=2&site=old&org=old#/org/site/folder');
    selector.value = 'selected-org/site';
    const currentHref = window.location.href;
    await mount();
    const dialog = await openDialog(selector);
    await dialog.updateComplete;
    const url = new URL(dialog.shadowRoot.querySelector('.site-creation a').href);
    expect(url.origin).to.equal(window.location.origin);
    expect(url.pathname).to.equal('/start');
    expect(url.searchParams.has('org')).to.be.false;
    expect(url.searchParams.get('nx')).to.equal('siteselector-main');
    expect(url.searchParams.get('nxver')).to.equal('2');
    expect(url.searchParams.get('theme')).to.equal('dark');
    expect(url.searchParams.has('browse')).to.be.false;
    expect(url.searchParams.has('site')).to.be.false;
    expect(url.hash).to.equal('');
    expect(permission.called).to.be.false;
    expect(window.location.href).to.equal(currentHref);
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
    const onSelect = sinon.spy();
    selector.addEventListener('site-select', onSelect);
    document.body.append(selector);
    selector.remove();
    await tick();
    expect(list.called).to.be.false;
    expect(selector.error).to.be.undefined;
    expect(onSelect.called).to.be.false;
  });

  it('filters confirmed denials and restores access on retry without deleting history', async () => {
    const saved = localStorage.getItem('da-sites');
    const onSelect = sinon.spy();
    selector.addEventListener('site-select', ({ detail }) => onSelect(detail));
    list.callsFake(async (path) => ({ ok: path !== '/org/site', items: [] }));
    sinon.stub(source, 'getMetadata').resolves(new Response(null, { status: 403 }));
    await mount();
    expect(selector.sites.map(({ value }) => value)).to.deep.equal(['other/site']);
    expect(selector.value).to.equal('other/site');
    expect(onSelect.calledOnceWithExactly({ value: 'other/site' })).to.be.true;
    expect(JSON.parse(localStorage.getItem('da-sites'))).to.have.members(JSON.parse(saved));
    list.resolves({ ok: true, items: [] });
    await selector.onRetry();
    expect(selector.sites.map(({ value }) => value)).to.deep.equal(['other/site', 'org/site']);
    expect(JSON.parse(localStorage.getItem('da-sites'))).to.have.members(JSON.parse(saved));
    expect(onSelect.calledOnce).to.be.true;
  });
});
