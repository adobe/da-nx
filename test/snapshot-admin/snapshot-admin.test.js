import { expect } from '@esm-bundle/chai';
import '../../nx/blocks/snapshot-admin/snapshot-admin.js';

function mockManifestResponse() {
  return new Response(JSON.stringify({
    manifest: { title: 'Test', description: '', resources: [{ path: '/page1' }] },
  }), {
    status: 200,
    headers: new Headers({ 'Content-Type': 'application/json', 'x-da-actions': '' }),
  });
}

function mockFetch(originalFetch, apiOverrides = {}) {
  return async (url, opts) => {
    const urlStr = typeof url === 'string' ? url : url.toString();

    // Pass through local file requests (CSS, SVG served by dev server)
    if (urlStr.startsWith('/') || urlStr.startsWith('http://localhost')) {
      return originalFetch.call(window, url, opts);
    }

    // Check specific API overrides
    for (const [pattern, handler] of Object.entries(apiOverrides)) {
      if (urlStr.includes(pattern)) return handler(urlStr, opts);
    }

    // Default: proper manifest for snapshot API calls
    if (urlStr.includes('admin.hlx.page/snapshot/')) return mockManifestResponse();

    return new Response('{}', { status: 200, headers: new Headers() });
  };
}

function createSnapshotResponse(names) {
  return new Response(JSON.stringify({ snapshots: names }), {
    status: 200,
    headers: new Headers({ 'Content-Type': 'application/json', 'x-da-actions': '' }),
  });
}

