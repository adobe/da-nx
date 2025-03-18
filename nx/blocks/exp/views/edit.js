import { html, LitElement, nothing } from 'da-lit';
import { getConfig } from '../../../scripts/nexter.js';
import getStyle from '../../../utils/styles.js';
import getSvg from '../../../utils/svg.js';
import {
  getAbb,
  toColor,
  getErrors,
  calcLinks,
  saveDetails,
  calculatePercents,
  observeDetailChanges,
} from '../utils.js';

const { nxBase } = getConfig();

const sl = await getStyle(`${nxBase}/public/sl/styles.css`);
const style = await getStyle(import.meta.url);

const ICONS = [
  `${nxBase}/public/icons/S2_Icon_Add_20_N.svg`,
  `${nxBase}/public/icons/S2_Icon_Lock_20_N.svg`,
  `${nxBase}/public/icons/S2_Icon_LockOpen_20_N.svg`,
];

class NxExpEdit extends LitElement {
  static properties = {
    page: { attribute: false },
    details: { attribute: false },
    _observedDetails: { state: true },
    _hasChanges: { state: true },
    _status: { state: true },
  };

  async connectedCallback() {
    super.connectedCallback();
    this.setupObservable();
    this.shadowRoot.adoptedStyleSheets = [sl, style];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
  }

  setupObservable() {
    this._observedDetails = JSON.parse(JSON.stringify(this.details));
    const notifyPropertyChanged = this.notifyPropertyChanged.bind(this);
    this._observedDetails = observeDetailChanges(this._observedDetails, notifyPropertyChanged);
  }

  notifyPropertyChanged() {
    this._hasChanges = true;
    this._status = { text: 'You have unsaved changes.' };
  }

  setStatus(text, type) {
    if (!text) {
      this._status = null;
    } else {
      this._status = { text, type };
    }
    this.requestUpdate();
  }

  handleOpen(e, idx) {
    this._observedDetails.variants.forEach((variant, index) => {
      variant.open = idx === index ? !variant.open : false;
    });
    this.requestUpdate();
  }

