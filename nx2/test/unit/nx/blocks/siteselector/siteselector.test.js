import { expect } from '@esm-bundle/chai';
import { setConfig } from '../../../../../scripts/nx.js';

await setConfig({ hostnames: [] });
await import('../../../../../blocks/siteselector/siteselector.js');

async function openDialog(open) {
  const added = new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const dialog = document.querySelector('nx-add-site');
      if (dialog) {
        observer.disconnect();
        resolve(dialog);
      }
    });
    observer.observe(document.body, { childList: true });
  });
  open();
  const dialog = await added;
  await dialog.updateComplete;
  await dialog.shadowRoot.querySelector('nx-dialog').updateComplete;
  return dialog;
}

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

  it('handles picker selection and Add/Cancel through the rendered controls', async () => {
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
    const dialog = await openDialog(() => {
      picker.shadowRoot.querySelector('.picker-trigger').click();
      picker.shadowRoot.querySelector('[data-value="add-site"]').click();
    });
    const closed = new Promise((resolve) => { dialog.addEventListener('close', resolve, { once: true }); });
    dialog.shadowRoot.querySelector('[type="button"]').click();
    await closed;
    expect(dialog.isConnected).to.be.false;
    expect(picker.shadowRoot.activeElement).to.equal(picker.shadowRoot.querySelector('.picker-trigger'));
  });

  it('allows Add when empty and opens the parsed site in Browse', async () => {
    localStorage.setItem('da-sites', '[]');
    document.body.append(selector);
    expect(await settle()).to.be.null;
    expect(selector.hidden).to.be.true;
    const dialog = await openDialog(() => document.dispatchEvent(new CustomEvent('site-add')));
    let opened;
    dialog.openSite = (value) => { opened = value; };
    dialog.shadowRoot.querySelector('input').value = 'https://main--new-site--org.aem.page';
    dialog.shadowRoot.querySelector('[type="submit"]').click();
    expect(new URL(opened).hash).to.equal('#/org/new-site');
    expect(localStorage.getItem('da-sites')).to.equal('[]');
    expect(window.location.href).to.equal(href);
  });

  it('closes Add and selects the site when Browse is already at the root path', async () => {
    window.history.replaceState(null, '', '/?landing=true');
    document.body.append(selector);
    await settle();
    const dialog = await openDialog(() => document.dispatchEvent(new CustomEvent('site-add')));
    const selected = new Promise((resolve) => {
      selector.addEventListener('site-select', resolve, { once: true });
    });
    dialog.shadowRoot.querySelector('input').value = 'https://main--new-site--org.aem.page';
    dialog.shadowRoot.querySelector('[type="submit"]').click();
    expect((await selected).detail).to.deep.equal({ value: 'org/new-site' });
    const picker = await settle();
    expect(window.location.pathname + window.location.search).to.equal('/?landing=true');
    expect(dialog.isConnected).to.be.false;
    expect(picker.shadowRoot.querySelector('[part="label"]').textContent).to.equal('org/new-site');
  });

  it('opens generic creation without forwarding org, site or Browse context', async () => {
    window.history.replaceState(null, '', '?nx=preview&browse=2&site=old&org=old#/org/site');
    document.body.append(selector);
    await settle();
    const dialog = await openDialog(() => document.dispatchEvent(new CustomEvent('site-add')));
    const url = new URL(dialog.shadowRoot.querySelector('.site-creation a').href);
    expect(url.pathname).to.equal('/start');
    expect([...url.searchParams]).to.deep.equal([['nx', 'preview']]);
    expect(url.hash).to.equal('');
  });

  it('accepts a host Create destination or hides it when the host returns undefined', async () => {
    document.body.append(selector);
    await settle();
    for (const destination of ['/custom-create', undefined]) {
      const calls = [];
      selector.getCreateSiteHref = (...args) => {
        calls.push(args);
        return destination;
      };
      const dialog = await openDialog(() => document.dispatchEvent(new CustomEvent('site-add')));
      const link = dialog.shadowRoot.querySelector('.site-creation a');
      if (destination) expect(link.getAttribute('href')).to.equal(destination);
      else expect(link).to.be.null;
      expect(calls).to.deep.equal([[]]);
      selector.closeDialog();
    }
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
