import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import sinon from 'sinon';
import { setConfig } from '../../../../../scripts/nx.js';
import { getSiteApi } from '../../../../../blocks/siteselector/site-access.js';

await setConfig({ hostnames: [] });
await import('../../../../../blocks/siteselector/add-site.js');
const { source, config } = await getSiteApi();
const tick = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('shared Add site dialog', () => {
  let el;
  let list;
  let permission;
  let recentSites;
  let saveSites;

  beforeEach(async () => {
    recentSites = JSON.stringify(['org/other']);
    const readSites = sinon.stub(Storage.prototype, 'getItem').callThrough();
    readSites.withArgs('da-sites').callsFake(() => recentSites);
    saveSites = sinon.stub(Storage.prototype, 'setItem').callThrough();
    saveSites.withArgs('da-sites').callsFake((key, value) => { recentSites = value; });
    permission = sinon.stub(config, 'get').resolves(new Response('{}', { headers: { 'x-da-actions': '/=read' } }));
    list = sinon.stub(source, 'list').callsFake(async (path) => ({ ok: true, items: path === '/org' ? [{ name: 'site', path: '/org/site' }] : [] }));
    el = document.createElement('nx-add-site');
    el.org = 'org';
    el.createHref = '/create?org=org';
    document.body.append(el);
    await el.updateComplete;
    await tick();
    await el.updateComplete;
    el.shadowRoot.querySelector('input').value = 'https://main--site--org.aem.page';
  });

  afterEach(() => {
    el.remove();
    sinon.restore();
  });

  it('uses component typography for labels, input, help, status and retry text', async () => {
    const response = await fetch('/nx2/blocks/siteselector/add-site.css');
    expect(response.ok).to.equal(true);
    const styles = new CSSStyleSheet();
    styles.replaceSync(await response.text());
    el.shadowRoot.adoptedStyleSheets = [...el.shadowRoot.adoptedStyleSheets, styles];
    for (const [weight, fontSize, lineHeight, fontWeight] of [
      ['regular', '13px', '19px', '350'],
      ['medium', '15px', '21px', '550'],
    ]) {
      el.style.setProperty(`--s2-component-m-${weight}-font-size`, fontSize);
      el.style.setProperty(`--s2-component-m-${weight}-line-height`, lineHeight);
      el.style.setProperty(`--s2-component-m-${weight}-font-weight`, fontWeight);
    }
    el._canCreate = true;
    el._saving = true;
    el._error = 'Access denied';
    el._permissionError = 'Offline';
    await el.updateComplete;
    const selectors = [
      '.nx-form-field > span', '.nx-input', '#site-help', '#site-error',
      'form [role="status"]', '.site-creation a', '.permission-error', '.permission-retry',
    ];
    for (const selector of selectors) {
      const weight = selector === '.nx-form-field > span' ? 'medium' : 'regular';
      const style = getComputedStyle(el.shadowRoot.querySelector(selector));
      for (const property of ['font-size', 'line-height', 'font-weight']) {
        expect(style.getPropertyValue(property), `${selector} ${property}`)
          .to.equal(el.style.getPropertyValue(`--s2-component-m-${weight}-${property}`));
      }
    }
  });

  it('uses shared rounded dialog buttons in light and dark themes', () => {
    el.style.cssText = `
      --s2-corner-radius-400: 8px;
      --s2-corner-radius-800: 16px;
      --s2-gray-100: light-dark(#eee, #333);
      --s2-gray-200: light-dark(#ddd, #444);
      --s2-gray-800: light-dark(#292929, #dbdbdb);
      --s2-gray-900: light-dark(#161616, #eee);
      --s2-gray-25: light-dark(#fff, #161616);
    `;
    const cancel = el.shadowRoot.querySelector('[slot="actions"][type="button"]');
    const add = el.shadowRoot.querySelector('[type="submit"]');
    [cancel, add].forEach((button) => { button.style.transition = 'none'; });
    expect(cancel.classList.contains('nx-form-btn-secondary')).to.be.true;
    expect(add.classList.contains('nx-btn-primary')).to.be.true;
    for (const [scheme, cancelBackground, cancelHover, addBackground, addHover, addColor] of [
      ['light', 'rgb(238, 238, 238)', 'rgb(221, 221, 221)', 'rgb(41, 41, 41)', 'rgb(22, 22, 22)', 'rgb(255, 255, 255)'],
      ['dark', 'rgb(51, 51, 51)', 'rgb(68, 68, 68)', 'rgb(219, 219, 219)', 'rgb(238, 238, 238)', 'rgb(22, 22, 22)'],
    ]) {
      el.style.colorScheme = scheme;
      const cancelStyle = getComputedStyle(cancel);
      const addStyle = getComputedStyle(add);
      for (const button of [cancelStyle, addStyle]) {
        expect(button.borderRadius).to.equal('16px');
        expect(button.height).to.equal('32px');
      }
      expect(cancelStyle.backgroundColor).to.equal(cancel.matches(':hover') ? cancelHover : cancelBackground);
      expect(addStyle.backgroundColor).to.equal(add.matches(':hover') ? addHover : addBackground);
      expect(addStyle.color).to.equal(addColor);
    }
  });

  it('submits with Enter and closes with Cancel using native dialog buttons', async () => {
    const added = new Promise((resolve) => {
      el.addEventListener('site-added', resolve, { once: true });
    });
    el.shadowRoot.querySelector('input').focus();
    await sendKeys({ press: 'Enter' });
    expect((await added).detail.value).to.equal('org/site');
    const closed = sinon.spy();
    el.addEventListener('close', closed);
    el.shadowRoot.querySelector('[slot="actions"][type="button"]').click();
    expect(closed.calledOnce).to.be.true;
  });

  it('lets a non-admin add an existing accessible site without server writes', async () => {
    const added = sinon.spy();
    const saveSource = sinon.spy(source, 'save');
    const saveConfig = sinon.spy(config, 'save');
    el.addEventListener('site-added', added);
    expect(el.shadowRoot.querySelector('.site-creation')).to.equal(null);
    await el.submitForm({ preventDefault() {} });
    expect(added.calledOnce).to.equal(true);
    expect(added.firstCall.args[0].detail.value).to.equal('org/site');
    expect(JSON.parse(localStorage.getItem('da-sites'))).to.deep.equal(['org/site', 'org/other']);
    expect(saveSource.called).to.equal(false);
    expect(saveConfig.called).to.equal(false);
  });

  it('shows creation only for an explicit organization-config write grant', async () => {
    permission.resolves(new Response('{}', { headers: { 'x-da-actions': '/=read,write' } }));
    await el.loadCreationPermission();
    await el.updateComplete;
    const link = new URL(el.shadowRoot.querySelector('.site-creation a').href);
    expect(link.pathname).to.equal('/create');
    expect(link.searchParams.get('org')).to.equal('org');
    expect(link.hash).to.equal('');
    permission.resolves(new Response('{}', { headers: { 'x-da-actions': '/=read' } }));
    await el.loadCreationPermission();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.site-creation')).to.equal(null);
  });

  it('preserves host-owned creation routing', async () => {
    el.createHref = '/start?landing=home&org=org&nx=lp';
    permission.resolves(new Response('{}', { headers: { 'x-da-actions': '/=read,write' } }));
    await el.loadCreationPermission();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.site-creation a').getAttribute('href')).to.equal(el.createHref);
  });

  it('leaves creation to the host without blocking Add existing', async () => {
    el.createHref = undefined;
    permission.resetHistory();
    await el.loadCreationPermission();
    await el.updateComplete;
    expect(permission.called).to.be.false;
    expect(el.shadowRoot.querySelector('.site-creation')).to.be.null;
    await el.submitForm({ preventDefault() {} });
    expect(JSON.parse(localStorage.getItem('da-sites'))[0]).to.equal('org/site');
  });

  it('keeps Add existing available when admin permissions cannot be checked', async () => {
    permission.rejects(new Error('Offline'));
    await el.loadCreationPermission();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.permission-error').textContent).to.include('Offline');
    expect(el.shadowRoot.querySelector('.site-creation')).to.equal(null);
    expect(el.shadowRoot.querySelector('button[type="submit"]').disabled).to.equal(false);
    await el.submitForm({ preventDefault() {} });
    expect(JSON.parse(localStorage.getItem('da-sites'))[0]).to.equal('org/site');
  });

  it('does not trust fallback permissions without the explicit action header', async () => {
    const response = new Response('{}');
    response.permissions = ['read', 'write'];
    permission.resolves(response);
    await el.loadCreationPermission();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.site-creation')).to.equal(null);
    expect(el.shadowRoot.querySelector('.permission-error').textContent).to.include('could not be verified');
  });

  it('does not infer an admin organization when no site is selected', async () => {
    el.org = undefined;
    permission.resetHistory();
    await el.loadCreationPermission();
    expect(permission.called).to.equal(false);
    expect(el._canCreate).to.equal(false);
  });

  it('rejects invalid URLs before checking access or changing storage', async () => {
    el.shadowRoot.querySelector('input').value = 'https://example.com';
    await el.submitForm({ preventDefault() {} });
    expect(list.called).to.equal(false);
    expect(el._error).to.include('existing AEM site URL');
    expect(JSON.parse(localStorage.getItem('da-sites'))).to.deep.equal(['org/other']);
  });

  it('does not add inaccessible sites or grant access', async () => {
    list.resolves({ ok: false });
    sinon.stub(source, 'getMetadata').resolves(new Response(null, { status: 403 }));
    await el.submitForm({ preventDefault() {} });
    expect(el._error).to.include('do not have access');
    expect(JSON.parse(localStorage.getItem('da-sites'))).to.deep.equal(['org/other']);
  });

  it('does not add a nonexistent site merely because an empty listing succeeds', async () => {
    list.resolves({ ok: true, items: [] });
    await el.submitForm({ preventDefault() {} });
    expect(el._error).to.include('not found in your accessible sites');
    expect(JSON.parse(localStorage.getItem('da-sites'))).to.deep.equal(['org/other']);
  });

  it('surfaces unavailable access checks without treating them as confirmed denials', async () => {
    list.rejects(new Error('Offline'));
    await el.submitForm({ preventDefault() {} });
    expect(el._error).to.include('Offline');
    expect(el._error).not.to.include('do not have access');
    expect(el._saving).to.equal(false);
  });

  it('does not claim success when the browser cannot save the site', async () => {
    const added = sinon.spy();
    el.addEventListener('site-added', added);
    saveSites.withArgs('da-sites').throws(new DOMException('Storage unavailable', 'QuotaExceededError'));
    await el.submitForm({ preventDefault() {} });
    expect(added.called).to.equal(false);
    expect(el._error).to.include('Storage unavailable');
  });

  it('cancels an in-flight add without later saving or opening the site', async () => {
    let finish;
    list.returns(new Promise((resolve) => { finish = resolve; }));
    const added = sinon.spy();
    el.addEventListener('site-added', added);
    const pending = el.submitForm({ preventDefault() {} });
    await tick();
    el.close();
    finish({ ok: true, items: [] });
    await pending;
    expect(added.called).to.equal(false);
    expect(JSON.parse(localStorage.getItem('da-sites'))).to.deep.equal(['org/other']);
  });

  it('ignores a late administrator response after removal', async () => {
    let finish;
    permission.returns(new Promise((resolve) => { finish = resolve; }));
    const pending = el.loadCreationPermission();
    await tick();
    el.remove();
    finish(new Response('{}', { headers: { 'x-da-actions': '/=read,write' } }));
    await pending;
    expect(el._canCreate).to.equal(false);
  });
});
