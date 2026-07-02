import { expect } from '@esm-bundle/chai';
import { setConfig } from '../../../../../scripts/nx.js';

// fragment.js (a transitive dependency of nav.js) captures getConfig() into a
// module-level constant at import time, so setConfig() must resolve before
// nav.js is ever imported — see the same pattern in feedback.test.js.
await setConfig({ hostnames: [] });
await import('../../../../../blocks/nav/nav.js');

function buildActionsSection({ buttonHtml }) {
  const section = document.createElement('div');
  section.innerHTML = `<ul><li>${buttonHtml}</li></ul>`;
  return section;
}

function mockFragmentFetch(html = '<div><p>Help content</p></div>') {
  const originalFetch = window.fetch;
  window.fetch = async (url, opts) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    if (urlStr.includes('/fragments/nav/')) {
      return new Response(`<html><body><main>${html}</main></body></html>`, {
        status: 200,
        headers: new Headers({ 'Content-Type': 'text/html' }),
      });
    }
    return originalFetch.call(window, url, opts);
  };
  return () => { window.fetch = originalFetch; };
}

describe('nav decorateActions', () => {
  let restoreFetch;
  let nav;

  beforeEach(() => {
    nav = document.createElement('nx-nav');
  });

  afterEach(() => {
    restoreFetch?.();
    document.querySelectorAll('nx-dialog').forEach((el) => el.remove());
  });

  it('wires the generic dialog handler for a Help-style button (unknown data-pathname) and opens a fragment dialog on click', async () => {
    restoreFetch = mockFragmentFetch();
    const section = buildActionsSection({
      buttonHtml: '<button class="nx-dialog auto-block" data-pathname="/fragments/nav/help">Help</button>',
    });
    await nav.decorateActions(section);

    const button = section.querySelector('button');
    button.click();
    await new Promise((r) => { setTimeout(r, 50); });

    expect(document.querySelector('nx-dialog')).to.not.be.null;
  });

  it('wraps a button pointing at the well-known feedback path in nx-feedback-menu instead of the generic dialog handler', async () => {
    restoreFetch = mockFragmentFetch();
    // Same starting shape as the Help button — Feedback is not distinguished
    // by any linkBlocks config or class the content author sets; nav.js
    // itself detects the well-known path and rewires it.
    const section = buildActionsSection({
      buttonHtml: '<button class="nx-dialog auto-block" data-pathname="/fragments/nav/feedback">Feedback</button>',
    });
    await nav.decorateActions(section);

    const wrapper = section.querySelector('nx-feedback-menu');
    expect(wrapper).to.not.be.null;
    const button = wrapper.querySelector('button[slot="trigger"]');
    expect(button).to.not.be.null;
    expect(button.classList.contains('nx-feedback')).to.be.true;

    button.click();
    await new Promise((r) => { setTimeout(r, 50); });

    expect(document.querySelector('nx-dialog')).to.be.null;
  });
});
