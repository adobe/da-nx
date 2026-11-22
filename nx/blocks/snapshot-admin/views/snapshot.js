import { html, LitElement, nothing } from 'da-lit';
import getStyle from '../../../../nx2/public/utils/styles.js';
import { getConfig } from '../../../../nx2/scripts/nx.js';
import { loadHrefSvg } from '../../../../nx2/utils/svg.js';
import {
  deleteSnapshot,
  fetchManifest,
  saveManifest,
  copyManifest,
  updatePaths,
  reviewSnapshot,
  updateSchedule,
  formatLocalDate,
  checkSnapshotSource,
  queueManifest,
  queueSourceCheck,
  getScheduledPublish,
} from '../utils/utils.js';
import { findFragments } from '../utils/fragments.js';

const toast = async (opts) => (await import('../../../../nx2/blocks/shared/toast/toast.js')).showToast(opts);

const { codeBase } = getConfig();
const s2Icon = (name) => new URL(`../../../../nx2/public/icons/S2_Icon_${name}_20_N.svg`, import.meta.url).href;

const [buttons, form, style, arrowDownSvg, arrowUpSvg] = await Promise.all([
  getStyle(new URL('../../../../nx2/styles/buttons.css', import.meta.url).href),
  getStyle(new URL('../../../../nx2/styles/form.css', import.meta.url).href),
  getStyle(import.meta.url),
  loadHrefSvg(s2Icon('ArrowDown')),
  loadHrefSvg(s2Icon('ArrowUp')),
]);

// Clone per use: one SVG node can only sit in one place in the DOM
const inlineIcon = (svg) => {
  if (!svg) return nothing;
  const el = svg.cloneNode(true);
  el.classList.add('icon');
  el.setAttribute('aria-hidden', 'true');
  return el;
};

const icon = (name) => `${codeBase}/img/icons/s2-icon-${name}-20-n.svg#icon`;

const ICONS = {
  lock: icon('lock'),
  lockOpen: icon('lockopen'),
  link: icon('link'),
  exposure: icon('exposure'),
};

const SYNC_TIP = 'Sync from main content';
const PROMOTE_TIP = 'Promote to main content';

const formatSchedule = (date) => date.toLocaleString(undefined, {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});

class NxSnapshot extends LitElement {
  static properties = {
    basics: { attribute: false },
    isRegistered: { attribute: false },
    userPermissions: { attribute: false },
    hasLaunchPermission: { attribute: false },
    startOpen: { attribute: false },
    _manifest: { state: true },
    _editUrls: { state: true },
    _message: { state: true },
    _action: { state: true },
    _launchesCollapsed: { state: true },
    _launchEnabled: { state: true },
    _linkCopied: { state: true },
    _expandedUrl: { state: true },
    _discoveredFragments: { state: true },
    _findingFragments: { state: true },
    _fragmentDetails: { state: true },
    _copyModeDetails: { state: true },
    _launchDetails: { state: true },
    _snapshotExists: { state: true },
  };

