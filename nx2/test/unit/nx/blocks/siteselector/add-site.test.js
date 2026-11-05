import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import sinon from 'sinon';
import { setConfig } from '../../../../../scripts/nx.js';

await setConfig({ hostnames: [] });
await import('../../../../../blocks/siteselector/add-site.js');
const { source, config } = await import('../../../../../utils/api.js');
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
    permission = sinon.stub(config, 'get').resolves(new Response(null, { status: 403 }));
    list = sinon.stub(source, 'list').callsFake(async (path) => ({ ok: true, items: path === '/org' ? [{ name: 'site', path: '/org/site' }] : [] }));
    el = document.createElement('nx-add-site');
    el.createHref = '/create';
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

  it('uses common form error styling and clears it when the input is corrected', async () => {
    el.style.cssText = '--s2-red-800: #c00; --s2-red-900: #900; --s2-gray-900: #333; --s2-spacing-100: 8px;';
    const input = el.shadowRoot.querySelector('input');
    input.value = 'https://example.com';
    await el.submitForm({ preventDefault() {} });
    await el.updateComplete;
    const error = el.shadowRoot.querySelector('[role="alert"]');
    expect(getComputedStyle(input).borderColor).to.equal('rgb(204, 0, 0)');
    expect(getComputedStyle(error).color).to.equal('rgb(153, 0, 0)');
    expect(error.hidden).to.be.false;
    expect(error.getBoundingClientRect().top - input.getBoundingClientRect().bottom)
      .to.be.closeTo(8, 0.5);
    input.dispatchEvent(new Event('input'));
    await el.updateComplete;
    expect(error.hidden).to.be.true;
    expect(getComputedStyle(input).borderColor).to.equal('rgb(51, 51, 51)');
  });

  it('shows inline errors instead of browser validation for required and malformed URLs', async () => {
    const input = el.shadowRoot.querySelector('input');
    const invalid = sinon.spy();
    input.addEventListener('invalid', invalid);
    for (const value of ['', 'not-a-url']) {
      input.value = value;
      input.dispatchEvent(new Event('input'));
      input.focus();
      if (!value) await sendKeys({ press: 'Enter' });
      else el.shadowRoot.querySelector('[type="submit"]').click();
      await el.updateComplete;
      const error = el.shadowRoot.querySelector('[role="alert"]');
      expect(error.hidden).to.be.false;
      expect(error.textContent).to.include('Enter an existing AEM site URL');
      expect(input.getAttribute('aria-invalid')).to.equal('true');
    }
    expect(invalid.called || list.called || saveSites.called).to.be.false;
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
      --s2-blue-900: light-dark(#0265dc, #54a5ff);
      --s2-blue-1000: light-dark(#0054b6, #378ef0);
    `;
    const cancel = el.shadowRoot.querySelector('[slot="actions"][type="button"]');
    const add = el.shadowRoot.querySelector('[type="submit"]');
    [cancel, add].forEach((button) => { button.style.transition = 'none'; });
    expect(cancel.classList.contains('nx-form-btn-secondary')).to.be.true;
    expect(add.classList.contains('nx-form-btn-primary')).to.be.true;
    for (const [scheme, cancelBackground, cancelHover, addBackground, addHover, addColor] of [
      ['light', 'rgb(238, 238, 238)', 'rgb(221, 221, 221)', 'rgb(2, 101, 220)', 'rgb(0, 84, 182)', 'rgb(255, 255, 255)'],
      ['dark', 'rgb(51, 51, 51)', 'rgb(68, 68, 68)', 'rgb(84, 165, 255)', 'rgb(55, 142, 240)', 'rgb(255, 255, 255)'],
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
    expect(el.shadowRoot.querySelector('.site-creation')).to.exist;
    await el.submitForm({ preventDefault() {} });
    expect(added.calledOnce).to.equal(true);
    expect(added.firstCall.args[0].detail.value).to.equal('org/site');
    expect(JSON.parse(localStorage.getItem('da-sites'))).to.deep.equal(['org/site', 'org/other']);
    expect(saveSource.called).to.equal(false);
    expect(saveConfig.called).to.equal(false);
  });

  it('shows Create without a selected organization or checking organization permissions', () => {
    const link = new URL(el.shadowRoot.querySelector('.site-creation a').href);
    expect(link.pathname).to.equal('/create');
    expect(link.searchParams.has('org')).to.be.false;
    expect(link.hash).to.equal('');
    expect(permission.called).to.be.false;
  });

  it('preserves host-owned creation routing', async () => {
    el.createHref = '/start?landing=home&nx=lp';
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.site-creation a').getAttribute('href')).to.equal(el.createHref);
  });

  it('leaves creation to the host without blocking Add existing', async () => {
    el.createHref = undefined;
    await el.updateComplete;
    expect(permission.called).to.be.false;
    expect(el.shadowRoot.querySelector('.site-creation')).to.be.null;
    await el.submitForm({ preventDefault() {} });
    expect(JSON.parse(localStorage.getItem('da-sites'))[0]).to.equal('org/site');
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
});
