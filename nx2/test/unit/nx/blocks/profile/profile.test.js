import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setConfig } from '../../../../../scripts/nx.js';
import { setUISize } from '../../../../../utils/ui-size.js';
import { setMockIms, resetMockIms } from '../../../../mocks/ims.js';

// ims.js (imported by profile.js) is aliased to the test mock via
// wtr.config.mjs's import map. fragment.js (a transitive dependency of
// profile.js's openFragmentDialog) captures getConfig() into a
// module-level constant at import time, so setConfig() must resolve
// before profile.js is ever imported — see the same pattern in
// nav.test.js and feedback.test.js.
await setConfig({ hostnames: [] });
await import('../../../../../blocks/profile/profile.js');

function mockFragmentFetch(html = '<div><p>Legal notice content</p></div>') {
  const originalFetch = window.fetch;
  window.fetch = async (url, opts) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    if (urlStr.includes('/fragments/nav/help')) {
      return new Response(`<html><body><main>${html}</main></body></html>`, {
        status: 200,
        headers: new Headers({ 'Content-Type': 'text/html' }),
      });
    }
    return originalFetch.call(window, url, opts);
  };
  return () => { window.fetch = originalFetch; };
}

function mockFragmentFetchFailure() {
  const originalFetch = window.fetch;
  window.fetch = async (url, opts) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    if (urlStr.includes('/fragments/nav/help')) {
      return new Response('Not found', { status: 404 });
    }
    return originalFetch.call(window, url, opts);
  };
  return () => { window.fetch = originalFetch; };
}

async function createProfile() {
  const el = document.createElement('nx-profile');
  document.body.append(el);
  await el.updateComplete;
  return el;
}

// connectedCallback() fires off loadIms() without awaiting it, so the first
// updateComplete only captures the pre-IMS render (nothing). Poll for the
// component's internal state to settle before asserting on the DOM.
async function waitForSignedIn(el) {
  for (let i = 0; i < 50; i += 1) {
    if (el._ims?.anonymous || el._orgs) break;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, 10); });
  }
  await el.updateComplete;
}

// Generic poller for conditions that settle asynchronously (e.g. a dialog
// appended after a chain of dynamic imports resolves) instead of racing a
// fixed timer.
async function waitFor(predicate, { attempts = 50, interval = 10 } = {}) {
  for (let i = 0; i < attempts; i += 1) {
    if (predicate()) return true;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, interval); });
  }
  return predicate();
}

