import { expect } from '@esm-bundle/chai';
import '../../nx/blocks/snapshot-admin/snapshot-admin.js';

function mockManifestResponse(manifest = {}) {
  const defaults = {
    title: 'Test Snapshot',
    description: 'A test snapshot',
    resources: [{ path: '/page1' }],
    ...manifest,
  };
  return new Response(JSON.stringify({ manifest: defaults }), {
    status: 200,
    headers: new Headers({ 'Content-Type': 'application/json', 'x-da-actions': '' }),
  });
}

function setupFetchMock(originalFetch, overrides = {}) {
  window.fetch = async (url, opts) => {
    const urlStr = typeof url === 'string' ? url : url.toString();

    // Local files (CSS, SVG served by dev server)
    if (urlStr.startsWith('/') || urlStr.startsWith('http://localhost')) {
      return originalFetch.call(window, url, opts);
    }

    // Check overrides
    for (const [pattern, handler] of Object.entries(overrides)) {
      if (urlStr.includes(pattern)) return handler(urlStr, opts);
    }

    // Default: manifest response for snapshot API
    if (urlStr.includes('admin.hlx.page/snapshot/')) {
      return mockManifestResponse();
    }

    return new Response('{}', { status: 200, headers: new Headers() });
  };
}

async function createElement(props = {}) {
  const el = document.createElement('nx-snapshot');
  el.basics = props.basics || { name: 'test-snapshot' };
  if (props.isRegistered !== undefined) el.isRegistered = props.isRegistered;
  if (props.userPermissions !== undefined) el.userPermissions = props.userPermissions;
  if (props.startOpen !== undefined) el.startOpen = props.startOpen;
  document.body.appendChild(el);
  await el.updateComplete;
  // Wait for async operations (manifest fetch, SVG load)
  await new Promise((r) => { setTimeout(r, 100); });
  await el.updateComplete;
  return el;
}

