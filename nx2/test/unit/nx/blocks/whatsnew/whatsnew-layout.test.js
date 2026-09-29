import { expect } from '@esm-bundle/chai';
import { setViewport } from '@web/test-runner-commands';
import { setConfig } from '../../../../../scripts/nx.js';

await setConfig({ hostnames: [] });
await import('../../../../../blocks/whatsnew/whatsnew-dialog.js');

// Real layout needs the global design tokens (spacing, colors) from styles.css.
await new Promise((resolve) => {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/nx2/styles/styles.css';
  link.onload = resolve;
  document.head.append(link);
});

const PANEL_MARGIN = 64;

const entry = (n) => `
  <div>
    <h3 id="entry-${n}">Feature ${n}</h3>
    <p>Body ${n} with enough text to take up some room in the card column of the dialog.</p>
    <p><a href="/media/video-${n}.mp4">/media/video-${n}.mp4</a></p>
  </div>`;

const html = (count) => `
  <html>
    <head><meta name="published-date" content="2026-09-10"></head>
    <body><main>${Array.from({ length: count }, (_, i) => entry(i + 1)).join('')}</main></body>
  </html>`;

function mockFetch(body) {
  const originalFetch = window.fetch;
  window.fetch = async (url, opts) => {
    if (String(url).includes('/fragments/guides/whats-new')) {
      return new Response(body, { status: 200, headers: { 'Content-Type': 'text/html' } });
    }
    return originalFetch.call(window, url, opts);
  };
  return () => { window.fetch = originalFetch; };
}

async function waitFor(predicate, { attempts = 100, interval = 10 } = {}) {
  for (let i = 0; i < attempts; i += 1) {
    if (predicate()) return;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, interval); });
  }
}

async function openDialog(count) {
  const el = document.createElement('nx-whatsnew-dialog');
  document.body.append(el);
  await waitFor(() => el.shadowRoot.querySelector('nx-dialog')?.shadowRoot?.querySelector('.panel'));
  const nxDialog = el.shadowRoot.querySelector('nx-dialog');
  await nxDialog.updateComplete;
  await new Promise((r) => { requestAnimationFrame(() => requestAnimationFrame(r)); });
  return {
    el,
    panel: nxDialog.shadowRoot.querySelector('.panel').getBoundingClientRect(),
    cards: el.shadowRoot.querySelector('.wn-cards'),
    body: el.shadowRoot.querySelector('.wn-body'),
    count,
  };
}

describe('nx-whatsnew-dialog layout', () => {
  let restoreFetch;

  afterEach(async () => {
    restoreFetch?.();
    document.querySelectorAll('nx-whatsnew-dialog').forEach((el) => el.remove());
    await setViewport({ width: 800, height: 600 });
  });

  it('fills the large width and caps height on desktop, scrolling only the cards', async () => {
    await setViewport({ width: 1280, height: 900 });
    restoreFetch = mockFetch(html(5));
    const { panel, cards } = await openDialog(5);

    expect(panel.width).to.equal(848);
    expect(panel.height).to.equal(620);
    expect(cards.scrollHeight).to.be.greaterThan(cards.clientHeight);
  });

  it('sizes to its content when the content is shorter than the cap', async () => {
    await setViewport({ width: 1280, height: 900 });
    restoreFetch = mockFetch(html(1));
    const { panel } = await openDialog(1);

    expect(panel.height).to.be.greaterThan(0);
    expect(panel.height).to.be.lessThan(620);
  });

  it('shrinks with a smaller viewport instead of overflowing it', async () => {
    await setViewport({ width: 700, height: 500 });
    restoreFetch = mockFetch(html(5));
    const { panel, cards } = await openDialog(5);

    expect(panel.width).to.equal(700 - PANEL_MARGIN);
    expect(panel.height).to.equal(500 - PANEL_MARGIN);
    expect(cards.scrollHeight).to.be.greaterThan(cards.clientHeight);
  });

  it('stays visible on mobile and scrolls the whole body', async () => {
    await setViewport({ width: 375, height: 667 });
    restoreFetch = mockFetch(html(5));
    const { panel, body } = await openDialog(5);

    expect(panel.width).to.equal(375 - PANEL_MARGIN);
    expect(panel.height).to.equal(667 - PANEL_MARGIN);
    expect(body.scrollHeight).to.be.greaterThan(body.clientHeight);
  });
});

describe('nx-whatsnew-dialog toc indicator', () => {
  let restoreFetch;

  beforeEach(async () => {
    await setViewport({ width: 1280, height: 900 });
  });

  afterEach(async () => {
    restoreFetch?.();
    document.querySelectorAll('nx-whatsnew-dialog').forEach((el) => el.remove());
    await setViewport({ width: 800, height: 600 });
  });

  const activeTitle = (el) => el.shadowRoot
    .querySelector('.wn-toc-item[aria-current="true"]')?.textContent.trim();

  // Records every entry that becomes active, to catch the indicator jumping around.
  function recordActive(el) {
    const seen = [];
    const observer = new MutationObserver(() => { seen.push(activeTitle(el)); });
    observer.observe(el.shadowRoot.querySelector('.wn-toc-list'), {
      subtree: true, attributes: true, attributeFilter: ['aria-current'],
    });
    return () => {
      observer.disconnect();
      return seen;
    };
  }

  const settle = () => new Promise((r) => { setTimeout(r, 150); });

  it('keeps the indicator on the clicked entry while scrolling to it', async () => {
    restoreFetch = mockFetch(html(6));
    const { el, cards } = await openDialog(6);
    await settle();
    const stop = recordActive(el);

    const scrolled = new Promise((r) => { cards.addEventListener('scrollend', r, { once: true }); });
    el.shadowRoot.querySelectorAll('.wn-toc-item')[4].click();
    await scrolled;
    await settle();

    expect([...new Set(stop())]).to.deep.equal(['Feature 5']);
  });

  it('moves the indicator to the last entry when scrolled to the bottom', async () => {
    restoreFetch = mockFetch(html(6));
    const { el, cards } = await openDialog(6);
    await settle();

    cards.scrollTo({ top: cards.scrollHeight, behavior: 'instant' });
    await settle();

    expect(activeTitle(el)).to.equal('Feature 6');
  });

  it('follows manual scrolling one entry at a time', async () => {
    restoreFetch = mockFetch(html(6));
    const { el, cards } = await openDialog(6);
    await settle();
    const stop = recordActive(el);

    const step = el.shadowRoot.querySelectorAll('.wn-card')[1].offsetTop
      - el.shadowRoot.querySelectorAll('.wn-card')[0].offsetTop;
    for (let i = 1; i <= 3; i += 1) {
      cards.scrollTo({ top: step * i, behavior: 'instant' });
      // eslint-disable-next-line no-await-in-loop
      await settle();
    }

    expect(stop()).to.deep.equal(['Feature 2', 'Feature 3', 'Feature 4']);
  });
});
