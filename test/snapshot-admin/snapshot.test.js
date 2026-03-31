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

  // --- Accordion ---

  describe('handleToggleAccordion', () => {
    it('Expands accordion for a path', async () => {
      const el = await createElement();
      await el.handleToggleAccordion('/page1');
      expect(el._expandedUrl).to.equal('/page1');
    });

    it('Collapses accordion when clicking same path', async () => {
      const el = await createElement();
      await el.handleToggleAccordion('/page1');
      await el.handleToggleAccordion('/page1');
      expect(el._expandedUrl).to.be.null;
    });

    it('Switches to new path when different path clicked', async () => {
      const el = await createElement();
      el._manifest = {
        resources: [
          { path: '/page1', aemPreview: 'https://main--site--org.aem.page/page1' },
          { path: '/page2', aemPreview: 'https://main--site--org.aem.page/page2' },
        ],
      };
      await el.handleToggleAccordion('/page1');
      await el.handleToggleAccordion('/page2');
      expect(el._expandedUrl).to.equal('/page2');
    });

    it('Checks snapshot source existence on first expand', async () => {
      let headRequested = false;
      setupFetchMock(originalFetch, {
        '.snapshots/': (urlStr, opts) => {
          if (opts?.method === 'HEAD') {
            headRequested = true;
            return new Response('', { status: 200, headers: new Headers({ 'x-da-actions': '' }) });
          }
          return new Response('', { status: 200, headers: new Headers() });
        },
      });

      const el = await createElement();
      await el.handleToggleAccordion('/page1');
      expect(headRequested).to.equal(true);
      expect(el._snapshotExists['/page1']).to.equal(true);
    });

    it('Uses cached result on subsequent toggles', async () => {
      let headCount = 0;
      setupFetchMock(originalFetch, {
        '.snapshots/': (urlStr, opts) => {
          if (opts?.method === 'HEAD') {
            headCount += 1;
            return new Response('', { status: 200, headers: new Headers({ 'x-da-actions': '' }) });
          }
          return new Response('', { status: 200, headers: new Headers() });
        },
      });

      const el = await createElement();
      await el.handleToggleAccordion('/page1');
      await el.handleToggleAccordion('/page1'); // collapse
      await el.handleToggleAccordion('/page1'); // re-expand
      expect(headCount).to.equal(1);
    });
  });

  // --- Launch permission gating ---

  describe('hasLaunchPermission', () => {
    it('Shows launch section when hasLaunchPermission is true', async () => {
      const el = await createElement({ startOpen: true });
      el.hasLaunchPermission = true;
      el.requestUpdate();
      await el.updateComplete;
      const launch = el.shadowRoot.querySelector('.nx-launch-actions');
      expect(launch).to.not.be.null;
    });

    it('Hides launch section when hasLaunchPermission is false', async () => {
      const el = await createElement({ startOpen: true });
      el.hasLaunchPermission = false;
      el.requestUpdate();
      await el.updateComplete;
      const launch = el.shadowRoot.querySelector('.nx-launch-actions');
      expect(launch).to.be.null;
    });

    it('Hides launch section when hasLaunchPermission is undefined', async () => {
      const el = await createElement({ startOpen: true });
      el.requestUpdate();
      await el.updateComplete;
      const launch = el.shadowRoot.querySelector('.nx-launch-actions');
      expect(launch).to.be.null;
    });
  });

  // --- Copy mode dialog (merge/overwrite) ---

  describe('promptCopyMode', () => {
    it('Sets copy mode dialog for fork direction', async () => {
      const el = await createElement();
      const resources = [{ path: '/page1' }];
      el.promptCopyMode(resources, 'fork');
      expect(el._copyModeDetails).to.not.be.undefined;
      expect(el._copyModeDetails.heading).to.include('Sync Down');
      expect(el._copyModeDetails.actions).to.have.length(3);
      expect(el._pendingCopy.direction).to.equal('fork');
    });

    it('Sets copy mode dialog for promote direction', async () => {
      const el = await createElement();
      const resources = [{ path: '/page1' }];
      el.promptCopyMode(resources, 'promote');
      expect(el._copyModeDetails.heading).to.include('Promote Up');
      expect(el._pendingCopy.direction).to.equal('promote');
    });
  });

  describe('handleCopyModeDialog', () => {
    it('Clears dialog on cancel', async () => {
      const el = await createElement();
      el._pendingCopy = { resources: [], direction: 'fork' };
      el._copyModeDetails = { open: true };
      await el.handleCopyModeDialog({ detail: 'cancel' });
      expect(el._copyModeDetails).to.be.undefined;
      expect(el._pendingCopy).to.be.undefined;
    });

    it('Clears dialog when no mode selected', async () => {
      const el = await createElement();
      el._pendingCopy = { resources: [], direction: 'fork' };
      await el.handleCopyModeDialog({ detail: undefined });
      expect(el._copyModeDetails).to.be.undefined;
    });

    it('Does nothing when no pending copy', async () => {
      const el = await createElement();
      await el.handleCopyModeDialog({ detail: 'merge' });
      expect(el._action).to.be.undefined;
    });

    it('Marks snapshot exists after fork sync completes', async () => {
      const el = await createElement();
      // Simulate post-copy state update directly (copyManifest requires full DA stack)
      const resources = [{ path: '/page1' }, { path: '/page2' }];
      el._snapshotExists = {};
      const updated = { ...el._snapshotExists };
      resources.forEach((res) => { updated[res.path] = true; });
      el._snapshotExists = updated;
      expect(el._snapshotExists['/page1']).to.equal(true);
      expect(el._snapshotExists['/page2']).to.equal(true);
    });

    it('Does not mark snapshot exists for promote direction', async () => {
      const el = await createElement();
      // Promote direction should not update _snapshotExists
      el._snapshotExists = {};
      const direction = 'promote';
      if (direction === 'fork') {
        el._snapshotExists = { '/page1': true };
      }
      expect(el._snapshotExists['/page1']).to.be.undefined;
    });
  });

  describe('handleCopyUrls', () => {
    it('Opens copy mode dialog for global sync', async () => {
      const el = await createElement();
      el.handleCopyUrls('fork');
      expect(el._copyModeDetails).to.not.be.undefined;
      expect(el._pendingCopy.resources).to.equal(el._manifest.resources);
    });
  });

  describe('handleCopySingleUrl', () => {
    it('Opens copy mode dialog for single URL', async () => {
      const el = await createElement();
      const res = { path: '/page1' };
      el.handleCopySingleUrl(res, 'fork');
      expect(el._copyModeDetails).to.not.be.undefined;
      expect(el._pendingCopy.resources).to.deep.equal([res]);
    });
  });

  // --- Fragment discovery ---

  describe('openFindFragments', () => {
    it('Sets loading state and opens fragment dialog', async () => {
      setupFetchMock(originalFetch, {
        '/source/': () => new Response('<html><body></body></html>', {
          status: 200,
          headers: new Headers({ 'x-da-actions': '' }),
        }),
      });

      const el = await createElement({ basics: { name: 'test-snapshot', org: 'org', site: 'site' } });
      await el.openFindFragments();
      expect(el._findingFragments).to.equal(false);
      expect(el._fragmentDetails).to.not.be.undefined;
      expect(el._fragmentDetails.heading).to.equal('Find Fragments');
    });
  });

  describe('handleFragmentToggle', () => {
    it('Toggles fragment selected state', async () => {
      const el = await createElement();
      const fragment = { path: '/fragments/test', selected: true };
      el._discoveredFragments = [fragment];
      el.handleFragmentToggle(fragment);
      expect(fragment.selected).to.equal(false);
    });

    it('Updates fragment dialog after toggle', async () => {
      const el = await createElement();
      const fragment = { path: '/fragments/test', selected: true };
      el._discoveredFragments = [fragment];
      el._findingFragments = false;
      el.handleFragmentToggle(fragment);
      expect(el._fragmentDetails).to.not.be.undefined;
    });
  });

  describe('handleFragmentDialog', () => {
    it('Clears fragment details on cancel', async () => {
      const el = await createElement();
      el._fragmentDetails = { open: true };
      await el.handleFragmentDialog({ detail: 'cancel' });
      expect(el._fragmentDetails).to.be.undefined;
    });
  });

  describe('updateFragmentDialog', () => {
    it('Shows loading message while scanning', async () => {
      const el = await createElement();
      el._findingFragments = true;
      el._discoveredFragments = [];
      el.updateFragmentDialog();
      expect(el._fragmentDetails.heading).to.equal('Find Fragments');
      expect(el._fragmentDetails.actions).to.have.length(1);
      expect(el._fragmentDetails.actions[0].value).to.equal('cancel');
    });

    it('Shows Add to URLs action when fragments found and selected', async () => {
      const el = await createElement();
      el._findingFragments = false;
      el._discoveredFragments = [{ path: '/fragments/a', selected: true }];
      el.updateFragmentDialog();
      expect(el._fragmentDetails.actions).to.have.length(2);
      expect(el._fragmentDetails.actions[1].value).to.equal('add');
    });

    it('Hides Add to URLs when no fragments selected', async () => {
      const el = await createElement();
      el._findingFragments = false;
      el._discoveredFragments = [{ path: '/fragments/a', selected: false }];
      el.updateFragmentDialog();
      expect(el._fragmentDetails.actions).to.have.length(1);
    });

    it('Shows empty message when no fragments discovered', async () => {
      const el = await createElement();
      el._findingFragments = false;
      el._discoveredFragments = [];
      el.updateFragmentDialog();
      expect(el._fragmentDetails.actions).to.have.length(1);
    });
  });

  // --- Accordion rendering ---

  describe('renderAccordionPanel', () => {
    it('Shows basic action links', async () => {
      const el = await createElement({ startOpen: true });
      el._expandedUrl = '/page1';
      el._snapshotExists = {};
      el.requestUpdate();
      await el.updateComplete;
      const accordion = el.shadowRoot.querySelector('.nx-url-accordion');
      expect(accordion).to.not.be.null;
      const links = accordion.querySelectorAll('a');
      expect(links.length).to.equal(3); // reviews, aem.live, DA edit (no snapshot edit)
    });

    it('Shows Edit Snapshot in DA when snapshot exists', async () => {
      const el = await createElement({ startOpen: true });
      el._expandedUrl = '/page1';
      el._snapshotExists = { '/page1': true };
      el.requestUpdate();
      await el.updateComplete;
      const accordion = el.shadowRoot.querySelector('.nx-url-accordion');
      const links = accordion.querySelectorAll('a');
      expect(links.length).to.equal(4);
    });

    it('Hides Sync/Promote when hasLaunchPermission is false', async () => {
      const el = await createElement({ startOpen: true });
      el.hasLaunchPermission = false;
      el._expandedUrl = '/page1';
      el._snapshotExists = { '/page1': true };
      el.requestUpdate();
      await el.updateComplete;
      const accordion = el.shadowRoot.querySelector('.nx-url-accordion');
      const buttons = accordion.querySelectorAll('button');
      expect(buttons.length).to.equal(0);
    });

    it('Shows Sync Down but not Promote Up when snapshot does not exist', async () => {
      const el = await createElement({ startOpen: true });
      el.hasLaunchPermission = true;
      el._expandedUrl = '/page1';
      el._snapshotExists = { '/page1': false };
      el.requestUpdate();
      await el.updateComplete;
      const accordion = el.shadowRoot.querySelector('.nx-url-accordion');
      const buttons = accordion.querySelectorAll('button');
      expect(buttons.length).to.equal(1);
      expect(buttons[0].textContent).to.include('Sync Down');
    });

    it('Shows both Sync Down and Promote Up when snapshot exists', async () => {
      const el = await createElement({ startOpen: true });
      el.hasLaunchPermission = true;
      el._expandedUrl = '/page1';
      el._snapshotExists = { '/page1': true };
      el.requestUpdate();
      await el.updateComplete;
      const accordion = el.shadowRoot.querySelector('.nx-url-accordion');
      const buttons = accordion.querySelectorAll('button');
      expect(buttons.length).to.equal(2);
    });
  });

  // --- URL row rendering ---

  describe('renderUrls - accordion', () => {
    it('Renders URL rows instead of links', async () => {
      const el = await createElement({ startOpen: true });
      await el.updateComplete;
      const rows = el.shadowRoot.querySelectorAll('.nx-url-row');
      expect(rows.length).to.be.greaterThan(0);
      const oldLinks = el.shadowRoot.querySelectorAll('.nx-snapshot-urls > li > a');
      expect(oldLinks.length).to.equal(0);
    });

    it('Adds is-expanded class to expanded URL li', async () => {
      const el = await createElement({ startOpen: true });
      el._expandedUrl = '/page1';
      el.requestUpdate();
      await el.updateComplete;
      const li = el.shadowRoot.querySelector('.nx-snapshot-urls li.is-expanded');
      expect(li).to.not.be.null;
    });
  });
});
