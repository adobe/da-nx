import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import sinon from 'sinon';
import { setConfig } from '../../../../../scripts/nx.js';

await setConfig({ hostnames: [] });
await import('../../../../../blocks/siteselector/add-site.js');
describe('shared Add site dialog', () => {
  let el;
  let recentSites;

  beforeEach(async () => {
    recentSites = localStorage.getItem('da-sites');
    localStorage.setItem('da-sites', '["org/other"]');
    el = document.createElement('nx-add-site');
    el.createHref = '/create';
    document.body.append(el);
    await el.updateComplete;
    await el.shadowRoot.querySelector('nx-dialog').updateComplete;
    el.shadowRoot.querySelector('input').value = 'https://main--site--org.aem.page';
  });

  afterEach(() => {
    el.remove();
    sinon.restore();
    if (recentSites === null) localStorage.removeItem('da-sites');
    else localStorage.setItem('da-sites', recentSites);
  });

  it('clears the inline validation error when the input is corrected', async () => {
    const input = el.shadowRoot.querySelector('input');
    input.value = 'https://example.com';
    el.shadowRoot.querySelector('[type="submit"]').click();
    await el.updateComplete;
    const error = el.shadowRoot.querySelector('[role="alert"]');
    expect(error.hidden).to.be.false;
    input.value = 'https://main--site--org.aem.page';
    input.dispatchEvent(new Event('input'));
    await el.updateComplete;
    expect(error.hidden).to.be.true;
  });

  it('shows inline errors instead of browser validation for required and malformed URLs', async () => {
    const input = el.shadowRoot.querySelector('input');
    const saved = localStorage.getItem('da-sites');
    const invalid = sinon.spy();
    input.addEventListener('invalid', invalid);
    for (const value of ['', 'not-a-url', 'https://example.com']) {
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
    expect(invalid.called).to.be.false;
    expect(localStorage.getItem('da-sites')).to.equal(saved);
  });

  it('submits with Enter and prepends the site to recent history', async () => {
    const added = new Promise((resolve) => {
      el.addEventListener('site-added', resolve, { once: true });
    });
    el.shadowRoot.querySelector('input').focus();
    await sendKeys({ press: 'Enter' });
    expect((await added).detail.value).to.equal('org/site');
    expect(JSON.parse(localStorage.getItem('da-sites'))).to.deep.equal(['org/site', 'org/other']);
  });

  it('does not claim success when the browser cannot save the site', async () => {
    const added = sinon.spy();
    el.addEventListener('site-added', added);
    sinon.stub(Storage.prototype, 'setItem').callThrough()
      .withArgs('da-sites').throws(new DOMException('Storage unavailable', 'QuotaExceededError'));
    el.shadowRoot.querySelector('[type="submit"]').click();
    await el.updateComplete;
    expect(added.called).to.equal(false);
    expect(el.shadowRoot.querySelector('[role="alert"]').textContent).to.include('Could not save this site');
    expect(JSON.parse(localStorage.getItem('da-sites'))).to.deep.equal(['org/other']);
  });
});
