// eslint-disable-next-line import/no-unresolved
import { html, LitElement } from 'da-lit';
import getStyle from '../../../utils/styles.js';
import {
  getAbb,
  toColor,
  calcLinks,
  formatDate,
  saveDetails,
  deleteExperiment,
} from '../utils.js';

const nx = `${new URL(import.meta.url).origin}/nx`;
const sl = await getStyle(`${nx}/public/sl/styles.css`);
const style = await getStyle(import.meta.url);

class NxExpView extends LitElement {
  static properties = {
    page: { attribute: false },
    details: { attribute: false },
    strings: { attribute: false },
    _previewingIdx: { state: true },
    _status: { state: true },
    _dialog: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, style];
    this._previewingIdx = this.detectPreview();
  }

  detectPreview() {
    const searchParams = new URLSearchParams(this.page.params);
    const experiment = searchParams.get('experiment');
    if (!experiment) return null;
    const variantVal = experiment.split('/')[1];
    return variantVal === 'control' ? 0 : Number(variantVal.split('-')[1]);
  }

  setStatus(text, type = 'info') {
    this._status = !text ? null : { text, type };
    this.requestUpdate();
  }

  async handlePublish() {
    this._status = { text: 'Publishing experiment.' };
    this.details.status = 'active';
    const setStatus = this.setStatus.bind(this);
    const result = await saveDetails(this.page, this.details, setStatus);
    if (result.status !== 'ok') return;
    const opts = { detail: { action: 'saved' }, bubbles: true, composed: true };
    this.dispatchEvent(new CustomEvent('action', opts));
  }

  async handleDelete() {
    // Only force publish if the test is currently active;
    const shouldPublish = this.details.status === 'active';
    const setStatus = this.setStatus.bind(this);
    const result = await deleteExperiment(this.page, this.details, setStatus, shouldPublish);
    if (result.status !== 'ok') return;
    const opts = { detail: { action: 'saved' }, bubbles: true, composed: true };
    this.dispatchEvent(new CustomEvent('action', opts));
  }

  async handlePause() {
    this.details.status = 'draft';
    const setStatus = this.setStatus.bind(this);
    const result = await saveDetails(this.page, this.details, setStatus, true);
    if (result.status !== 'ok') return;
    const opts = { detail: { action: 'saved' }, bubbles: true, composed: true };
    this.dispatchEvent(new CustomEvent('action', opts));
  }

  async handleClick(action) {
    if (action === 'publish') {
      this.handlePublish();
      return;
    }
    if (action === 'delete') {
      // Set a warning if the status is active and we're trying to delete
      if (this.details.status === 'active') {
        this._dialog = { open: true, action, ...this.strings[action] };
      } else {
        this.handleDelete();
      }
    }
    if (action === 'pause') {
      // We should only have an active status if we are clicking pause
      if (this.details.status === 'active') {
        this._dialog = { open: true, action, ...this.strings[action] };
      }
    }
  }

  handleEdit() {
    const opts = { detail: { action: 'edit' }, bubbles: true, composed: true };
    const event = new CustomEvent('action', opts);
    this.dispatchEvent(event);
  }

  handleDialogAction({ detail }) {
    if (detail.action === 'delete') this.handleDelete();
    if (detail.action === 'pause') this.handlePause();
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

  handlePreview(variant, idx) {
    const { previewParam: param } = calcLinks(this.details.name, variant, idx);
    const opts = { detail: { action: 'preview', param }, bubbles: true, composed: true };
    this.dispatchEvent(new CustomEvent('action', opts));
  }

  render() {
    const isActive = this.details?.status === 'active';
    const goal = this.details.goal || 'conversion';
    const type = this.details.type || 'ab';

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
            <p class="nx-exp-detail-content">${this.strings[type].label}</p>
          </div>
          <div class="nx-exp-detail-col">
            <p class="nx-exp-detail-label">Goal</p>
            <p class="nx-exp-detail-content">${this.strings[goal].label}</p>
          </div>
        </div>
        <div class="nx-exp-detail-row">
          <div class="nx-exp-detail-col">
            <p class="nx-exp-detail-label">Start date</p>
            <p class="nx-exp-detail-content">${this.details.startDate ? formatDate(this.details.startDate) : 'None'}</p>
          </div>
          <div class="nx-exp-detail-col">
            <p class="nx-exp-detail-label">End date</p>
            <p class="nx-exp-detail-content">${this.details.endDate ? formatDate(this.details.startDate) : 'None'}</p>
          </div>
        </div>
      </div>
      <div class="nx-exp-view-variants-area">
        <p class="nx-variants-heading">Variants</p>
        <ul>
          ${this.details.variants?.map((variant, idx) => html`
            <li class="${this._previewingIdx === idx ? 'is-previewed' : ''}">
              <div class="nx-variant-name">
                <span class="nx-variant-abb" style="background: var(${toColor(variant.name)})">${getAbb(variant.name)}</span>
                <div class="nx-variant-details">
                  <p class="name">${variant.name}</p>
                  <p class="percent">
                    ${variant.percent ? variant.percent : 100 / this.details.variants.length}%
                  </p>
                </div>
                <button
                  @click=${() => this.handlePreview(variant, idx)}
                  class="nx-action-button"
                  arial-label="Simulate variant"
                  title="Simulate variant">
                  <img src="${nx}/public/icons/S2_Icon_Community_20_N.svg" width="20" height="20" />
                </button>
              </div>
            </li>`)}
        </ul>
      </div>
      <nx-exp-actions .status=${this._status}>
        <sl-button ?disabled=${isActive} @click=${() => this.handleClick('publish')}>
          Publish
        </sl-button>
      </nx-exp-actions>
      <nx-exp-dialog class="${this._dialog ? 'is-visible' : ''}" @action=${this.handleDialogAction} .details=${this._dialog}></nx-exp-dialog>
    `;
  }
}

customElements.define('nx-exp-view', NxExpView);