describe('NxSnapshot', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = window.fetch;
    setupFetchMock(originalFetch);
    window.history.replaceState({}, '', window.location.pathname);
  });

  afterEach(() => {
    window.fetch = originalFetch;
    document.body.innerHTML = '';
    window.history.replaceState({}, '', window.location.pathname);
  });

  // --- Unhappy paths ---

  describe('validateSchedule', () => {
    it('Sets error for a date in the past', async () => {
      const el = await createElement();
      el.validateSchedule('2020-01-01T00:00:00');
      expect(el._message).to.not.be.undefined;
      expect(el._message.heading).to.equal('Schedule Error');
      expect(el._message.message).to.include('at least 5 minutes');
    });

    it('Sets error for a date less than 5 minutes from now', async () => {
      const el = await createElement();
      const twoMinFromNow = new Date(Date.now() + 2 * 60 * 1000).toISOString();
      el.validateSchedule(twoMinFromNow);
      expect(el._message.heading).to.equal('Schedule Error');
    });

    it('Does not set error for a date more than 5 minutes from now', async () => {
      const el = await createElement();
      const tenMinFromNow = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      el.validateSchedule(tenMinFromNow);
      expect(el._message).to.be.undefined;
    });
  });

  describe('handleExpand - edge cases', () => {
    it('Prevents closing when snapshot has no name', async () => {
      const el = await createElement({ basics: { open: true } });
      el.handleExpand();
      expect(el.basics.open).to.equal(true);
    });
  });

  describe('handleSave - validation', () => {
    it('Shows error when no name is provided for new snapshot', async () => {
      const el = await createElement({ basics: { open: true } });
      await el.handleSave();
      expect(el._message).to.not.be.undefined;
      expect(el._message.message).to.include('name');
    });
  });

  // --- Getters ---

  describe('_lockStatus', () => {
    it('Returns Unlocked when manifest is not locked', () => {
      const el = document.createElement('nx-snapshot');
      el._manifest = { locked: false };
      expect(el._lockStatus.text).to.equal('Unlocked');
      expect(el._lockStatus.icon).to.equal('#S2_Icon_LockOpen_20_N');
    });

    it('Returns Locked when manifest is locked', () => {
      const el = document.createElement('nx-snapshot');
      el._manifest = { locked: true };
      expect(el._lockStatus.text).to.equal('Locked');
      expect(el._lockStatus.icon).to.equal('#S2_Icon_Lock_20_N');
    });

    it('Returns Unlocked when manifest is undefined', () => {
      const el = document.createElement('nx-snapshot');
      expect(el._lockStatus.text).to.equal('Unlocked');
    });
  });

  describe('_reviewStatus', () => {
    it('Returns Ready when review is requested and locked', () => {
      const el = document.createElement('nx-snapshot');
      el._manifest = { review: 'requested', locked: true };
      expect(el._reviewStatus).to.equal('Ready');
    });

    it('Returns Rejected when review is rejected', () => {
      const el = document.createElement('nx-snapshot');
      el._manifest = { review: 'rejected' };
      expect(el._reviewStatus).to.equal('Rejected');
    });

    it('Returns undefined when review is requested but not locked', () => {
      const el = document.createElement('nx-snapshot');
      el._manifest = { review: 'requested', locked: false };
      expect(el._reviewStatus).to.be.undefined;
    });

    it('Returns undefined when no review state', () => {
      const el = document.createElement('nx-snapshot');
      el._manifest = {};
      expect(el._reviewStatus).to.be.undefined;
    });
  });

  describe('_hasPublishPermission', () => {
    it('Returns true when userPermissions is true', () => {
      const el = document.createElement('nx-snapshot');
      el.userPermissions = true;
      expect(el._hasPublishPermission).to.equal(true);
    });

    it('Returns false when userPermissions is false', () => {
      const el = document.createElement('nx-snapshot');
      el.userPermissions = false;
      expect(el._hasPublishPermission).to.equal(false);
    });

    it('Returns false when userPermissions is undefined', () => {
      const el = document.createElement('nx-snapshot');
      expect(el._hasPublishPermission).to.equal(false);
    });
  });

  // --- Happy paths ---

  describe('formatSnapshotName', () => {
    it('Strips non-alphanumeric characters except hyphens', async () => {
      const el = await createElement({ basics: { open: true } });
      const target = { value: 'My Cool Snapshot!@#$' };
      el.formatSnapshotName({ target });
      expect(target.value).to.equal('my-cool-snapshot----');
    });

    it('Lowercases the name', async () => {
      const el = await createElement({ basics: { open: true } });
      const target = { value: 'MySnapshot' };
      el.formatSnapshotName({ target });
      expect(target.value).to.equal('mysnapshot');
    });

    it('Preserves valid names', async () => {
      const el = await createElement({ basics: { open: true } });
      const target = { value: 'valid-snapshot-123' };
      el.formatSnapshotName({ target });
      expect(target.value).to.equal('valid-snapshot-123');
    });
  });

  describe('handleExpand', () => {
    it('Opens a closed snapshot', async () => {
      const el = await createElement();
      el.basics.open = false;
      el.handleExpand();
      expect(el.basics.open).to.equal(true);
    });

    it('Closes an open snapshot', async () => {
      const el = await createElement();
      el.basics.open = true;
      el.handleExpand();
      expect(el.basics.open).to.equal(false);
    });
  });

  describe('startOpen', () => {
    it('Sets basics.open to true via update lifecycle', async () => {
      const el = await createElement({ startOpen: true });
      expect(el.basics.open).to.equal(true);
    });

    it('Does not open when startOpen is false', async () => {
      const el = await createElement({ startOpen: false });
      expect(el.basics.open).to.not.equal(true);
    });
  });

  describe('handleCopyLink', () => {
    let origWriteText;

    beforeEach(() => {
      origWriteText = navigator.clipboard?.writeText;
      if (navigator.clipboard) {
        navigator.clipboard.writeText = async () => {};
      }
    });

    afterEach(() => {
      if (navigator.clipboard && origWriteText) {
        navigator.clipboard.writeText = origWriteText;
      }
    });

    it('Sets _linkCopied and stops propagation', async () => {
      const el = await createElement();
      let stopped = false;
      const mockEvent = { stopPropagation: () => { stopped = true; } };
      el.handleCopyLink(mockEvent);

      expect(el._linkCopied).to.equal(true);
      expect(stopped).to.equal(true);
    });

    it('Resets _linkCopied after timeout', async () => {
      const el = await createElement();
      const mockEvent = { stopPropagation: () => {} };
      el.handleCopyLink(mockEvent);
      expect(el._linkCopied).to.equal(true);

      await new Promise((r) => { setTimeout(r, 1600); });
      expect(el._linkCopied).to.equal(false);
    });
  });

  describe('handleDelete', () => {
    it('Opens confirmation dialog', async () => {
      const el = await createElement();
      await el.handleDelete();
      expect(el._message).to.not.be.undefined;
      expect(el._message.heading).to.equal('Delete Snapshot');
      expect(el._message.actions).to.have.length(2);
    });

    it('Dispatches delete event on success', async () => {
      setupFetchMock(originalFetch, {
        'admin.hlx.page/snapshot/': (urlStr, opts) => {
          if (opts?.method === 'DELETE') {
            return new Response('{}', { status: 200, headers: new Headers({ 'x-da-actions': '' }) });
          }
          return mockManifestResponse();
        },
      });

      const el = await createElement();
      let deleteEventFired = false;
      el.addEventListener('delete', () => { deleteEventFired = true; });

      // Simulate confirmation from dialog
      await el.handleDialog({ detail: 'delete' });
      expect(deleteEventFired).to.equal(true);
    });

    it('Sets error message on API failure', async () => {
      setupFetchMock(originalFetch, {
        'admin.hlx.page/snapshot/': (urlStr, opts) => {
          if (opts?.method === 'DELETE') {
            return new Response('{}', { status: 403, headers: new Headers() });
          }
          return mockManifestResponse();
        },
      });

      const el = await createElement();
      // Simulate confirmation from dialog
      await el.handleDialog({ detail: 'delete' });
      expect(el._message).to.not.be.undefined;
      expect(el._message.heading).to.equal('Note');
    });
  });

  // --- Rendering ---

  describe('render', () => {
    it('Shows snapshot name in header when name exists', async () => {
      const el = await createElement();
      const title = el.shadowRoot.querySelector('.nx-snapshot-header-title');
      expect(title).to.not.be.null;
      expect(title.textContent).to.include('test-snapshot');
    });

    it('Shows name input when no name', async () => {
      const el = await createElement({ basics: { open: true } });
      const input = el.shadowRoot.querySelector('input[name="name"]');
      expect(input).to.not.be.null;
    });

    it('Applies is-open class when basics.open is true', async () => {
      const el = await createElement({ startOpen: true });
      await el.updateComplete;
      const wrapper = el.shadowRoot.querySelector('.nx-snapshot-wrapper');
      expect(wrapper.classList.contains('is-open')).to.equal(true);
    });

    it('Does not apply is-open class when closed', async () => {
      const el = await createElement();
      el.basics.open = false;
      el.requestUpdate();
      await el.updateComplete;
      const wrapper = el.shadowRoot.querySelector('.nx-snapshot-wrapper');
      expect(wrapper.classList.contains('is-open')).to.equal(false);
    });

    it('Shows copy link button when snapshot is open', async () => {
      const el = await createElement({ startOpen: true });
      const linkBtn = el.shadowRoot.querySelector('.nx-snapshot-link');
      expect(linkBtn).to.not.be.null;
    });

    it('Hides copy link button when snapshot is closed', async () => {
      const el = await createElement();
      el.basics.open = false;
      el.requestUpdate();
      await el.updateComplete;
      const linkBtn = el.shadowRoot.querySelector('.nx-snapshot-link');
      expect(linkBtn).to.be.null;
    });
  });
});
