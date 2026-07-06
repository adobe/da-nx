import { expect } from '@esm-bundle/chai';
import { setConfig } from '../../../../../scripts/nx.js';
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
    if (el._ims) break;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, 10); });
  }
  await el.updateComplete;
}

describe('nx-profile', () => {
  let restoreFetch;

  afterEach(() => {
    restoreFetch?.();
    resetMockIms();
    document.querySelectorAll('nx-profile').forEach((el) => el.remove());
    document.querySelectorAll('nx-dialog').forEach((el) => el.remove());
  });

  it('renders a sign-in button when the user is anonymous', async () => {
    setMockIms({ anonymous: true });
    const el = await createProfile();
    await waitForSignedIn(el);

    const signInBtn = el.shadowRoot.querySelector('.signin-btn');
    expect(signInBtn).to.not.be.null;
    expect(signInBtn.textContent.trim()).to.equal('Sign in');
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
    await new Promise((r) => { setTimeout(r, 50); });

    const dialog = document.querySelector('nx-dialog');
    expect(dialog).to.not.be.null;
    expect(dialog.textContent).to.include('Legal notice content');
  });
});