  constructor() {
    super();
    this._launchEnabled = false;
    this._snapshotExists = {};
  }

  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [buttons, form, style];
  }

  update(props) {
    if (props.has('startOpen') && this.startOpen && this.basics) {
      this.basics.open = true;
      if (!this._manifest) this.loadManifest();
    }
    if (props.has('basics') && this.basics?.name && !this._manifest && !this._prefetched) {
      this.prefetchManifest();
    }
    if (props.has('hasLaunchPermission') && this.basics?.open) this.checkSources();
    super.update();
  }

  willUpdate(props) {
    if (props.has('_action') && this._action && !props.get('_action')) {
      this._focusBeforeAction = this.shadowRoot.activeElement;
    }
  }

  updated() {
    // Inert drops focus while busy; restore it once the action and any dialog it opened end.
    if (this._action || !this._focusBeforeAction) return;
    const dialogs = [
      this._message, this._fragmentDetails, this._copyModeDetails, this._launchDetails,
    ];
    if (dialogs.some((details) => details?.open)) return;
    const inDialog = this.shadowRoot.activeElement?.localName === 'nx-snapshot-dialog';
    if (inDialog || !document.activeElement || document.activeElement === document.body) {
      this._focusBeforeAction.focus({ preventScroll: true });
    }
    this._focusBeforeAction = undefined;
  }

  setManifest(manifest) {
    this._manifest = manifest;
    this._launchEnabled = manifest?.metadata?.launchEnabled === true;
    this.requestUpdate();
    if (this.basics?.open) this.checkSources();
  }

  async prefetchManifest() {
    this._prefetched = true;
    const manifest = await queueManifest(this.basics.name);
    if (!this._manifest) this.setManifest(manifest);
  }

  async loadManifest() {
    this.setManifest(await fetchManifest(this.basics.name));
  }

  checkSources() {
    if (!this.hasLaunchPermission || !this._launchEnabled || !this.basics?.name) return;
    const { name } = this.basics;
    const pending = (this._manifest?.resources || [])
      .filter((res) => this._snapshotExists[res.path] === undefined);
    pending.forEach(async ({ path }) => {
      this._snapshotExists = { ...this._snapshotExists, [path]: null };
      const exists = await queueSourceCheck({ name, path }).catch(() => false);
      this._snapshotExists = { ...this._snapshotExists, [path]: exists };
    });
  }

  handleExpand() {
    // Do not allow closing if there is no name
    if (this.basics.open && !this.basics.name) return;

    this.basics.open = !this.basics.open;
    if (this.basics.open && !this._manifest) this.loadManifest();
    else if (this.basics.open) this.checkSources();
    this.requestUpdate();
  }

  handleUrls() {
    this._editUrls = !this._editUrls;
  }

  handleEnableLaunch() {
    this._launchDetails = {
      heading: 'Enable Launch',
      message: html`Launch allows you to stage and edit content in <code>.snapshots</code> directories, so your snapshot can evolve over time rather than being a single moment-in-time capture.<br/><br/>Once enabled, you can <b>sync</b> content down for editing and <b>promote</b> changes back to the main tree.`,
      width: '500px',
      open: true,
      actions: [
        { label: 'Cancel', value: 'cancel', variant: 'primary' },
        { label: 'OK', value: 'enable' },
      ],
    };
  }

  handleLaunchDialog(e) {
    if (e.detail === 'enable') {
      this._launchEnabled = true;
      this.handleSave();
      this.checkSources();
    }
    this._launchDetails = undefined;
  }

  async handleEditUrls() {
    const textarea = this.shadowRoot.querySelector('[name="edit-urls"]');
    if (!textarea) return;
    const currPaths = this._manifest?.resources?.map((res) => res.path) || [];
    const result = await updatePaths(this.basics.name, currPaths, textarea.value.split('\n'));
    if (result.error) {
      this._message = { heading: 'Note', message: result.error, open: true };
    }
  }

  validateSchedule(scheduledPublish) {
    const scheduledDate = new Date(scheduledPublish);
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
    if (scheduledDate < fiveMinutesFromNow) {
      this._action = undefined;
      this._message = {
        heading: 'Schedule Error',
        message: 'Scheduled publish date must be at least 5 minutes from now',
        open: true,
      };
      return false;
    }
    return true;
  }

  async clearScheduledPublish(name, manifest, scheduleResult) {
    const metadata = { ...manifest.metadata, scheduledPublish: undefined };
    const result = await saveManifest(name, { ...manifest, metadata })
      .catch((e) => ({ error: e.message }));
    if (!result.error) {
      this._manifest = result;
      const input = this.shadowRoot.querySelector('[name="scheduler"]');
      if (input) input.value = '';
    }
    const error = scheduleResult.text || 'Failed to schedule publish';
    this._message = {
      heading: 'Schedule Error',
      message: result.error ? `${error}. The scheduled publish date could not be cleared: ${result.error}` : error,
      open: true,
    };
  }

  async handleSave(lock) {
    const name = this.basics.name || this.getValue('[name="name"]');
    if (!name) {
      this._message = { heading: 'Note', message: 'Please enter a name for the snapshot.', open: true };
      this.shadowRoot.querySelector('[name="name"]').classList.add('name-missing');
      return;
    }

    const scheduledPublish = this.getValue('[name="scheduler"]');
    if (scheduledPublish && !this.validateSchedule(scheduledPublish)) return;

    this._action = 'Saving';
    try {
      // Set the name if it isn't already set
      if (!this.basics.name) this.basics.name = name;

      const manifest = this.getUpdatedManifest();

      // Handle any URLs which may have changed
      await this.handleEditUrls();

      // Set the lock status if it's not undefined
      if (lock === true || lock === false) manifest.locked = lock;

      const result = await saveManifest(name, manifest);
      this._editUrls = false;
      if (result.error) {
        this._message = { heading: 'Note', message: result.error, open: true };
        return;
      }
      this._manifest = result;

      if (scheduledPublish) {
        const scheduleResult = await updateSchedule(name);
        if (scheduleResult.status !== 200) {
          await this.clearScheduledPublish(name, manifest, scheduleResult);
        }
      }
    } finally {
      this._action = undefined;
    }
  }

  handleLock() {
    if (!this._manifest.locked) {
      this.handleReview('request');
      return;
    }
    this.handleSave(false);
  }

  handleShare(type = 'aemPreview') {
    const aemPaths = this._manifest.resources.map((res) => res[type]);
    const blob = new Blob([aemPaths.join('\n')], { type: 'text/plain' });
    const data = [new ClipboardItem({ [blob.type]: blob })];
    navigator.clipboard.write(data);
    toast({ text: 'URLs copied to clipboard.' });
  }

  handleCopyLink(e) {
    e.stopPropagation();
    const url = new URL(window.location);
    url.searchParams.set('snapshot', this.basics.name);
    navigator.clipboard.writeText(url.toString());
    this._linkCopied = true;
    setTimeout(() => { this._linkCopied = false; }, 1500);
  }

  async handleDialog(e) {
    if (e.detail === 'delete') {
      this._action = true;
      const result = await deleteSnapshot(
        this.basics.name,
        this._manifest.resources.map((res) => res.path),
      ).finally(() => { this._action = undefined; });
      if (result.error) {
        this._message = { heading: 'Note', message: result.error, open: true };
        return;
      }
      const opts = { bubbles: true, composed: true };
      const event = new CustomEvent('delete', opts);
      this.dispatchEvent(event);
    } else if (e.detail === 'publish') {
      this._message = undefined;
      await this.executeReview('approve');
      return;
    }
    this._message = undefined;
  }

  handleDelete() {
    this._message = {
      heading: 'Delete Snapshot',
      message: html`This will delete <b>${this.basics.name}</b>, including any content staged for it.<br/><br/>Are you sure?`,
      open: true,
      actions: [
        { label: 'Cancel', value: 'cancel', variant: 'primary' },
        { label: 'Delete', value: 'delete', variant: 'negative' },
      ],
    };
  }

  async handleReview(state) {
    // Check if we're approving and have a scheduled publish date
    if (state === 'approve') {
      const scheduledPublish = this.getValue('[name="scheduler"]');
      if (scheduledPublish && scheduledPublish !== '') {
        if (!this.validateSchedule(scheduledPublish)) return;

        // Schedule the publish instead of immediate approval
        this._action = 'Scheduling';
        try {
          // Save the manifest first with the scheduled publish data
          const manifest = this.getUpdatedManifest();
          await this.handleEditUrls();
          const saveResult = await saveManifest(this.basics.name, manifest);

          if (saveResult.error) {
            this._message = { heading: 'Note', message: saveResult.error, open: true };
            return;
          }

          // Now schedule the publish
          const scheduleResult = await updateSchedule(this.basics.name, true);

          if (scheduleResult.status !== 200) {
            await this.clearScheduledPublish(this.basics.name, manifest, scheduleResult);
            return;
          }

          toast({ text: 'Snapshot publish has been scheduled successfully.' });
          this.loadManifest();
        } finally {
          this._action = undefined;
        }
        return;
      }
      this._message = {
        heading: 'Approve & Publish Snapshot',
        message: html`This will directly publish the snapshot content to production.<br/>Existing prod content will be overwritten.<br/><br/>Are you sure?`,
        open: true,
        actions: [
          { label: 'Cancel', value: 'cancel', variant: 'primary' },
          { label: 'Publish', value: 'publish' },
        ],
      };
      return;
    }

    // Normal review flow (request or reject)
    await this.executeReview(state);
  }

  async executeReview(state) {
    this._action = 'Saving';
    const result = await reviewSnapshot(this.basics.name, state)
      .finally(() => { this._action = undefined; });
    if (result.error) {
      this._message = { heading: 'Note', message: result.error, open: true };
      return;
    }
    this.loadManifest();
  }

  promptCopyMode(resources, direction) {
    const label = direction === 'fork' ? 'Sync Down' : 'Promote Up';
    this._pendingCopy = { resources, direction };
    this._copyModeDetails = {
      heading: `${label}: Merge or Overwrite?`,
      message: html`<b>Merge</b> will merge the files and show a diff.<br/><b>Overwrite</b> will replace the destination content entirely.`,
      open: true,
      actions: [
        { label: 'Cancel', value: 'cancel', variant: 'primary' },
        { label: 'Merge', value: 'merge' },
        { label: 'Overwrite', value: 'overwrite' },
      ],
    };
  }

  async executeCopy(resources, direction, mode) {
    this._action = direction === 'fork'
      ? 'Syncing content into snapshot.'
      : 'Promoting content from snapshot.';
    try {
      const urls = await copyManifest(this.basics.name, resources, direction, mode);
      const copied = new Set(urls.filter((url) => url.status === 'success').map((url) => url.path));
      if (direction === 'fork' && copied.size) {
        const updated = { ...this._snapshotExists };
        copied.forEach((path) => { updated[path] = true; });
        this._snapshotExists = updated;
      }
      const failed = resources.filter((res) => !copied.has(res.path)).length;
      if (failed) {
        this._message = {
          heading: 'Note',
          message: `${failed} of ${resources.length} page${resources.length === 1 ? '' : 's'} could not be ${direction === 'fork' ? 'synced' : 'promoted'}.`,
          open: true,
        };
      }
    } finally {
      this._action = undefined;
    }
  }

  async handleCopyModeDialog(e) {
    const mode = e.detail;
    const pending = this._pendingCopy;
    this._copyModeDetails = undefined;
    this._pendingCopy = undefined;

    if (!pending || mode === 'cancel' || !mode) return;
    await this.executeCopy(pending.resources, pending.direction, mode);
  }

  handleCopyUrls(direction) {
    this.promptCopyMode(this._manifest.resources, direction);
  }

  handleCopySingleUrl(res, direction) {
    if (direction === 'fork' && this._snapshotExists[res.path] === false) {
      this.executeCopy([res], direction, 'overwrite');
      return;
    }
    this.promptCopyMode([res], direction);
  }

  async openFindFragments() {
    this._findingFragments = true;
    this._discoveredFragments = [];
    this.updateFragmentDialog();

    const { org, site } = this.basics;
    const fragments = await findFragments(this._manifest.resources, org, site);
    this._discoveredFragments = fragments;
    this._findingFragments = false;
    this.updateFragmentDialog();
  }

  updateFragmentDialog() {
    const loading = this._findingFragments;
    const fragments = this._discoveredFragments || [];
    const hasSelected = fragments.some((f) => f.selected);

    let message;
    if (loading) {
      message = html`<p class="nx-fragment-loading">Scanning for fragments...</p>`;
    } else if (fragments.length > 0) {
      message = html`
        <ul class="nx-fragment-list">
          ${fragments.map((fragment) => html`
            <li>
              <label>
                <input
                  type="checkbox"
                  .checked=${fragment.selected}
                  @change=${() => this.handleFragmentToggle(fragment)} />
                ${fragment.path}
              </label>
            </li>
          `)}
        </ul>`;
    } else {
      message = html`<p class="nx-fragment-empty">No new fragments found.</p>`;
    }

    this._fragmentDetails = {
      heading: 'Find Fragments',
      message,
      open: true,
      actions: [
        { label: 'Cancel', value: 'cancel', variant: 'primary' },
        ...(!loading && fragments.length > 0 && hasSelected
          ? [{ label: 'Add to URLs', value: 'add' }]
          : []),
      ],
    };
  }

  handleFragmentToggle(fragment) {
    fragment.selected = !fragment.selected;
    this._discoveredFragments = [...this._discoveredFragments];
    this.updateFragmentDialog();
  }

  async handleFragmentDialog(e) {
    if (e.detail === 'add') {
      await this.handleAddFragments();
      return;
    }
    this._fragmentDetails = undefined;
  }

  async handleAddFragments() {
    const selected = this._discoveredFragments.filter((f) => f.selected);
    if (!selected.length) return;

    this._fragmentDetails = undefined;
    this._action = 'Adding fragments';
    const currPaths = this._manifest.resources.map((res) => res.path);
    const newHrefs = [
      ...this._manifest.resources.map((res) => res.aemPreview),
      ...selected.map((f) => `https://placeholder.com${f.path}`),
    ];
    const result = await updatePaths(this.basics.name, currPaths, newHrefs)
      .finally(() => { this._action = undefined; });
    if (result.error) {
      this._message = { heading: 'Note', message: result.error, open: true };
    }
    this._discoveredFragments = [];
    await this.loadManifest();
  }

  async handleToggleAccordion(path) {
    if (this._expandedUrl === path) {
      this._expandedUrl = null;
      return;
    }
    this._expandedUrl = path;
    if (this._snapshotExists[path] === undefined && this.basics.name) {
      const exists = await checkSnapshotSource(this.basics.name, path);
      this._snapshotExists = { ...this._snapshotExists, [path]: exists };
    }
  }

  getValue(selector) {
    const { value } = this.shadowRoot.querySelector(selector) || {};
    return value === '' ? undefined : value;
  }

  getUpdatedManifest() {
    const manifest = {
      title: this.getValue('[name="title"]'),
      description: this.getValue('[name="description"]'),
      metadata: { reviewPassword: this.getValue('[name="password"]') },
    };

    if (this._launchEnabled) {
      manifest.metadata.launchEnabled = true;
    }

    // Add scheduled publish to metadata if it exists
    const scheduledPublish = this.getValue('[name="scheduler"]');
    if (scheduledPublish) {
      manifest.metadata.scheduledPublish = new Date(scheduledPublish).toISOString();
    }
    return manifest;
  }

  formatSnapshotName({ target }) {
    // Only allow alphanumeric characters and hyphens
    target.value = target.value.replaceAll(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
    this.shadowRoot.querySelector('[name="name"]')?.classList?.remove('name-missing');
  }

  get _lockStatus() {
    if (!this._manifest?.locked) return { text: 'Unlocked', icon: ICONS.lockOpen };
    return { text: 'Locked', icon: ICONS.lock };
  }

  get _reviewStatus() {
    if (this._manifest?.review === 'requested' && this._manifest?.locked) return 'Ready';
    if (this._manifest?.review === 'rejected') return 'Rejected';
    return undefined;
  }

  get _hasPublishPermission() {
    return this.userPermissions === true;
  }

  get _showContentActions() {
    return this.hasLaunchPermission && this._launchEnabled;
  }

  renderAccordionPanel(res) {
    const snapshotExists = this._snapshotExists[res.path] === true;
    return html`
      <div class="nx-url-accordion">
        <a class="nx-action-btn nx-btn-sm" href="${res.url}" target="_blank">Open on aem.reviews</a>
        <a class="nx-action-btn nx-btn-sm" href="${res.aemLive}" target="_blank">Open on aem.live</a>
        <a class="nx-action-btn nx-btn-sm" href="${res.daEdit}" target="_blank">Edit in DA</a>
        ${snapshotExists ? html`
          <a class="nx-action-btn nx-btn-sm" href="${res.daSnapshotEdit}" target="_blank">Edit snapshot content</a>
        ` : nothing}
      </div>
    `;
  }

  renderUrlActions(res) {
    const snapshotExists = this._snapshotExists[res.path] === true;
    return html`
      <span class="nx-url-actions">
        <button class="nx-action-btn nx-btn-sm" data-tooltip=${SYNC_TIP} @click=${() => this.handleCopySingleUrl(res, 'fork')}>
          ${inlineIcon(arrowDownSvg)} Sync
        </button>
        <button class="nx-action-btn nx-btn-sm"
          data-tooltip=${snapshotExists ? PROMOTE_TIP : 'Sync this page first'}
          ?disabled=${!snapshotExists}
          @click=${() => this.handleCopySingleUrl(res, 'promote')}>
          ${inlineIcon(arrowUpSvg)} Promote
        </button>
      </span>
    `;
  }

  renderUrls() {
    return html`
      <ul class="nx-snapshot-urls">
        ${(this._manifest?.resources || []).map((res) => html`
          <li class="${this._expandedUrl === res.path ? 'is-expanded' : ''}">
            <div class="nx-url-row">
              <button class="nx-url-toggle" aria-expanded=${this._expandedUrl === res.path}
                @click=${() => this.handleToggleAccordion(res.path)}>
                <span>${res.path}</span>
              </button>
              ${this._showContentActions ? this.renderUrlActions(res) : nothing}
            </div>
            ${this._expandedUrl === res.path ? this.renderAccordionPanel(res) : nothing}
          </li>
        `)}
      </ul>
    `;
  }

  renderEditUrls() {
    const resources = this._manifest?.resources || [];
    const newLinedRes = resources.map((res) => res.aemPreview).join('\n');
    return html`
      <textarea
        name="edit-urls"
        class="nx-input nx-snapshot-edit-urls"
        aria-label="Snapshot URLs, one per line"
        .value=${newLinedRes}></textarea>
    `;
  }

  renderEditUrlBtn() {
    return html`
      <button
        class="nx-action-btn-quiet nx-btn-sm"
        data-tooltip=${this._manifest?.locked ? 'Unlock snapshot to edit URLs.' : nothing}
        ?disabled=${this._manifest?.locked}
        @click=${this.handleUrls}>Edit</button>`;
  }

  renderCancelUrlBtn() {
    return html`<button class="nx-action-btn-quiet nx-btn-sm" @click=${this.handleUrls}>Cancel</button>`;
  }

  renderDetails() {
    const showEdit = (!this.basics.name && !this._manifest?.resources) || this._editUrls;
    const count = this._manifest?.resources?.length || 0;
    const s = count === 1 ? '' : 's';

    return html`
      <div class="nx-snapshot-details">
        <div class="nx-snapshot-details-left ${showEdit ? '' : 'is-list'}">
          <div class="nx-snapshot-sub-heading nx-snapshot-sub-heading-urls">
            <p>
              ${showEdit ? html`URLs` : html`${count} URL${s}`}
              ${showEdit ? this.renderCancelUrlBtn() : this.renderEditUrlBtn()}
              ${showEdit ? nothing : html`<button class="nx-action-btn-quiet nx-btn-sm" @click=${() => this.handleShare('aemPreview')}>Share URLs</button>`}
              ${showEdit ? nothing : html`<button class="nx-action-btn-quiet nx-btn-sm" @click=${() => this.handleShare('url')}>Share Review URLs</button>`}
              ${showEdit ? nothing : html`<button class="nx-action-btn-quiet nx-btn-sm" @click=${() => this.openFindFragments()}>Find Fragments</button>`}
            </p>
          </div>
          ${showEdit ? this.renderEditUrls() : this.renderUrls()}
        </div>
        <div class="nx-snapshot-details-right">
          <div class="nx-snapshot-meta">
            <div class="nx-form-field">
              <label for="snapshot-title">Title</label>
              <input id="snapshot-title" class="nx-input" type="text" name="title" .value=${this._manifest?.title || ''}>
            </div>
            <div class="nx-form-field">
              <label for="snapshot-description">Description</label>
              <textarea id="snapshot-description" class="nx-input" name="description" .value=${this._manifest?.description || ''}></textarea>
            </div>
            <div class="nx-form-field">
              <label for="snapshot-password">Password</label>
              <input id="snapshot-password" class="nx-input" type="password" name="password" autocomplete="new-password" .value=${this._manifest?.metadata?.reviewPassword || ''}>
            </div>
            ${this.isRegistered && this._hasPublishPermission ? html`
              <div class="nx-form-field">
                <label for="snapshot-scheduler">Schedule publish</label>
                <input id="snapshot-scheduler" class="nx-input" type="datetime-local" name="scheduler" .value=${formatLocalDate(this._manifest?.metadata?.scheduledPublish) || ''}>
              </div>
            ` : nothing}
          </div>
        </div>
      </div>
      ${this.hasLaunchPermission ? this.renderContentBar() : nothing}
      ${this.renderActionBar(showEdit)}
    `;
  }

  renderContentBar() {
    return html`
      <div class="nx-launch-actions">
        <p class="nx-launch-sub-heading">Content</p>
        <div class="nx-launch-action-group">
          ${this._launchEnabled ? html`
            <button class="nx-action-btn" data-tooltip=${SYNC_TIP} @click=${() => this.handleCopyUrls('fork')}>
              ${inlineIcon(arrowDownSvg)} Sync all pages
            </button>
            <button class="nx-action-btn" data-tooltip=${PROMOTE_TIP} @click=${() => this.handleCopyUrls('promote')}>
              ${inlineIcon(arrowUpSvg)} Promote all pages
            </button>
          ` : html`
            <button class="nx-action-btn" @click=${this.handleEnableLaunch}>Enable Launch for this snapshot</button>
          `}
        </div>
      </div>
    `;
  }

  renderActionBar(showEdit) {
    const locked = !!this._manifest?.locked;
    return html`
      <div class="nx-snapshot-actions">
        <div class="nx-snapshot-action-group">
          <button class="${locked ? 'nx-action-btn' : 'nx-btn-accent'}" @click=${() => this.handleReview('request')} ?disabled=${locked}>Request review</button>
          <button class="nx-action-btn" @click=${() => this.handleReview('reject')} ?disabled=${!locked}>Reject & unlock</button>
          <button class="${locked ? 'nx-btn-accent' : 'nx-action-btn'}" @click=${() => this.handleReview('approve')} ?disabled=${!locked}>Approve & publish</button>
        </div>
        <div class="nx-snapshot-action-group">
          <button class="nx-action-btn-quiet" @click=${this.handleDelete} ?disabled=${locked}>Delete</button>
          <button class="nx-action-btn" @click=${this.handleLock}>
            <svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="${this._lockStatus.icon}"></use></svg>
            ${this._lockStatus.text}
          </button>
          <button class="nx-btn-primary ${showEdit ? 'is-editing' : ''}" @click=${() => this.handleSave()}>Save</button>
        </div>
      </div>
    `;
  }

  get _maxNameLength() {
    const { org, site } = this.basics;
    return 64 - `--main--${site}--${org}`.length;
  }

  renderEditName() {
    return html`<input type="text" class="nx-input" name="name" aria-label="Snapshot name" placeholder="Enter snapshot name" maxlength=${this._maxNameLength} @input=${this.formatSnapshotName} />`;
  }

  renderMeta() {
    const count = this._manifest?.resources?.length;
    const scheduled = getScheduledPublish(this._manifest);
    return html`
      <div class="nx-snapshot-header-meta">
        ${count === undefined ? nothing : html`<span class="nx-snapshot-count">${count} page${count === 1 ? '' : 's'}</span>`}
        ${this._reviewStatus ? html`<span class="nx-snapshot-status is-${this._reviewStatus.toLowerCase()}">${this._reviewStatus}</span>` : nothing}
        ${scheduled ? html`<span class="nx-snapshot-status is-scheduled" title=${scheduled.toLocaleString()}>Scheduled · ${formatSchedule(scheduled)}</span>` : nothing}
      </div>`;
  }

  renderName() {
    return html`
      <div class="nx-snapshot-header-title">
        <p class="nx-snapshot-name">
          ${this.basics.name}
          ${this.basics.open ? html`
            <button class="nx-snapshot-link" aria-label="Copy link to snapshot" @click=${this.handleCopyLink}>
              <svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="${ICONS.link}"></use></svg>
              ${this._linkCopied ? html`<span class="copied">copied</span>` : nothing}
            </button>
          ` : nothing}
        </p>
        ${this._manifest?.title ? html`<p class="nx-snapshot-title">${this._manifest.title}</p>` : nothing}
      </div>
      ${this.renderMeta()}`;
  }

  render() {
    return html`
      <div class="nx-snapshot-wrapper ${this.basics.open ? 'is-open' : ''} ${this._action ? 'is-saving' : ''}" ?inert=${!!this._action}>
        ${this._action ? html`<div class="nx-snapshot-overlay">
          ${typeof this._action === 'string' ? html`<span>${this._action}</span>` : nothing}
          <svg class="nx-snapshot-spinner" viewBox="0 0 20 20" aria-hidden="true"><use href="${ICONS.exposure}"></use></svg>
        </div>` : nothing}
        <div class="nx-snapshot-header" @click=${this.handleExpand}>
          ${this.basics.name ? this.renderName() : this.renderEditName()}
          <button class="nx-snapshot-expand" aria-expanded=${!!this.basics.open}>Expand</button>
        </div>
        <div class="nx-snapshot-body">${this.renderDetails()}</div>
      </div>
      <nx-snapshot-dialog @action=${this.handleDialog} .details=${this._message}></nx-snapshot-dialog>
      <nx-snapshot-dialog @action=${this.handleFragmentDialog} .details=${this._fragmentDetails}></nx-snapshot-dialog>
      <nx-snapshot-dialog @action=${this.handleCopyModeDialog} .details=${this._copyModeDetails}></nx-snapshot-dialog>
      <nx-snapshot-dialog @action=${this.handleLaunchDialog} .details=${this._launchDetails}></nx-snapshot-dialog>
    `;
  }
}

customElements.define('nx-snapshot', NxSnapshot);
