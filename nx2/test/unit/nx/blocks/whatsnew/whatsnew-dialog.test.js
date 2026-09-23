import { expect } from '@esm-bundle/chai';
import { setConfig } from '../../../../../scripts/nx.js';
import { getWhatsNewLastSeenDate } from '../../../../../blocks/whatsnew/whatsnew-flags.js';

// fragment.js (a transitive dependency of whatsnew-dialog.js's loadFragment)
// captures getConfig() into a module-level constant at import time, so
// setConfig() must resolve before whatsnew-dialog.js is ever imported —
// same pattern as nav.test.js and profile.test.js.
await setConfig({ hostnames: [] });
await import('../../../../../blocks/whatsnew/whatsnew-dialog.js');

const WHATSNEW_HTML = `
  <html>
    <head><meta name="published-date" content="2026-09-10"></head>
    <body>
      <main>
        <div><h3 id="entry-1">Feature one</h3><picture><source srcset="./media_1.png?width=750"><img src="./media_1.png?width=750"></picture><p>Body one</p></div>
        <div><h3 id="entry-2">Feature two</h3><picture><source srcset="./media_2.png?width=750"><img src="./media_2.png?width=750"></picture><p>Body two</p></div>
      </main>
    </body>
  </html>
`;

const NO_ENTRIES_HTML = `
  <html>
    <head><meta name="published-date" content="2026-09-10"></head>
    <body><main><div><p>No heading with an id here</p></div></main></body>
  </html>
`;

function mockWhatsNewFetch(html) {
  const originalFetch = window.fetch;
  window.fetch = async (url, opts) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    if (urlStr.includes('/nx/fragments/guides/whats-new')) {
      return new Response(html, { status: 200, headers: new Headers({ 'Content-Type': 'text/html' }) });
    }
    return originalFetch.call(window, url, opts);
  };
  return () => { window.fetch = originalFetch; };
}

function mockWhatsNewFetchFailure() {
  const originalFetch = window.fetch;
  window.fetch = async (url, opts) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    if (urlStr.includes('/nx/fragments/guides/whats-new')) {
      throw new Error('network error');
    }
    return originalFetch.call(window, url, opts);
  };
  return () => { window.fetch = originalFetch; };
}

// Generic poller for conditions that settle asynchronously (loadFragment,
// then parsing, then a Lit re-render) — same pattern as profile.test.js.
async function waitFor(predicate, { attempts = 50, interval = 10 } = {}) {
  for (let i = 0; i < attempts; i += 1) {
    if (predicate()) return true;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, interval); });
  }
  return predicate();
}

function createDialog() {
  const el = document.createElement('nx-whatsnew-dialog');
  document.body.append(el);
  return el;
}

// whatsnew.test.js also reads/writes the same real localStorage key, and
// wtr can run test files concurrently in the same browser origin — so
// stub the storage methods with an isolated in-memory store per test,
// instead of touching the real (shared, racy) localStorage.
function mockStorage() {
  const store = new Map();
  const original = {
    getItem: localStorage.getItem.bind(localStorage),
    setItem: localStorage.setItem.bind(localStorage),
    removeItem: localStorage.removeItem.bind(localStorage),
  };
  localStorage.getItem = (key) => (store.has(key) ? store.get(key) : null);
  localStorage.setItem = (key, value) => { store.set(key, String(value)); };
  localStorage.removeItem = (key) => { store.delete(key); };
  return () => {
    localStorage.getItem = original.getItem;
    localStorage.setItem = original.setItem;
    localStorage.removeItem = original.removeItem;
  };
}

describe('nx-whatsnew-dialog', () => {
  let restoreFetch;
  let restoreStorage;

  beforeEach(() => {
    restoreStorage = mockStorage();
  });

  afterEach(() => {
    restoreFetch?.();
    restoreFetch = undefined;
    restoreStorage();
    document.querySelectorAll('nx-whatsnew-dialog').forEach((el) => el.remove());
  });

  it('renders each entry as a card and a toc item, opens the dialog, and marks the content seen', async () => {
    restoreFetch = mockWhatsNewFetch(WHATSNEW_HTML);
    const el = createDialog();
    await waitFor(() => el.shadowRoot.querySelectorAll('.wn-card').length > 0);

    expect(el.shadowRoot.querySelectorAll('.wn-card')).to.have.lengthOf(2);
    expect(el.shadowRoot.querySelectorAll('.wn-toc-item')).to.have.lengthOf(2);
    const nxDialog = el.shadowRoot.querySelector('nx-dialog');
    expect(nxDialog.shadowRoot.querySelector('dialog').open).to.be.true;
    expect(getWhatsNewLastSeenDate()).to.equal('2026-09-10');
  });

  it('removes itself when the fragment has no valid entries', async () => {
    restoreFetch = mockWhatsNewFetch(NO_ENTRIES_HTML);
    const el = createDialog();
    await waitFor(() => !el.isConnected);
    expect(el.isConnected).to.be.false;
  });

  it('removes itself when the fetch fails', async () => {
    restoreFetch = mockWhatsNewFetchFailure();
    const el = createDialog();
    await waitFor(() => !el.isConnected);
    expect(el.isConnected).to.be.false;
    expect(getWhatsNewLastSeenDate()).to.equal(null);
  });
});
