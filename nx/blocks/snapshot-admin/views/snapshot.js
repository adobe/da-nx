import { html, LitElement, nothing } from 'da-lit';
import getStyle from '../../../utils/styles.js';
import getSvg from '../../../utils/svg.js';
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
} from '../utils/utils.js';
import { findFragments } from '../utils/fragments.js';

const nx = `${new URL(import.meta.url).origin}/nx`;
const style = await getStyle(import.meta.url);

const ICONS = [
  `${nx}/img/icons/S2IconClose20N-icon.svg`,
  `${nx}/public/icons/S2_Icon_Compare_20_N.svg`,
  `${nx}/public/icons/S2_Icon_Save_20_N.svg`,
  `${nx}/public/icons/S2_Icon_Lock_20_N.svg`,
  `${nx}/public/icons/S2_Icon_LockOpen_20_N.svg`,
  `${nx}/public/icons/S2_Icon_Delete_20_N.svg`,
  `${nx}/public/icons/S2_Icon_OpenIn_20_N.svg`,
  `${nx}/public/icons/S2_Icon_PublishNo_20_N.svg`,
  `${nx}/public/icons/S2_Icon_Publish_20_N.svg`,
  `${nx}/public/icons/S2_Icon_ArrowDown_20_N.svg`,
  `${nx}/public/icons/S2_Icon_ArrowUp_20_N.svg`,
  `${nx}/public/icons/S2_Icon_Link_20_N.svg`,
];

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
    _linkCopied: { state: true },
    _expandedUrl: { state: true },
    _discoveredFragments: { state: true },
    _findingFragments: { state: true },
    _fragmentDetails: { state: true },
    _copyModeDetails: { state: true },
    _snapshotExists: { state: true },
  };

  constructor() {
    super();
    this._launchesCollapsed = true;
    this._snapshotExists = {};
  }

  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
  }

  update(props) {
    if (props.has('basics') && this.basics.name && !this._manifest) {
      this.loadManifest();
    }
    if (props.has('startOpen') && this.startOpen && this.basics) {
      this.basics.open = true;
    }
    super.update();
  }

  async loadManifest() {
    this._manifest = await fetchManifest(this.basics.name);
  }

  handleExpand() {
    // Do not allow closing if there is no name
    if (this.basics.open && !this.basics.name) return;

    this.basics.open = !this.basics.open;
    this.requestUpdate();
  }

  handleUrls() {
    this._editUrls = !this._editUrls;
  }

  handleLaunchesToggle() {
    this._launchesCollapsed = !this._launchesCollapsed;
  }

  async handleEditUrls() {
    const textUrls = this.getValue('[name="edit-urls"]');
    if (textUrls) {
      const currPaths = this._manifest?.resources?.map((res) => res.path) || [];
      const editedHrefs = textUrls?.split('\n') || [];
      const result = await updatePaths(this.basics.name, currPaths, editedHrefs);
      if (result.error) {
        this._message = { heading: 'Note', message: result.error, open: true };
      }
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
    }
  }

  async handleSave(lock) {
    const name = this.basics.name || this.getValue('[name="name"]');
    if (!name) {
      this._message = { heading: 'Note', message: 'Please enter a name for the snapshot.', open: true };
      this.shadowRoot.querySelector('[name="name"]').classList.add('name-missing');
      return;
    }

    this._action = 'Saving';

    // Set the name if it isn't already set
    if (!this.basics.name) this.basics.name = name;

    // Validate scheduled publish time before saving
    const scheduledPublish = this.getValue('[name="scheduler"]');
    if (scheduledPublish && scheduledPublish !== '') this.validateSchedule(scheduledPublish);

    const manifest = this.getUpdatedManifest();

    // Handle any URLs which may have changed
    await this.handleEditUrls();

    // Set the lock status if it's not undefined
    if (lock === true || lock === false) manifest.locked = lock;

    const result = await saveManifest(name, manifest);
    this._action = undefined;
    this._editUrls = false;
    if (result.error) {
      this._message = { heading: 'Note', message: result.error, open: true };
      return;
    }
    this._manifest = result;

    // Handle scheduled publish if the field exists and has a value
    if (!scheduledPublish || scheduledPublish === '') return;
    const scheduleResult = await updateSchedule(name);
    if (scheduleResult.status !== 200) {
      this._message = {
        heading: 'Schedule Error',
        message: scheduleResult.headers.get('X-Error') || 'Failed to schedule publish',
        open: true,
      };
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
    this._message = { heading: 'Copied', message: 'URLs copied to clipboard.', open: true };
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
      const result = await deleteSnapshot(this.basics.name);
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
      message: html`This will delete <b>${this.basics.name}</b>.<br/><br/>Are you sure?`,
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
        // Schedule the publish instead of immediate approval
        this._action = 'Scheduling';

        // Validate scheduled publish time before saving
        this.validateSchedule(scheduledPublish);

        // Save the manifest first with the scheduled publish data
        const manifest = this.getUpdatedManifest();
        await this.handleEditUrls();
        const saveResult = await saveManifest(this.basics.name, manifest);

        if (saveResult.error) {
          this._action = undefined;
          this._message = { heading: 'Note', message: saveResult.error, open: true };
          return;
        }

        // Now schedule the publish
        const scheduleResult = await updateSchedule(this.basics.name, true);
        this._action = undefined;

        if (scheduleResult.status !== 200) {
          this._message = {
            heading: 'Schedule Error',
            message: scheduleResult.text || 'Failed to schedule publish',
            open: true,
          };
          return;
        }

        this._message = {
          heading: 'Scheduled',
          message: 'Snapshot publish has been scheduled successfully.',
          open: true,
        };
        this.loadManifest();
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
    const result = await reviewSnapshot(this.basics.name, state);
    this._action = undefined;
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

  async handleCopyModeDialog(e) {
    const mode = e.detail;
    const pending = this._pendingCopy;
    this._copyModeDetails = undefined;
    this._pendingCopy = undefined;

    if (!pending || mode === 'cancel' || !mode) return;

    const { resources, direction } = pending;
    this._action = direction === 'fork'
      ? 'Syncing content into snapshot.'
      : 'Promoting content from snapshot.';
    await copyManifest(this.basics.name, resources, direction, mode);
    if (direction === 'fork') {
      const updated = { ...this._snapshotExists };
      resources.forEach((res) => { updated[res.path] = true; });
      this._snapshotExists = updated;
    }
    this._action = undefined;
  }

  handleCopyUrls(direction) {
    this.promptCopyMode(this._manifest.resources, direction);
  }

  handleCopySingleUrl(res, direction) {
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
    const result = await updatePaths(this.basics.name, currPaths, newHrefs);
    if (result.error) {
      this._message = { heading: 'Note', message: result.error, open: true };
    }
    this._action = undefined;
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
    if (!this._manifest?.locked) return { text: 'Unlocked', icon: '#S2_Icon_LockOpen_20_N' };
    return { text: 'Locked', icon: '#S2_Icon_Lock_20_N' };
  }

  get _reviewStatus() {
    if (this._manifest?.review === 'requested' && this._manifest?.locked) return 'Ready';
    if (this._manifest?.review === 'rejected') return 'Rejected';
    return undefined;
  }

  get _hasPublishPermission() {
    return this.userPermissions === true;
  }

  renderAccordionPanel(res) {
    const snapshotExists = this._snapshotExists[res.path] === true;
    return html`
      <div class="nx-url-accordion">
        <a href="${res.url}" target="_blank">Open on aem.reviews</a>
        <a href="${res.aemLive}" target="_blank">Open on aem.live</a>
        <a href="${res.daEdit}" target="_blank">Edit in DA</a>
        ${snapshotExists ? html`
          <a href="${res.daSnapshotEdit}" target="_blank">Edit Snapshot in DA</a>
        ` : nothing}
        ${this.hasLaunchPermission ? html`
          <button @click=${() => this.handleCopySingleUrl(res, 'fork')}>
            <svg class="icon"><use href="#S2_Icon_ArrowDown_20_N"/></svg>
            Sync Down
          </button>
          ${snapshotExists ? html`
            <button @click=${() => this.handleCopySingleUrl(res, 'promote')}>
              <svg class="icon"><use href="#S2_Icon_ArrowUp_20_N"/></svg>
              Promote Up
            </button>
          ` : nothing}
        ` : nothing}
      </div>
    `;
  }

  renderUrls() {
    return html`
      <ul class="nx-snapshot-urls">
        ${this._manifest.resources.map((res) => html`
          <li class="${this._expandedUrl === res.path ? 'is-expanded' : ''}">
            <div class="nx-url-row" @click=${() => this.handleToggleAccordion(res.path)}>
              <span>${res.path}</span>
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
      <sl-textarea
        resize="none"
        name="edit-urls"
        .value=${newLinedRes}
        class="nx-snapshot-edit-urls"></sl-textarea>
    `;
  }

  renderEditUrlBtn() {
    return html`
      <button
        data-tooltip=${this._manifest?.locked ? 'Unlock snapshot to edit URLs.' : nothing}
        ?disabled=${this._manifest?.locked}
        @click=${this.handleUrls}>Edit</button>`;
  }

  renderCancelUrlBtn() {
    return html`<button @click=${this.handleUrls}>Cancel</button>`;
  }

  renderDetails() {
    const showEdit = !this._manifest?.resources || this._editUrls;
    const count = this._manifest?.resources?.length || 0;
    const s = count === 1 ? '' : 's';

    return html`
      <div class="nx-snapshot-details">
        <div class="nx-snapshot-details-left ${showEdit ? '' : 'is-list'}">
          <div class="nx-snapshot-sub-heading nx-snapshot-sub-heading-urls">
            <p>
              ${showEdit ? html`URLs` : html`${count} URL${s}`}
              ${showEdit ? this.renderCancelUrlBtn() : this.renderEditUrlBtn()}
              ${showEdit ? nothing : html`<button @click=${() => this.handleShare('aemPreview')}>Share URLs</button>`}
              ${showEdit ? nothing : html`<button @click=${() => this.handleShare('url')}>Share Review URLs</button>`}
              ${showEdit ? nothing : html`<button @click=${() => this.openFindFragments()}>Find Fragments</button>`}
            </p>
          </div>
          ${showEdit ? this.renderEditUrls() : this.renderUrls()}
        </div>
        <div class="nx-snapshot-details-right">
          <div class="nx-snapshot-meta">
            <p class="nx-snapshot-sub-heading">Title</p>
            <sl-input type="text" name="title" .value=${this._manifest?.title}></sl-input>
            <p class="nx-snapshot-sub-heading">Description</p>
            <sl-textarea name="description" resize="none" .value="${this._manifest?.description}"></sl-textarea>
            <p class="nx-snapshot-sub-heading">Password</p>
            <sl-input type="password" name="password" .value=${this._manifest?.metadata?.reviewPassword}></sl-input>
            ${this.isRegistered && this._hasPublishPermission ? html`
              <p class="nx-snapshot-sub-heading">Schedule Publish</p>
              <sl-input type="datetime-local" name="scheduler" .value=${formatLocalDate(this._manifest?.metadata?.scheduledPublish)}></sl-input>
            ` : nothing}
          </div>
          ${this.hasLaunchPermission ? html`
            <div class="nx-launch-actions">
              <p class="nx-launch-sub-heading ${this._launchesCollapsed ? '' : 'is-expanded'}" @click=${this.handleLaunchesToggle}>Launch</p>
              ${this._launchesCollapsed ? nothing : html`
                <div class="nx-launch-action-group">
                  <button data-tooltip="Create or sync launch content in DA" @click=${() => this.handleCopyUrls('fork')}>
                    <svg class="icon"><use href="#S2_Icon_ArrowDown_20_N"/></svg>
                    Sync
                  </button>
                  <button data-tooltip="Sync launch content back to the production tree" @click=${() => this.handleCopyUrls('promote')}>
                    <svg class="icon"><use href="#S2_Icon_ArrowUp_20_N"/></svg>
                    Promote
                  </button>
                </div>
              `}
            </div>
          ` : nothing}
          <div class="nx-snapshot-actions">
            <p class="nx-snapshot-sub-heading">Snapshot</p>
            <div class="nx-snapshot-action-group">
              <button @click=${this.handleDelete} ?disabled=${this._manifest?.locked}>
                <svg class="icon"><use href="#S2_Icon_Delete_20_N"/></svg>
                Delete
              </button>
              <button @click=${this.handleLock}>
                <svg class="icon"><use href="${this._lockStatus.icon}"/></svg>
                ${this._lockStatus.text}
              </button>
              <button class="${showEdit ? 'is-editing' : ''}" @click=${() => this.handleSave()}>
                <svg class="icon"><use href="#S2_Icon_Save_20_N"/></svg>
                Save
              </button>
            </div>
            <p class="nx-snapshot-sub-heading">Review</p>
            <div class="nx-snapshot-action-group">
              <button @click=${() => this.handleReview('request')} ?disabled=${this._manifest?.locked}><svg class="icon"><use href="#S2_Icon_Compare_20_N"/></svg>Request<br/>review</button>
              <button @click=${() => this.handleReview('reject')} ?disabled=${!this._manifest?.locked}><svg class="icon"><use href="#S2_Icon_PublishNo_20_N"/></svg>Reject <br/>& unlock</button>
              <button @click=${() => this.handleReview('approve')} ?disabled=${!this._manifest?.locked}><svg class="icon"><use href="#S2_Icon_Publish_20_N"/></svg>Approve<br/>& publish</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderEditName() {
    return html`<input type="text" name="name" placeholder="Enter snapshot name" @input=${this.formatSnapshotName} />`;
  }

  renderName() {
    return html`
      <div class="nx-snapshot-header-title">
        <p>
          ${this.basics.name}
          ${this.basics.open ? html`
            <button class="nx-snapshot-link" @click=${this.handleCopyLink}>
              <svg class="icon" viewBox="0 0 20 20"><use href="#S2_Icon_Link_20_N"/></svg>
              ${this._linkCopied ? html`<span class="copied">copied</span>` : nothing}
            </button>
          ` : nothing}
        </p>
        <p>${this._reviewStatus}</p>
      </div>`;
  }

  render() {
    return html`
      <div class="nx-snapshot-wrapper ${this.basics.open ? 'is-open' : ''} ${this._action ? 'is-saving' : ''}" data-action=${this._action}>
        <div class="nx-snapshot-header" @click=${this.handleExpand}>
          ${this.basics.name ? this.renderName() : this.renderEditName()}
          <button class="nx-snapshot-expand">Expand</button>
        </div>
        ${this.renderDetails()}
      </div>
      <nx-dialog @action=${this.handleDialog} .details=${this._message}></nx-dialog>
      <nx-dialog @action=${this.handleFragmentDialog} .details=${this._fragmentDetails}></nx-dialog>
      <nx-dialog @action=${this.handleCopyModeDialog} .details=${this._copyModeDetails}></nx-dialog>
    `;
  }
}

customElements.define('nx-snapshot', NxSnapshot);
