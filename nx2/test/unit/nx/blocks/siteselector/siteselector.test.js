import { expect } from '@esm-bundle/chai';
import { setConfig } from '../../../../../scripts/nx.js';

await setConfig({ hostnames: [] });
await import('../../../../../blocks/siteselector/siteselector.js');

describe('nx-siteselector', () => {
  let selector;
  let recentSites;
  let href;
  const settle = async () => {
    await selector.updateComplete;
    const picker = selector.shadowRoot.querySelector('nx-picker');
    await picker?.updateComplete;
    return picker;
  };

  beforeEach(() => {
    recentSites = localStorage.getItem('da-sites');
    href = window.location.href;
    localStorage.setItem('da-sites', '["org/site","other/site"]');
    selector = document.createElement('nx-siteselector');
  });

  afterEach(() => {
    selector.remove();
    window.history.replaceState(null, '', href);
    if (recentSites === null) localStorage.removeItem('da-sites');
    else localStorage.setItem('da-sites', recentSites);
  });

  it('selects the most recent site and notifies the consumer once without navigating', async () => {
    const events = [];
    selector.addEventListener('site-select', (event) => events.push(event));
    document.body.append(selector);
    const picker = await settle();
    expect(selector.value).to.equal('org/site');
    expect(events).to.have.length(1);
    expect(events[0].detail).to.deep.equal({ value: 'org/site' });
    expect(events[0].bubbles && events[0].composed).to.be.true;
    expect(picker.shadowRoot.querySelector('[aria-selected="true"]').dataset.value).to.equal('org/site');
    expect(picker.shadowRoot.querySelector('.picker-item-description').textContent).to.equal('org/site');
    expect(window.location.href).to.equal(href);
  });

  it('accepts consumer selection and explicit clearing without echoing selection events', async () => {
    const events = [];
    selector.addEventListener('site-select', (event) => events.push(event));
    selector.heading = 'Your recent sites';
    selector.value = 'other/site';
    document.body.append(selector);
    await settle();
    expect(JSON.parse(localStorage.getItem('da-sites'))[0]).to.equal('other/site');
    selector.value = '';
    const picker = await settle();
    expect(picker.shadowRoot.querySelector('[part="label"]').textContent).to.equal('Your recent sites');
    expect(picker.shadowRoot.querySelector('[aria-selected="true"]')).to.be.null;
    selector.remove();
    document.body.append(selector);
    await settle();
    expect(selector.value).to.equal('');
    expect(events).to.be.empty;
  });

  it('handles picker selection and redirects Add through the rendered controls', async () => {
    const target = 'My.Org/Other.Site';
    localStorage.setItem('da-sites', JSON.stringify(['org/site', target]));
    document.body.append(selector);
    const picker = await settle();
    const events = [];
    selector.addEventListener('site-select', ({ detail }) => events.push(detail));
    picker.shadowRoot.querySelector('.picker-trigger').click();
    picker.shadowRoot.querySelector(`[data-value="${target}"]`).click();
    await settle();
    expect(events).to.deep.equal([{ value: target }]);
    expect(JSON.parse(localStorage.getItem('da-sites'))[0]).to.equal(target);
    expect(window.location.href).to.equal(href);
    selector.getCreateSiteHref = () => '#/start';
    picker.shadowRoot.querySelector('.picker-trigger').click();
    picker.shadowRoot.querySelector('[data-value="add-site"]').click();
    expect(window.location.hash).to.equal('#/start');
    expect(events).to.deep.equal([{ value: target }]);
  });

  it('redirects an external Add request when the selector is hidden', async () => {
    localStorage.setItem('da-sites', '[]');
    selector.getCreateSiteHref = () => '#/custom-start';
    document.body.append(selector);
    expect(await settle()).to.be.null;
    expect(selector.hidden).to.be.true;
    document.dispatchEvent(new CustomEvent('site-add'));
    expect(window.location.hash).to.equal('#/custom-start');
    expect(localStorage.getItem('da-sites')).to.equal('[]');
  });

  it('skips navigation when the host disables creation', async () => {
    selector.getCreateSiteHref = () => undefined;
    document.body.append(selector);
    await settle();
    document.dispatchEvent(new CustomEvent('site-add'));
    expect(window.location.href).to.equal(href);
  });

  it('reports corrupt history without overwriting it or losing the supplied selection', async () => {
    localStorage.setItem('da-sites', '{');
    selector.value = 'org/site';
    document.body.append(selector);
    await settle();
    expect(selector.value).to.equal('org/site');
    expect(localStorage.getItem('da-sites')).to.equal('{');
    expect(selector.shadowRoot.querySelector('[role="alert"]').textContent).to.include('Could not update recent sites');
  });
});
