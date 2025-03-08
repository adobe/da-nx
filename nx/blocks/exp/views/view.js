// eslint-disable-next-line import/no-unresolved
import { html, LitElement } from 'da-lit';
import getStyle from '../../../utils/styles.js';
import getSvg from '../../../utils/svg.js';
import { strings, getAbb, formatDate } from '../utils.js';

import('./dialog.js');

const nx = `${new URL(import.meta.url).origin}/nx`;
const sl = await getStyle(`${nx}/public/sl/styles.css`);
const style = await getStyle(import.meta.url);

const ICONS = [
  `${nx}/public/icons/S2_Icon_Delete_20_N.svg`,
  `${nx}/public/icons/S2_Icon_Edit_20_N.svg`,
  `${nx}/public/icons/S2_Icon_Pause_20_N.svg`,
];

const DIALOG_CONTENT = {
  delete: { button: 'Delete experiment', message: 'Deleting the experiment requires the page to be re-published.' },
  pause: { button: 'Pause experiment', message: 'Pausing the experiment requires the page to be re-published.' },
  publish: { button: 'Publish experiment', message: 'Publishing the experiment requires the page to be re-published.' },
};

class NxExpView extends LitElement {
  static properties = {
    details: { attribute: false },
    _dialog: { state: true },
  };

  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, style];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
  }

  async handleClick(action) {
    this._dialog = { open: true, action, ...DIALOG_CONTENT[action] };
  }

  handleEdit() {
    const opts = { detail: { action: 'edit' }, bubbles: true, composed: true };
    const event = new CustomEvent('action', opts);
    this.dispatchEvent(event);
  }

  handleAction({ detail }) {
    if (detail.action === 'cancel') return;
    if (detail.action === 'delete') this.handleDelete();
    if (detail.action === 'pause') this.handlePause();
    if (detail.action === 'publish') this.handlePublish();
  }

  renderEdit() {
    return html`
      <button class="nx-action-button" @click=${this.handleEdit}>
        <img src="${nx}/public/icons/S2_Icon_Edit_20_N.svg" width="20" height="20" />
        <span>Edit</span>
      </button>
    `;
  }

  renderPause() {
    return html`
      <button class="nx-action-button" @click=${() => this.handleClick('pause')}>
        <img src="${nx}/public/icons/S2_Icon_Pause_20_N.svg" width="20" height="20" />
        <span>Pause</span>
      </button>
    `;
  }

  render() {
    const isActive = this.details?.status === 'active';

    return html`
      <div class="nx-exp-view-name-area">
        <div class="nx-exp-view-name-card">
          <div class="nx-exp-abb nx-exp-abb-${this.details.status}">
            ${getAbb(this.details.name)}
          </div>
          <div>
            <p class="nx-exp-name">${this.details.name}</p>
            <p class="nx-exp-status nx-exp-status-${this.details.status}">
              ${this.details.status}
            </p>
          </div>
        </div>
        <div class="nx-exp-name-actions">
          <button class="nx-action-button" @click=${() => this.handleClick('delete')}>
            <img src="${nx}/public/icons/S2_Icon_Delete_20_N.svg" width="20" height="20" />
            <span>Delete</span>
          </button>
          ${isActive ? this.renderPause() : this.renderEdit()}
        </div>
      </div>
      <div class="nx-exp-view-details-area">
        <div class="nx-exp-detail-row">
          <div class="nx-exp-detail-col">
            <p class="nx-exp-detail-label">Type</p>
            <p class="nx-exp-detail-content">${strings[this.details.type]}</p>
          </div>
          <div class="nx-exp-detail-col">
            <p class="nx-exp-detail-label">Goal</p>
            <p class="nx-exp-detail-content">${strings[this.details.goal]}</p>
          </div>
        </div>
        <div class="nx-exp-detail-row">
          <div class="nx-exp-detail-col">
            <p class="nx-exp-detail-label">Start date</p>
            <p class="nx-exp-detail-content">${formatDate(this.details.startDate)}</p>
          </div>
          <div class="nx-exp-detail-col">
            <p class="nx-exp-detail-label">End date</p>
            <p class="nx-exp-detail-content">${formatDate(this.details.startDate)}</p>
          </div>
        </div>
      </div>
      <div class="nx-action-area">
        <p class="nx-status"></p>
        <div class="nx-actions">
          <sl-button ?disabled=${isActive} @click=${() => this.handleClick('publish')}>
            Publish
          </sl-button>
        </div>
      </div>
      <nx-exp-dialog @action=${this.handleAction} .details=${this._dialog}></nx-exp-dialog>
    `;
  }
}

customElements.define('nx-exp-view', NxExpView);
