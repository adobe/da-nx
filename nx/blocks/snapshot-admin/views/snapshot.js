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
} from '../utils/utils.js';

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
];

class NxSnapshot extends LitElement {
  static properties = {
    basics: { attribute: false },
    _manifest: { state: true },
    _editUrls: { state: true },
    _message: { state: true },
    _isOpen: { state: true },
    _action: { state: true },
  };

  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
  }

  update(props) {
    if (props.has('basics') && this.basics.name && !this._manifest) {
      this.loadManifest();
    }
    super.update();
  }

  async loadManifest() {
    this._manifest = await fetchManifest(this.basics.name);
  }

  handleExpand() {
    this.basics.open = !this.basics.open;
    this.requestUpdate();
  }

  handleUrls() {
    this._editUrls = !this._editUrls;
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

  async handleSave(lock) {
    this._action = 'Saving';
    const name = this.basics.name || this.getValue('[name="name"]');

    // Set the name if it isn't already set
    if (!this.basics.name) this.basics.name = name;

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
  }

  handleLock() {
    if (!this._manifest.locked) {
      this.handleReview('request');
      return;
    }
    this.handleSave(false);
  }

  handleShare() {
    const aemPaths = this._manifest.resources.map((res) => res.aemPreview);
    const blob = new Blob([aemPaths.join('\n')], { type: 'text/plain' });
    const data = [new ClipboardItem({ [blob.type]: blob })];
    navigator.clipboard.write(data);
    this._message = { heading: 'Copied', message: 'URLs copied to clipboard.', open: true };
  }

  async handleDelete() {
    const result = await deleteSnapshot(this.basics.name);
    if (result.error) {
      this._message = { heading: 'Note', message: result.error, open: true };
      return;
    }
    const opts = { bubbles: true, composed: true };
    const event = new CustomEvent('delete', opts);
    this.dispatchEvent(event);
  }

  async handleReview(state) {
    this._action = 'Saving';
    const result = await reviewSnapshot(this.basics.name, state);
    if (result.error) {
      this._message = { heading: 'Note', message: result.error, open: true };
      return;
    }
    this.loadManifest();
    this._action = undefined;
  }

  async handleCopyUrls(direction) {
    this._action = direction === 'fork'
      ? 'Forking content into snapshot.'
      : 'Promoting content from snapshot.';
    await copyManifest(this.basics.name, this._manifest.resources, direction);
    this._action = undefined;
  }

  getValue(selector) {
    const { value } = this.shadowRoot.querySelector(selector) || {};
    return value === '' ? undefined : value;
  }

  getUpdatedManifest() {
    return {
      title: this.getValue('[name="title"]'),
      description: this.getValue('[name="description"]'),
      metadata: { reviewPassword: this.getValue('[name="password"]') },
    };
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

  renderUrls() {
    return html`
      <ul class="nx-snapshot-urls">
        ${this._manifest.resources.map((res) => html`
          <li>
            <a href="${res.url}" target="${res.url}"><span>${res.path}</span>
              <div class="icon-wrap">
                <svg class="icon"><use href="#S2_Icon_OpenIn_20_N"/></svg>
              </div>
            </a>
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

  renderUnlock() {
    return html`<button><svg class="icon"><use href=""/></svg>Unlock</button>`;
  }

  renderEditUrlBtn() {
    return html`
      <button
        title=${this._manifest?.locked ? 'Unlock snapshot to edit URLs.' : nothing}
        ?disabled=${this._manifest?.locked}
        @click=${this.handleUrls}>Edit</button>`;
  }

  renderCancelUrlBtn() {
    return html`<button @click=${this.handleUrls}>Cancel</button>`;
  }

  renderDetails() {
    const showEdit = !this._manifest?.resources || this._editUrls;
    const count = this._manifest?.resources.length || 0;
    const s = count === 1 ? '' : 's';

    return html`
      <div class="nx-snapshot-details">
        <div class="nx-snapshot-details-left ${showEdit ? '' : 'is-list'}">
          <div class="nx-snapshot-sub-heading nx-snapshot-sub-heading-urls">
            <p>
              ${showEdit ? html`URLs` : html`${count} URL${s}`}
              ${showEdit ? this.renderCancelUrlBtn() : this.renderEditUrlBtn()}
              ${showEdit ? nothing : html`<button @click=${this.handleShare}>Share</button>`}
            </p>
            <div class="nx-snapshot-sub-heading-actions">
              ${showEdit ? nothing : html`<button @click=${() => this.handleCopyUrls('fork')}>Fork</button>`}
              ${showEdit ? nothing : html`<button @click=${() => this.handleCopyUrls('promote')}>Promote</button>`}
            </div>
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
          </div>
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
    return html`<input type="text" name="name" placeholder="Enter snapshot name" />`;
  }

  renderName() {
    return html`<div class="nx-snapshot-header-title"><p>${this.basics.name}</p> <p>${this._reviewStatus}</p></div>`;
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
    `;
  }
}

customElements.define('nx-snapshot', NxSnapshot);