describe('NxSnapshotAdmin', () => {
  let el;
  let originalFetch;

  beforeEach(() => {
    originalFetch = window.fetch;
    window.fetch = mockFetch(originalFetch);
    el = document.createElement('nx-snapshot-admin');
    // Reset URL state
    window.history.replaceState({}, '', window.location.pathname);
  });

  afterEach(() => {
    window.fetch = originalFetch;
    el.remove();
    window.history.replaceState({}, '', window.location.pathname);
  });

  // --- Unhappy paths ---

  describe('getSnapshots - error cases', () => {
    it('Does not fetch when sitePath is empty', async () => {
      document.body.appendChild(el);
      await el.updateComplete;
      expect(el._snapshots).to.be.undefined;
    });

    it('Sets error for a sitePath with no org/site', async () => {
      el.sitePath = '/invalid';
      document.body.appendChild(el);
      await el.updateComplete;
      expect(el._sitePathError).to.equal('Please enter a valid site path.');
    });

    it('Sets error when API returns failure', async () => {
      window.fetch = mockFetch(originalFetch, {
        'admin.hlx.page/snapshot/': (urlStr) => {
          if (urlStr.endsWith('/main')) {
            return new Response('{}', { status: 403, headers: new Headers() });
          }
          return mockManifestResponse();
        },
      });

      el.sitePath = '/my-org/my-site';
      document.body.appendChild(el);
      await new Promise((r) => { setTimeout(r, 100); });
      await el.updateComplete;
      expect(el._error).to.not.be.undefined;
      expect(el._error.open).to.equal(true);
    });
  });

  describe('handleDelete - edge cases', () => {
    it('Does nothing when snapshot name not found', () => {
      el._snapshots = [{ name: 'snap-1' }];
      el.handleDelete({ name: 'nonexistent' });
      expect(el._snapshots.length).to.equal(1);
      expect(el._snapshots[0].name).to.equal('snap-1');
    });
  });

  // --- Happy paths ---

  describe('getSnapshots - success', () => {
    it('Fetches and stores snapshots for valid sitePath', async () => {
      window.fetch = mockFetch(originalFetch, {
        'admin.hlx.page/snapshot/': (urlStr) => {
          if (urlStr.endsWith('/main')) return createSnapshotResponse(['snap-1', 'snap-2']);
          return mockManifestResponse();
        },
        'helix-snapshot-scheduler': () => new Response('', { status: 200, headers: new Headers() }),
        'admin.hlx.page/status/': () => new Response(
          JSON.stringify({ live: { permissions: ['read'] } }),
          { status: 200, headers: new Headers({ 'Content-Type': 'application/json' }) },
        ),
      });

      el.sitePath = '/my-org/my-site';
      document.body.appendChild(el);
      await new Promise((r) => { setTimeout(r, 200); });
      await el.updateComplete;

      expect(el._snapshots).to.be.an('array');
      expect(el._snapshots.length).to.equal(2);
      expect(el._snapshots[0].name).to.equal('snap-1');
      expect(el._snapshots[1].name).to.equal('snap-2');
    });
  });

  describe('handleNew', () => {
    it('Prepends a new open snapshot to the list', () => {
      el._snapshots = [{ name: 'existing' }];
      el.handleNew();
      expect(el._snapshots.length).to.equal(2);
      expect(el._snapshots[0].open).to.equal(true);
      expect(el._snapshots[0].name).to.be.undefined;
      expect(el._snapshots[1].name).to.equal('existing');
    });
  });

  describe('handleDelete', () => {
    it('Removes snapshot by name', () => {
      el._snapshots = [{ name: 'snap-1' }, { name: 'snap-2' }, { name: 'snap-3' }];
      el.handleDelete({ name: 'snap-2' });
      expect(el._snapshots.length).to.equal(2);
      expect(el._snapshots[0].name).to.equal('snap-1');
      expect(el._snapshots[1].name).to.equal('snap-3');
    });
  });

  describe('handleClearFilter', () => {
    it('Removes snapshot param from URL', () => {
      window.history.replaceState({}, '', '?snapshot=test');
      el._snapshots = [{ name: 'test', open: true }];
      el.handleClearFilter();

      const params = new URLSearchParams(window.location.search);
      expect(params.get('snapshot')).to.be.null;
    });

    it('Closes all open snapshots', () => {
      window.history.replaceState({}, '', '?snapshot=test');
      el._snapshots = [
        { name: 'snap-1', open: true },
        { name: 'snap-2', open: false },
        { name: 'snap-3', open: true },
      ];
      el.handleClearFilter();
      expect(el._snapshots.every((s) => s.open === false)).to.equal(true);
    });
  });

  // --- Rendering / filter tests ---

  describe('renderSnapshots', () => {
    it('Renders all snapshots when no filter', async () => {
      el._snapshots = [{ name: 'snap-1' }, { name: 'snap-2' }, { name: 'snap-3' }];
      document.body.appendChild(el);
      await el.updateComplete;

      const h2 = el.shadowRoot.querySelector('h2');
      expect(h2.textContent).to.equal('3 snapshots');
    });

    it('Renders singular label for one snapshot', async () => {
      el._snapshots = [{ name: 'snap-1' }];
      document.body.appendChild(el);
      await el.updateComplete;

      const h2 = el.shadowRoot.querySelector('h2');
      expect(h2.textContent).to.equal('1 snapshot');
    });

    it('Filters snapshots by URL search param', async () => {
      window.history.replaceState({}, '', '?snapshot=snap-2');
      el._snapshots = [{ name: 'snap-1' }, { name: 'snap-2' }, { name: 'snap-3' }];
      document.body.appendChild(el);
      await el.updateComplete;

      const h2 = el.shadowRoot.querySelector('h2');
      expect(h2.textContent).to.equal('1 snapshot');
    });

    it('Performs case-insensitive filter matching', async () => {
      window.history.replaceState({}, '', '?snapshot=SNAP-1');
      el._snapshots = [{ name: 'snap-1' }, { name: 'snap-2' }];
      document.body.appendChild(el);
      await el.updateComplete;

      const h2 = el.shadowRoot.querySelector('h2');
      expect(h2.textContent).to.equal('1 snapshot');
    });

    it('Shows See All button when filter is active', async () => {
      window.history.replaceState({}, '', '?snapshot=snap-1');
      el._snapshots = [{ name: 'snap-1' }];
      document.body.appendChild(el);
      await el.updateComplete;

      const seeAll = el.shadowRoot.querySelector('sl-button[size="small"]');
      expect(seeAll).to.not.be.null;
    });

    it('Shows Add new button when no filter', async () => {
      el._snapshots = [{ name: 'snap-1' }];
      document.body.appendChild(el);
      await el.updateComplete;

      const seeAll = el.shadowRoot.querySelector('sl-button[size="small"]');
      expect(seeAll).to.be.null;

      const buttons = el.shadowRoot.querySelectorAll('sl-button');
      const addBtn = [...buttons].find((b) => b.textContent.includes('Add new'));
      expect(addBtn).to.not.be.null;
    });

    it('Passes startOpen to nx-snapshot when filtered', async () => {
      window.history.replaceState({}, '', '?snapshot=snap-1');
      el._snapshots = [{ name: 'snap-1' }];
      document.body.appendChild(el);
      await el.updateComplete;

      const snapshot = el.shadowRoot.querySelector('nx-snapshot');
      expect(snapshot.startOpen).to.equal(true);
    });

    it('Does not pass startOpen when unfiltered', async () => {
      el._snapshots = [{ name: 'snap-1' }];
      document.body.appendChild(el);
      await el.updateComplete;

      const snapshot = el.shadowRoot.querySelector('nx-snapshot');
      expect(snapshot.startOpen).to.equal(false);
    });

    it('Shows zero count for non-matching filter', async () => {
      window.history.replaceState({}, '', '?snapshot=nonexistent');
      el._snapshots = [{ name: 'snap-1' }, { name: 'snap-2' }];
      document.body.appendChild(el);
      await el.updateComplete;

      const h2 = el.shadowRoot.querySelector('h2');
      expect(h2.textContent).to.equal('0 snapshots');
    });
  });

  describe('render', () => {
    it('Renders heading and site path form', async () => {
      document.body.appendChild(el);
      await el.updateComplete;

      const h1 = el.shadowRoot.querySelector('h1');
      expect(h1.textContent).to.equal('Snapshots');

      const form = el.shadowRoot.querySelector('.nx-site-path');
      expect(form).to.not.be.null;
    });

    it('Does not render snapshot list without data', async () => {
      document.body.appendChild(el);
      await el.updateComplete;

      const list = el.shadowRoot.querySelector('.nx-snapshot-list');
      expect(list).to.be.null;
    });
  });
});
