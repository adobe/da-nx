import { expect } from '@esm-bundle/chai';
import { setConfig } from '../../../../../scripts/nx.js';
import { getLastSeen, setLastSeen } from '../../../../../blocks/whatsnew/whatsnew-storage.js';

// fragment.js reads config at import time, so setConfig() must run first.
// Import the dialog up front so the duplicate-guard test can create one.
await setConfig({ hostnames: [] });
await import('../../../../../blocks/whatsnew/whatsnew-dialog.js');
await import('../../../../../blocks/whatsnew/whatsnew.js');

// These trigger tests only need a published date unless they explicitly
// exercise dialog open/close behavior.
function whatsNewHtml(publishedDate) {
  return `
    <html>
      <head><meta name="published-date" content="${publishedDate}"></head>
      <body><main></main></body>
    </html>
  `;
}

const WHATSNEW_WITH_ENTRIES_HTML = `
  <html>
    <head><meta name="published-date" content="2026-09-10"></head>
    <body>
      <main>
        <div><h3 id="entry-1">Feature one</h3><picture><source srcset="./media_1.png?width=750"><img src="./media_1.png?width=750"></picture><p>Body one</p></div>
      </main>
    </body>
  </html>
`;

function mockWhatsNewFetchHtml(html) {
  const originalFetch = window.fetch;
  window.fetch = async (url, opts) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    if (urlStr.includes('/nx/fragments/guides/whats-new')) {
      return new Response(html, {
        status: 200,
        headers: new Headers({ 'Content-Type': 'text/html' }),
      });
    }
    return originalFetch.call(window, url, opts);
  };
  return () => { window.fetch = originalFetch; };
}

function mockWhatsNewFetch(publishedDate) {
  return mockWhatsNewFetchHtml(whatsNewHtml(publishedDate));
}

// Polls until async fetch/render work settles.
async function waitFor(predicate, { attempts = 50, interval = 10 } = {}) {
  for (let i = 0; i < attempts; i += 1) {
    if (predicate()) return true;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, interval); });
  }
  return predicate();
}

function createTrigger() {
  const el = document.createElement('nx-whatsnew');
  document.body.append(el);
  return el;
}

// Use an isolated in-memory store instead of shared localStorage.
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

describe('nx-whatsnew', () => {
  let restoreFetch;
  let restoreStorage;

  beforeEach(() => {
    restoreStorage = mockStorage();
  });

  afterEach(() => {
    restoreFetch?.();
    restoreFetch = undefined;
    restoreStorage();
    document.querySelectorAll('nx-whatsnew, nx-whatsnew-dialog').forEach((el) => el.remove());
  });

  it('shows the dot when the published date is newer than last seen', async () => {
    setLastSeen('2026-01-01');
    restoreFetch = mockWhatsNewFetch('2026-09-10');
    const el = createTrigger();
    await waitFor(() => el._hasUnseen !== undefined);
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.wn-trigger-dot')).to.exist;
  });

  it('does not auto-open the dialog on initial load when there is unseen content', async () => {
    setLastSeen('2026-01-01');
    restoreFetch = mockWhatsNewFetchHtml(WHATSNEW_WITH_ENTRIES_HTML);
    const el = createTrigger();
    await waitFor(() => el._hasUnseen !== undefined);
    await new Promise((r) => { setTimeout(r, 20); });
    expect(document.querySelector('nx-whatsnew-dialog')).to.not.exist;
  });

  it('does not show the dot when the published date is not newer than last seen', async () => {
    setLastSeen('2026-09-10');
    restoreFetch = mockWhatsNewFetch('2026-09-10');
    const el = createTrigger();
    await waitFor(() => el._hasUnseen !== undefined);
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.wn-trigger-dot')).to.not.exist;
  });

  it('clears the dot when the dialog closes', async () => {
    setLastSeen('2026-01-01');
    restoreFetch = mockWhatsNewFetchHtml(WHATSNEW_WITH_ENTRIES_HTML);
    const el = createTrigger();
    await waitFor(() => el._hasUnseen !== undefined);
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.wn-trigger-dot')).to.exist;

    el.shadowRoot.querySelector('button').click();
    await waitFor(() => document.querySelector('nx-whatsnew-dialog'));
    document.querySelector('nx-whatsnew-dialog').close();
    await waitFor(() => !document.querySelector('nx-whatsnew-dialog'));
    await el.updateComplete;

    expect(el.shadowRoot.querySelector('.wn-trigger-dot')).to.not.exist;
    expect(getLastSeen()).to.equal('2026-09-10');
  });

  it('does not create a second dialog when one is already open', async () => {
    restoreFetch = mockWhatsNewFetch('2026-09-10');
    document.body.append(document.createElement('nx-whatsnew-dialog'));
    const countBeforeClick = document.querySelectorAll('nx-whatsnew-dialog').length;
    const el = createTrigger();
    await waitFor(() => el._hasUnseen !== undefined);
    el.shadowRoot.querySelector('button').click();
    await new Promise((r) => { setTimeout(r, 20); });
    // The pre-existing dialog may remove itself asynchronously.
    expect(document.querySelectorAll('nx-whatsnew-dialog').length).to.be.at.most(countBeforeClick);
  });
});