  handleNameInput(e) {
    this._observedDetails.name = e.target.value.replaceAll(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    this.requestUpdate();
  }

  handleSelectChange(e, prop) {
    this._observedDetails[prop] = e.target.value;
  }

  handlePercentInput(e, idx) {
    const { value } = e.target;
    this._observedDetails.variants = calculatePercents(value, this._observedDetails.variants, idx);
    e.target.value = this._observedDetails.variants[idx].percent;
    this.requestUpdate();
  }

  handleUrlInput(e, idx) {
    this._observedDetails.variants[idx].url = e.target.value;
    this.requestUpdate();
  }

  handleDateChange(e, name) {
    this._observedDetails[name] = e.target.value;
  }

  async handleNewVariant() {
    const newVar = { name: `variant-${this._observedDetails.variants.length + 1}` };
    if (this.hasPercents()) newVar.percent = 0;

    // Reset the variants to trigger a property change
    this._observedDetails.variants = [...this._observedDetails.variants, newVar];

    this.requestUpdate();
  }

  handleBack() {
    const opts = { detail: { action: 'cancel' }, bubbles: true, composed: true };
    this.dispatchEvent(new CustomEvent('action', opts));
  }

  async handleSave(type) {
    this._errors = getErrors(this._observedDetails);
    if (this._errors) {
      this._status = { text: 'Please fix errors.', type: 'error' };
      return;
    }

    // Set the experiment status based on the button clicked
    this._observedDetails.status = type;

    // Bind to this so it can be called outside the class
    const setStatus = this.setStatus.bind(this);
    const result = await saveDetails(this.page, this._observedDetails, setStatus);
    if (result.status !== 'ok') return;
    const opts = { detail: { action: 'saved' }, bubbles: true, composed: true };
    this.dispatchEvent(new CustomEvent('action', opts));
  }

  handleDelete(idx) {
    if (idx === 0) return;
    this._observedDetails.variants.splice(idx, 1);
    this.requestUpdate();
  }

  handlePreview(param) {
    const opts = { detail: { action: 'preview', param }, bubbles: true, composed: true };
    this.dispatchEvent(new CustomEvent('action', opts));
  }

  hasPercents() {
    return this._observedDetails.variants.some((variant) => variant.percent);
  }

  handleLink(e, href) {
    e.preventDefault();
    window.open(href, '_blank');
  }

  handleLock() {
    const total = this._observedDetails.variants.length;
    this._observedDetails.variants = this._observedDetails.variants.map((variant) => {
      if (variant.percent !== undefined) {
        delete variant.percent;
      } else {
        variant.percent = Math.round(100 / total);
      }
      return variant;
    });
    this.requestUpdate();
  }

  get _placeholder() {
    return `${this.page.origin}/experiments/
      ${this._observedDetails.name ? `${this._observedDetails.name}/` : ''}...`;
  }

  renderVariant(variant, idx) {
    const error = this._errors?.variants?.[idx].error;
    const isControl = idx === 0;
    let { percent } = variant;
    if (!this.hasPercents()) percent = Math.round(100 / this._observedDetails.variants.length);
    const isActive = this._observedDetails?.experimentStatus === 'active';

    const {
      editUrl,
      openUrl,
      previewParam,
    } = calcLinks(this._observedDetails.name, variant, idx);

    return html`
      <li class="${variant.open ? 'is-open' : ''} ${error ? 'has-error' : ''} nx-expandable">
        <div class="nx-variant-name">
          <span style="background: var(${toColor(variant.name)})">${getAbb(variant.name)}</span>
          <p>${variant.name}</p>
          <div class="nx-range-wrapper">
            <input
              class="nx-exp-percent"
              type="range"
              id="percent-${idx}"
              name="percent"
              min="0"
              max="100"
              step="1"
              ?disabled=${variant.percent === undefined || idx === 0}
              .value="${percent}"
              @input=${(e) => { this.handlePercentInput(e, idx); }} />
            <p class="${percent < 50 ? 'on-right' : ''}">${percent}%</p>
          </div>
          <button @click=${(e) => this.handleOpen(e, idx)} class="nx-exp-btn-more">Details</button>
        </div>
        <div class="nx-variant-details">
          <hr/>
          <sl-input
            class="nx-space-bottom-200"
            label="URL"
            type="text"
            name="url"
            @input=${(e) => this.handleUrlInput(e, idx)}
            .value=${variant.url || ''}
            error=${error}
            ?disabled=${isControl || isActive}
            placeholder="${this._placeholder}">
          </sl-input>
          <div class="nx-variant-action-area ${isControl ? 'is-control' : ''}">
            <button ?disabled=${!editUrl} @click=${(e) => this.handleLink(e, editUrl)}>
              <img src="${nxBase}/public/icons/S2_Icon_Edit_20_N.svg" loading="lazy" />
              <span>Edit</span>
            </button>
            ${!isControl ? html`
              <button
                ?disabled=${!openUrl}
                @click=${(e) => this.handleLink(e, openUrl)}>
                <img src="${nxBase}/public/icons/S2_Icon_OpenIn_20_N.svg" loading="lazy" />
                <span>Open</span>
            </button>` : nothing}
            <button
              title=${this._hasChanges ? 'Save changes to simulate.' : nothing}
              ?disabled=${!previewParam || this._hasChanges}
              @click=${() => this.handlePreview(previewParam)}>
              <img src="${nxBase}/public/icons/S2_Icon_Community_20_N.svg" loading="lazy" />
              <span>Simulate</span>
            </button>
            ${!isControl ? html`<button @click=${() => this.handleDelete(idx)}>
              <img src="${nxBase}/public/icons/S2_Icon_Delete_20_N.svg" loading="lazy" />
              <span>Delete</span>
            </button>` : nothing}
          </div>
        </div>
      </li>
    `;
  }

  renderVariants() {
    const lock = this.hasPercents() ? { icon: 'LockOpen', text: 'Custom' } : { icon: 'Lock', text: 'Even' };
    return html`
      <div class="nx-variants-area">
        <p class="nx-variants-heading">Variants</p>
        <ul class="nx-variants-list">
          ${this._observedDetails.variants?.map((variant, idx) => this.renderVariant(variant, idx))}
        </ul>
        <div class="nx-new-variant-area">
          <button class="nx-new-variant" @click=${this.handleNewVariant}>
              <div class="nx-icon-wrapper">
                <svg class="icon"><use href="#S2_Icon_Add_20_N"/></svg>
              </div>
              <span>New variant</span>
          </button>
          <button class="nx-variant-percent-toggle" @click=${this.handleLock}>
            <svg class="icon"><use href="#S2_Icon_${lock.icon}_20_N"/></svg>
            <span class="nx-toggle-text">${lock.text}</span>
          </button>
        </div>
      </div>
    `;
  }

  renderDates() {
    return html`
      <div class="nx-date-area">
        <div class="nx-grid-two-up nx-space-bottom-100">
          <sl-input
            label="Start date"
            type="date"
            id="start" name="start"
            @change=${(e) => { this.handleDateChange(e, 'startDate'); }}
            .value=${this._observedDetails.startDate}>
          </sl-input>
          <sl-input
            label="End date"
            type="date"
            id="end"
            name="end"
            @change=${(e) => { this.handleDateChange(e, 'endDate'); }}
            .value=${this._observedDetails.endDate}
            min="2025-03-01">
          </sl-input>
        </div>
      </div>
    `;
  }

  renderActions() {
    return html`
      <nx-exp-actions .status=${this._status}>
        <sl-button class="primary outline" @click=${() => this.handleSave('draft')}>Save draft</sl-button>
        <sl-button @click=${() => this.handleSave('active')}>Publish</sl-button>
      </nx-exp-actions>`;
  }

  render() {
    return html`
      <div class="nx-exp-main">
        <div class="nx-exp-details-header">
          <button aria-label="Back" @click=${this.handleBack}>
            <img class="nx-exp-back" src="${nxBase}/img/icons/S2_Icon_Undo_20_N.svg" />
          </button>
          <p class="sl-heading-m">Edit experiment</p>
        </div>
        <div class="nx-details-area">
          <sl-input
            @input=${this.handleNameInput}
            .value=${this._observedDetails.name}
            class="nx-space-bottom-100"
            type="text"
            label="Name"
            name="exp-name"
            error=${this._errors?.name || nothing}
            ?disabled="${this._observedDetails.experimentStatus === 'active' ? 'true' : undefined}"
            placeholder="Enter experiment name"
            class="nx-space-bottom-100"></sl-input>
          <div class="nx-grid-two-up nx-space-bottom-300">
            <sl-select
              label="Type"
              name="exp-type"
              .value=${this._observedDetails.type}
              ?disabled="${this._observedDetails.experimentStatus === 'active' ? 'true' : undefined}"
              @change=${(e) => this.handleSelectChange(e, 'type')}>
                <option value="ab">A/B test</option>
                <option value="mab">Multi-arm bandit</option>
            </sl-select>
            <sl-select
              label="Goal"
              name="exp-opt-for"
              .value=${this._observedDetails.goal}
              ?disabled="${this._observedDetails.experimentStatus === 'active' ? 'true' : undefined}"
              @change=${(e) => this.handleSelectChange(e, 'goal')}>
                <option value="conversion">Overall conversion</option>
                <option value="form-submit">Form submission</option>
                <option value="engagement">Engagement</option>
            </sl-select>
          </div>
        </div>
        ${this.renderVariants()}
        ${this.renderDates()}
        ${this.renderActions()}
      </div>
    `;
  }
}

customElements.define('nx-exp-edit', NxExpEdit);
