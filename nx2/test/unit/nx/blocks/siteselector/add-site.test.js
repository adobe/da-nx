import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import sinon from 'sinon';
import { setConfig } from '../../../../../scripts/nx.js';

await setConfig({ hostnames: [] });
await import('../../../../../blocks/siteselector/add-site.js');
const { source } = await import('../../../../../utils/api.js');
const tick = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('shared Add site dialog', () => {
  let el;
  let list;
  let recentSites;

  beforeEach(async () => {
    recentSites = localStorage.getItem('da-sites');
    localStorage.setItem('da-sites', '["org/other"]');
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
    if (recentSites === null) localStorage.removeItem('da-sites');
    else localStorage.setItem('da-sites', recentSites);
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
    const saved = localStorage.getItem('da-sites');
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
    expect(invalid.called || list.called).to.be.false;
    expect(localStorage.getItem('da-sites')).to.equal(saved);
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

  it('leaves creation to the host without blocking Add existing', async () => {
    el.createHref = undefined;
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.site-creation')).to.be.null;
    await el.submitForm({ preventDefault() {} });
    expect(JSON.parse(localStorage.getItem('da-sites'))[0]).to.equal('org/site');
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
    sinon.stub(Storage.prototype, 'setItem').callThrough()
      .withArgs('da-sites').throws(new DOMException('Storage unavailable', 'QuotaExceededError'));
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
