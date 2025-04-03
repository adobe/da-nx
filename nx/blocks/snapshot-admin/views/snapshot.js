import { html, LitElement, nothing } from 'da-lit';
import getStyle from '../../../utils/styles.js';
import getSvg from '../../../utils/svg.js';
import {
  publishSnapshot,
  deleteSnapshot,
  fetchManifest,
  saveManifest,
  updatePaths,
} from '../utils/utils.js';

const nx = `${new URL(import.meta.url).origin}/nx`;
const style = await getStyle(import.meta.url);

const ICONS = [
  `${nx}/img/icons/S2IconClose20N-icon.svg`,
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
    _isOpen: { state: true },
    _isSaving: { state: true },
    _error: { state: true },
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

  async handleEditUrls() {
    if (this._editUrls) {
      this._isSaving = true;

      // parse text area
      const textUrls = this.getValue('[name="edit-urls"]');

      // Normalize our paths
      const currPaths = this._manifest.resources.map((res) => res.path);
      const editedHrefs = textUrls.split('\n');

      const result = await updatePaths(this.basics.name, currPaths, editedHrefs);
      this._isSaving = false;
      if (result.error) {
        this._error = { heading: 'Note', message: result.error, open: true };
        return;
      }
      this._manifest.resources = result;
      this._editUrls = false;
      return;
    }
    this._editUrls = true;
  }

  handleCancelUrls() {
    this._editUrls = false;
  }

  async handleSave(lock) {
    this._isSaving = true;
    const name = this.basics.name || this.getValue('[name="name"]');
    const manifest = this.getUpdatedManifest();

    // Set the lock status if it's not undefined
    if (lock === true || lock === false) manifest.locked = lock;

    const result = await saveManifest(name, manifest);
    this._isSaving = false;
    if (result.error) {
      this._error = { heading: 'Note', message: result.error, open: true };
      return;
    }
    this._manifest = result;
  }

  handleLock() {
    const lock = !this._manifest.locked;
    this.handleSave(lock);
  }

  async handleDelete() {
    const result = await deleteSnapshot(this.basics.name);
    if (result.error) {
      this._error = { heading: 'Note', message: result.error, open: true };
      return;
    }
    const opts = { bubbles: true, composed: true };
    const event = new CustomEvent('delete', opts);
    this.dispatchEvent(event);
  }

  async handlePublish() {
    this._isSaving = true;
    const result = await publishSnapshot(this.basics.name);
    this._isSaving = true;
    if (result.error) {
      this._error = { heading: 'Note', message: result.error, open: true };
      return;
    }
    this._manifest = result;
  }

  getValue(selector) {
    const { value } = this.shadowRoot.querySelector(selector);
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

  renderDetails() {
    const count = this._manifest?.resources.length || 0;
    const s = count === 1 ? '' : 's';

    return html`
      <div class="nx-snapshot-details">
        <div class="nx-snapshot-details-left ${!this._editUrls ? 'is-list' : ''}">
          <div class="nx-snapshot-sub-heading nx-snapshot-sub-heading-urls">
            <p>${!this._editUrls ? html`${count} URL${s}` : html`URLs`}</p>
            <div class="nx-snapshot-sub-heading-actions">
              <button
                title=${this._manifest?.locked ? 'Unlock snapshot to edit URLs.' : nothing}
                ?disabled=${this._manifest?.locked}
                @click=${this.handleEditUrls}>${this._editUrls ? 'Save' : 'Edit'}</button>
              ${this._editUrls ? html`<button @click=${this.handleCancelUrls}>Cancel</button>` : nothing}
              ${!this._editUrls ? html`<button>Share</button>` : nothing}
            </div>
          </div>
          ${this._manifest?.resources && !this._editUrls ? this.renderUrls() : this.renderEditUrls()}
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
              <button @click=${() => this.handleSave()}>
                <svg class="icon"><use href="#S2_Icon_Save_20_N"/></svg>
                Save
              </button>
              <button @click=${this.handleLock}>
                <svg class="icon"><use href="${this._lockStatus.icon}"/></svg>
                ${this._lockStatus.text}
              </button>
              <button @click=${this.handleDelete} ?disabled=${this._manifest?.locked}>
                <svg class="icon"><use href="#S2_Icon_Delete_20_N"/></svg>
                Delete
              </button>
            </div>
            <p class="nx-snapshot-sub-heading">Review</p>
            <div class="nx-snapshot-action-group">
              <button><svg class="icon"><use href="#S2_Icon_OpenIn_20_N"/></svg>Open</button>
              <button ?disabled=${!this._manifest?.locked}><svg class="icon"><use href="#S2_Icon_PublishNo_20_N"/></svg>Reject</button>
              <button @click=${this.handlePublish} ?disabled=${!this._manifest?.locked}><svg class="icon"><use href="#S2_Icon_Publish_20_N"/></svg>Publish</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  render() {
    return html`
      <div class="nx-snapshot-wrapper ${this.basics.open ? 'is-open' : ''} ${this._isSaving ? 'is-saving' : ''}">
        <div class="nx-snapshot-header">
          ${this.basics.name ? html`<p>${this.basics.name}</p>` : html`<input type="text" name="name" placeholder="Enter snapshot name" />`}
          <button @click=${this.handleExpand} class="nx-snapshot-expand">Expand</button>
        </div>
        ${this.renderDetails()}
      </div>
      <nx-dialog @action=${this.handleDialog} .details=${this._error}></nx-dialog>
    `;
  }
}

customElements.define('nx-snapshot', NxSnapshot);