describe('nx-profile', () => {
  let restoreFetch;
  let originalSize;
  let originalClasses;
  let originalStyles;

  before(async () => {
    originalStyles = document.adoptedStyleSheets;
    const style = new CSSStyleSheet();
    await style.replace(await (await fetch('/nx2/styles/styles.css')).text());
    document.adoptedStyleSheets = [...originalStyles, style];
  });

  after(() => { document.adoptedStyleSheets = originalStyles; });

  beforeEach(() => {
    originalSize = localStorage.getItem('ui-size');
    originalClasses = document.body.className;
    setUISize({ size: 's' });
  });

  afterEach(() => {
    sinon.restore();
    restoreFetch?.();
    resetMockIms();
    document.querySelectorAll('nx-profile').forEach((el) => el.remove());
    document.querySelectorAll('nx-dialog').forEach((el) => el.remove());
    if (originalSize === null) localStorage.removeItem('ui-size');
    else localStorage.setItem('ui-size', originalSize);
    document.body.className = originalClasses;
  });

  it('renders a sign-in button when the user is anonymous', async () => {
    setMockIms({ anonymous: true });
    const el = await createProfile();
    await waitForSignedIn(el);

    const signInBtn = el.shadowRoot.querySelector('.signin-btn');
    expect(signInBtn).to.not.be.null;
    expect(signInBtn.textContent.trim()).to.equal('Sign in');
    expect(el.shadowRoot.querySelector('nx-segmented-btn')).to.be.null;
  });

  it('places UI size between Organization and Links, with no Large or theme control', async () => {
    setMockIms({ orgs: { data: [{ userId: 'test-user@AdobeID', description: 'Test Organization' }] } });
    const el = await createProfile();
    await waitForSignedIn(el);
    await customElements.whenDefined('nx-segmented-btn');
    const section = el.shadowRoot.querySelector('.nx-menu-ui-size');
    expect(section.previousElementSibling.classList.contains('nx-menu-btn-org')).to.be.true;
    expect(section.nextElementSibling.classList.contains('nx-menu-links')).to.be.true;
    const control = section.querySelector('nx-segmented-btn');
    await control.updateComplete;
    expect(control.label).to.equal('UI size');
    expect(control.items).to.deep.equal([
      { value: 's', label: 'Small' },
      { value: 'm', label: 'Medium' },
    ]);
  });

  it('switches S/M live, keeps the popover open, and uses existing segment dimensions', async () => {
    const el = await createProfile();
    await waitForSignedIn(el);
    await customElements.whenDefined('nx-segmented-btn');
    const menu = el.shadowRoot.querySelector('#nx-menu-profile');
    menu.showPopover();
    const control = el.shadowRoot.querySelector('nx-segmented-btn');
    await control.updateComplete;
    const buttons = control.shadowRoot.querySelectorAll('button');
    expect(getComputedStyle(buttons[0]).height).to.equal('24px');
    expect(getComputedStyle(buttons[0]).fontSize).to.equal('12px');
    buttons[1].click();
    await el.updateComplete;
    await control.updateComplete;
    expect(localStorage.getItem('ui-size')).to.equal('m');
    expect(document.body.classList.contains('ui-size-m')).to.be.true;
    expect(menu.matches(':popover-open')).to.be.true;
    expect(buttons[1].getAttribute('aria-pressed')).to.equal('true');
    expect(getComputedStyle(buttons[1]).height).to.equal('32px');
    expect(getComputedStyle(buttons[1]).fontSize).to.equal('14px');
    buttons[0].click();
    await el.updateComplete;
    await control.updateComplete;
    expect(localStorage.getItem('ui-size')).to.equal('s');
    expect(document.body.classList.contains('ui-size-m')).to.be.false;
    expect(menu.matches(':popover-open')).to.be.true;
    expect(getComputedStyle(buttons[0]).height).to.equal('24px');
  });

  it('initializes the selection from the saved preference', async () => {
    setUISize({ size: 'm' });
    const el = await createProfile();
    await waitForSignedIn(el);
    await customElements.whenDefined('nx-segmented-btn');
    const control = el.shadowRoot.querySelector('nx-segmented-btn');
    await control.updateComplete;
    expect(control.value).to.equal('m');
    expect(control.size).to.equal('m');
  });

  it('reports storage failures and restores the applied selection', async () => {
    const el = await createProfile();
    await waitForSignedIn(el);
    await customElements.whenDefined('nx-segmented-btn');
    const control = el.shadowRoot.querySelector('nx-segmented-btn');
    await control.updateComplete;
    sinon.stub(Storage.prototype, 'setItem').throws(new DOMException('Storage unavailable', 'QuotaExceededError'));
    control.shadowRoot.querySelectorAll('button')[1].click();
    await el.updateComplete;
    await control.updateComplete;
    expect(control.value).to.equal('s');
    expect(document.body.classList.contains('ui-size-m')).to.be.false;
    expect(el.shadowRoot.querySelector('[role="alert"]').textContent).to.include('Could not save UI size');
  });

  it('renders a "Legal notices" entry in the profile menu when signed in', async () => {
    const el = await createProfile();
    await waitForSignedIn(el);

    const legalBtn = el.shadowRoot.querySelector('.nx-menu-links .nx-menu-link-btn');
    expect(legalBtn).to.not.be.null;
    expect(legalBtn.textContent.trim()).to.equal('Legal notices');
  });

  it('opens a fragment dialog with the shared legal notices content when clicked', async () => {
    restoreFetch = mockFragmentFetch();
    const el = await createProfile();
    await waitForSignedIn(el);

    const legalBtn = el.shadowRoot.querySelector('.nx-menu-links .nx-menu-link-btn');
    legalBtn.click();
    await waitFor(() => document.querySelector('nx-dialog'));

    const dialog = document.querySelector('nx-dialog');
    expect(dialog).to.not.be.null;
    expect(dialog.textContent).to.include('Legal notice content');
  });

  it('closes the fragment dialog via the Close action button', async () => {
    restoreFetch = mockFragmentFetch();
    const el = await createProfile();
    await waitForSignedIn(el);

    const legalBtn = el.shadowRoot.querySelector('.nx-menu-links .nx-menu-link-btn');
    legalBtn.click();
    await waitFor(() => document.querySelector('nx-dialog'));

    const closeBtn = document.querySelector('nx-dialog [slot="actions"]');
    expect(closeBtn).to.not.be.null;
    expect(closeBtn.textContent.trim()).to.equal('Close');

    closeBtn.click();
    await waitFor(() => !document.querySelector('nx-dialog'));
    expect(document.querySelector('nx-dialog')).to.be.null;
  });

  it('does not append a dialog when the fragment fetch fails', async () => {
    restoreFetch = mockFragmentFetchFailure();
    const el = await createProfile();
    await waitForSignedIn(el);

    const legalBtn = el.shadowRoot.querySelector('.nx-menu-links .nx-menu-link-btn');
    legalBtn.click();

    // Give the failed fetch a chance to settle; there's no success signal
    // to poll for, so we assert absence after a short grace period.
    await new Promise((r) => { setTimeout(r, 100); });
    expect(document.querySelector('nx-dialog')).to.be.null;
  });
});
