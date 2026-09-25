import { expect } from '@esm-bundle/chai';
import { setConfig } from '../../../../../scripts/nx.js';
import { getWhatsNewLastSeenDate, setWhatsNewLastSeenDate } from '../../../../../blocks/whatsnew/whatsnew-flags.js';

// _openDialog() dynamically imports whatsnew-dialog.js, which transitively
// depends on fragment.js's module-level getConfig() call — so setConfig()
// must resolve before that import ever happens, same reasoning as
// nav.test.js/profile.test.js. Also statically import whatsnew-dialog.js
// here so the duplicate-guard test can create one directly.
await setConfig({ hostnames: [] });
await import('../../../../../blocks/whatsnew/whatsnew-dialog.js');
await import('../../../../../blocks/whatsnew/whatsnew.js');

// No valid entries in the body: these tests only care about the nav
// trigger's own dot/guard logic, not the dialog's rendered content, and an
// entry-less fragment means the auto-opened dialog removes itself without
// ever calling setWhatsNewLastSeenDate — keeping this file from stomping on
// the "last seen" localStorage key other test files also read/write.
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

function mockWhatsNewFetch(publishedDate) {
  const originalFetch = window.fetch;
  window.fetch = async (url, opts) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    if (urlStr.includes('/nx/fragments/guides/whats-new')) {
      return new Response(whatsNewHtml(publishedDate), {
        status: 200,
        headers: new Headers({ 'Content-Type': 'text/html' }),
      });
    }
    return originalFetch.call(window, url, opts);
  };
  return () => { window.fetch = originalFetch; };
}

// Generic poller for _checkUnseen's async fetch settling — same pattern as
// profile.test.js's waitFor.
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

// whatsnew-dialog.test.js also reads/writes the same real localStorage key,
// and wtr can run test files concurrently in the same browser origin — so
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
    setWhatsNewLastSeenDate('2026-01-01');
    restoreFetch = mockWhatsNewFetch('2026-09-10');
    const el = createTrigger();
    await waitFor(() => el._hasUnseen !== undefined);
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.wn-trigger-dot')).to.exist;
  });

  it('does not auto-open the dialog on initial load when there is unseen content', async () => {
    setWhatsNewLastSeenDate('2026-01-01');
    restoreFetch = mockWhatsNewFetch('2026-09-10');
    const originalFetch = window.fetch;
    window.fetch = async (url, opts) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.includes('/nx/fragments/guides/whats-new')) {
        return new Response(WHATSNEW_WITH_ENTRIES_HTML, {
          status: 200,
          headers: new Headers({ 'Content-Type': 'text/html' }),
        });
      }
      return originalFetch.call(window, url, opts);
    };
    restoreFetch = () => { window.fetch = originalFetch; };
    const el = createTrigger();
    await waitFor(() => el._hasUnseen !== undefined);
    await new Promise((r) => { setTimeout(r, 20); });
    expect(document.querySelector('nx-whatsnew-dialog')).to.not.exist;
  });

  it('does not show the dot when the published date is not newer than last seen', async () => {
    setWhatsNewLastSeenDate('2026-09-10');
    restoreFetch = mockWhatsNewFetch('2026-09-10');
    const el = createTrigger();
    await waitFor(() => el._hasUnseen !== undefined);
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.wn-trigger-dot')).to.not.exist;
  });

  it('clears the dot when the dialog closes', async () => {
    setWhatsNewLastSeenDate('2026-01-01');
    const originalFetch = window.fetch;
    window.fetch = async (url, opts) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.includes('/nx/fragments/guides/whats-new')) {
        return new Response(WHATSNEW_WITH_ENTRIES_HTML, {
          status: 200,
          headers: new Headers({ 'Content-Type': 'text/html' }),
        });
      }
      return originalFetch.call(window, url, opts);
    };
    restoreFetch = () => { window.fetch = originalFetch; };
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
    expect(getWhatsNewLastSeenDate()).to.equal('2026-09-10');
  });

  it('does not create a second dialog when one is already open', async () => {
    restoreFetch = mockWhatsNewFetch('2026-09-10');
    document.body.append(document.createElement('nx-whatsnew-dialog'));
    const countBeforeClick = document.querySelectorAll('nx-whatsnew-dialog').length;
    const el = createTrigger();
    await waitFor(() => el._hasUnseen !== undefined);
    el.shadowRoot.querySelector('button').click();
    await new Promise((r) => { setTimeout(r, 20); });
    // The pre-existing dialog may remove itself asynchronously (its fixture
    // has no entries) — assert the guard never let the count grow past what
    // it was before the click, rather than pinning to an exact count that
    // races against that unrelated self-removal.
    expect(document.querySelectorAll('nx-whatsnew-dialog').length).to.be.at.most(countBeforeClick);
  });
});
