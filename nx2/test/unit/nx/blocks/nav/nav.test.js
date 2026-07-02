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

  it('wires a generic dialog button (data-pathname, no nx-feedback class) to open a fragment dialog on click', async () => {
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

  it('does not wire the generic dialog click handler onto an nx-feedback button (avoids double-binding with its own menu)', async () => {
    restoreFetch = mockFragmentFetch();
    const section = buildActionsSection({
      buttonHtml: '<button class="nx-feedback auto-block" data-pathname="/fragments/nav/feedback">Feedback</button>',
    });
    await nav.decorateActions(section);

    const button = section.querySelector('button');
    button.click();
    await new Promise((r) => { setTimeout(r, 50); });

    expect(document.querySelector('nx-dialog')).to.be.null;
  });
});
