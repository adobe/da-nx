// eslint-disable-next-line import/no-unresolved
import { html, LitElement, render, nothing } from 'da-lit';
import { getConfig } from '../../../scripts/nexter.js';
import getStyle from '../../../utils/styles.js';
import getSvg from '../../../utils/svg.js';

import { strings, getAbb, formatDate } from '../utils.js';

const { nxBase } = getConfig();

const sl = await getStyle(`${nxBase}/public/sl/styles.css`);
const style = await getStyle(import.meta.url);

const ICONS = [
  `${nxBase}/public/icons/S2_Icon_Delete_20_N.svg`,
  `${nxBase}/public/icons/S2_Icon_Edit_20_N.svg`,
  `${nxBase}/public/icons/S2_Icon_Pause_20_N.svg`,
];

class NxExpView extends LitElement {
  static properties = {
    details: { attribute: false },
    _showDialog: { state: true },
  };

  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, style];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
  }

  async handleClick(action) {
    const dialog = document.createElement('sl-dialog');
    await render(this._dialogContent, dialog);
    document.body.append(dialog);
    dialog.showModal();
  }

  handleEdit() {
    const opts = { detail: { action: 'edit' }, bubbles: true, composed: true };
    const event = new CustomEvent('action', opts);
    this.dispatchEvent(event);
  }

  handleSubmit(e) {
    e.preventDefault();
    console.log(this._dialog.closest());
  }

  renderEdit() {
    return html`
      <button class="nx-action-button" @click=${this.handleEdit}>
        <img src="${nxBase}/public/icons/S2_Icon_Edit_20_N.svg" width="20" height="20" />
        <span>Edit</span>
      </button>
    `;
  }

  renderPause() {
    return html`
      <button class="nx-action-button" @click=${() => this.handleClick('pause')}>
        <img src="${nxBase}/public/icons/S2_Icon_Pause_20_N.svg" width="20" height="20" />
        <span>Pause</span>
      </button>
    `;
  }

  get _dialog() {
    return document.body.querySelector('#nx-exp-dialog');
  }

  get _dialogContent() {
    return html`
      <p class="sl-heading-m">Note</p>
      <p class="sl-body-m">All content will be published</p>
      <button>${this._action}</button>`;
  }

  render() {
    const isActive = this.details?.status === 'active';

    return html`
      <div class="nx-exp-view-name-area">
        <div class="nx-exp-view-name-card">
          <div class="nx-exp-abb nx-exp-abb-${this.details.status}">${getAbb(this.details.name)}</div>
          <div>
            <p class="nx-exp-name">${this.details.name}</p>
            <p class="nx-exp-status nx-exp-status-${this.details.status}">
              ${this.details.status}
            </p>
          </div>
        </div>
        <div class="nx-exp-name-actions">
          <button class="nx-action-button" @click=${() => this.handleClick('delete')}>
            <img src="${nxBase}/public/icons/S2_Icon_Delete_20_N.svg" width="20" height="20" />
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
      ${this._showDialog ? this.renderDialog() : nothing}
    `;
  }
}

customElements.define('nx-exp-view', NxExpView);
