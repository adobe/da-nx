// eslint-disable-next-line import/no-unresolved
import { LitElement, html, nothing } from 'da-lit';
import { getConfig, loadStyle } from '../../scripts/nexter.js';
import getStyle from '../../utils/styles.js';
import getSvg from '../../utils/svg.js';
import {
  getDefaultData,
  getAbb,
  processDetails,
  toColor,
  getErrors,
  saveDetails,
  calcLinks,
} from './utils.js';

import '../../public/sl/components.js';
import '../profile/profile.js';

const { nxBase } = getConfig();

document.body.style = 'height: 600px; overflow: hidden;';
const sl = await getStyle(`${nxBase}/public/sl/styles.css`);
const exp = await getStyle(import.meta.url);

const ICONS = [`${nxBase}/public/icons/S2_Icon_Add_20_N.svg`];

class NxExp extends LitElement {
  static properties = {
    port: { attribute: false },
    _ims: { state: true },
    _connected: { state: true },
    _page: { state: true },
    _details: { state: true },
    _errors: { state: true },
    _status: { state: true },
  };

  async connectedCallback() {
    super.connectedCallback();
    getSvg({ parent: this.shadowRoot, paths: ICONS });
    this.shadowRoot.adoptedStyleSheets = [sl, exp];
  }

  update(props) {
    if (props.has('port') && this.port) {
      // Post a message saying this side is ready.
      this.port.postMessage({ ready: true });
      // Wait for more messages from the other side.
      this.port.onmessage = (e) => { this.handleMessage(e); };
    }
    super.update();
  }

  async handleMessage({ data }) {
    if (data.experiment) this._details = processDetails(data.experiment);
    if (data.page) this._page = data.page;
    this._connected = true;
  }

  handleProfileLoad() {
    this._ims = true;
  }

  setStatus(text, type) {
    if (!text) {
      this._status = null;
    } else {
      this._status = { text, type };
    }
    this.requestUpdate();
  }

  async handleNewExp() {
    const experiment = getDefaultData(this._page);
    this._details = processDetails(experiment);
    this.requestUpdate();
  }

  async handleNewVariant(e) {
    e.preventDefault();
    this._details.variants.push({});
    this._details = processDetails(this._details);
    this.requestUpdate();
  }

  handleOpen(e, idx) {
    e.preventDefault();
    this._details.variants.forEach((variant, index) => {
      variant.open = idx === index ? !variant.open : false;
    });
    this.requestUpdate();
  }

  handleDelete(idx) {
    if (idx === 0) return;
    this._details.variants.splice(idx, 1);
    this.fixPercentages(null, false);
    this.requestUpdate();
  }

  handleBack(e) {
    e.preventDefault();
    this._details = null;
  }

  handleNameInput(e) {
    this._details.name = e.target.value.replaceAll(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    this.requestUpdate();
  }

  handleSelectChange(e, prop) {
    this._details[prop] = e.target.value;
  }

  fixPercentages(editedIndex, isIncrease) {
    // make sure the percentages add up to 100%
    const usedInput = this._details.variants[editedIndex];
    const otherInputs = this._details.variants.filter((v, i) => i !== editedIndex);
    const percentToDistribute = 100 - (usedInput?.percent ?? 0);
    const otherInputsPercent = otherInputs.reduce((acc, input) => acc + input.percent, 0);

    otherInputs.forEach((variant) => {
      const variantShare = (Math.max(variant.percent, 1) / Math.max(otherInputsPercent, 1))
        * percentToDistribute;
      variant.percent = Math.round(variantShare / 5) * 5;
    });

    const totalPercent = this._details.variants.reduce((acc, input) => acc + input.percent, 0);

    const findMin = (acc, input) => (input.percent < acc.percent ? input : acc);
    const findMax = (acc, input) => (input.percent > acc.percent ? input : acc);
    const variantToEdit = isIncrease ? otherInputs.reduce(findMin) : otherInputs.reduce(findMax);
    variantToEdit.percent += 100 - totalPercent;
  }

  handlePercentInput(e, idx) {
    const increase = e.target.value > this._details.variants[idx].percent;
    this._details.variants[idx].percent = parseInt(e.target.value, 10);
    this.fixPercentages(idx, increase);

    this.requestUpdate();
  }

  handleUrlInput(e, idx) {
    this._details.variants[idx].url = e.target.value;
    this.requestUpdate();
  }

  handleDateChange(e, name) {
    this._details[name] = e.target.value;
  }

  async handleSave(e, status, forcePublish = false) {
    e.preventDefault();
    this._errors = getErrors(this._details);
    if (this._errors) {
      this.setStatus('Please fix errors.', 'error');
      return;
    }

    // Set the experiment status based on the button clicked
    this._details.status = status;

    // Bind to this so it can be called outside the class
    const setStatus = this.setStatus.bind(this);
    const result = await saveDetails(this._page, this._details, setStatus, forcePublish);
    if (result.status !== 'ok') return;
    this.port.postMessage({ reload: true });
  }

  handleLink(e, href) {
    e.preventDefault();
    window.open(href, '_blank');
  }

  handlePreview(e, param) {
    e.preventDefault();
    this.port.postMessage({ preview: param });
  }

  get _placeholder() {
    return `${this._page.origin}/experiments/
      ${this._details.name ? `${this._details.name}/` : ''}...`;
  }

  renderHeader() {
    return html`
      <div class="nx-exp-header">
        <h1>Experimentation</h1>
        <nx-profile @loaded=${this.handleProfileLoad}></nx-profile>
      </div>
    `;
  }

  renderNone() {
    return html`
      <div class="nx-new-wrapper">
        <div class="nx-new">
          <img
            alt=""
            src="${nxBase}/img/icons/S2IconUsersNo20N-icon.svg"
            class="nx-new-icon nx-space-bottom-200" />
          <p class="sl-heading-m nx-space-bottom-100">No experiments on this page.</p>
          <p class="sl-body-xs nx-space-bottom-300">
            Create a new experiment to start optimizing your web page.
          </p>
          <div class="nx-new-action-area">
            <sl-button @click=${this.handleNewExp}>Create new</sl-button>
          </div>
        </div>
      </div>
    `;
  }

  renderVariant(variant, idx) {
    const error = this._errors?.variants?.[idx].error;
    const isControl = idx === 0;
    const percent = variant.percent || 0;
    const isActive = this._details.experimentStatus === 'active';

    const {
      editUrl,
      openUrl,
      previewParam,
    } = calcLinks(this._details.name, variant, idx);

    return html`
      <li class="${variant.open ? 'is-open' : ''} ${error ? 'has-error' : ''}">
        <div class="nx-variant-name">
          <span style="background: var(${toColor(variant.name)})">${getAbb(variant.name)}</span>
          <p>${variant.name}</p>
          ${isActive ? html`<div class="nx-range-wrapper"><p class="on-right">${percent}%</p></div>` : html`
                <div class="nx-range-wrapper">
                  <sl-input
                      type="range"
                      id="percent-${idx}"
                      name="percent"
                      min="0"
                      max="100"
                      step="5"
                      ?disabled="${isActive ? 'true' : undefined}"
                      .value=${percent}
                      @input=${(e) => { this.handlePercentInput(e, idx); }}>
                  </sl-input>
                  <p class="${percent < 50 ? 'on-right' : ''}">${percent}%</p>
                </div>
              `}
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
            <button ?disabled=${!previewParam} @click=${(e) => this.handlePreview(e, previewParam)}>
              <img src="${nxBase}/public/icons/S2_Icon_Community_20_N.svg" loading="lazy" />
              <span>Simulate</span>
            </button>
            ${!isControl ? html`<button ?disabled="${isActive}" @click=${() => this.handleDelete(idx)}>
              <img src="${nxBase}/public/icons/S2_Icon_Delete_20_N.svg" loading="lazy" />
              <span>Delete</span>
            </button>` : nothing}
          </div>
        </div>
      </li>
    `;
  }

  renderVariants() {
    return html`
      <div class="nx-variants-area">
        <p class="nx-variants-heading">Variants</p>
        <ul class="nx-variants-list">
          ${this._details.variants?.map((variant, idx) => this.renderVariant(variant, idx))}
        </ul>
        ${this._details.experimentStatus === 'active' ? nothing : html`
          <button class="nx-new-variant" @click=${this.handleNewVariant}>
            <div class="nx-icon-wrapper">
              <svg class="icon"><use href="#S2_Icon_Add_20_N"/></svg>
            </div>
            <span>New variant</span>
          </button>
        `}
      </p>
    `;
  }

  renderDates() {
    const isActive = this._details.experimentStatus === 'active';

    if (isActive && !this._details.startDate && !this._details.endDate) {
      return nothing;
    }

    return html`
      <div class="nx-date-area">
        <div class="nx-grid-two-up nx-space-bottom-100">
          <sl-input
            label="Start date"
            type="date"
            id="start" name="start"
            ?disabled="${isActive}"
            @change=${(e) => { this.handleDateChange(e, 'startDate'); }}
            .value=${this._details.startDate}>
          </sl-input>
          <sl-input
            label="End date"
            type="date"
            id="end"
            name="end"
            ?disabled="${isActive}"
            @change=${(e) => { this.handleDateChange(e, 'endDate'); }}
            .value=${this._details.endDate}
            min="2025-03-01">
          </sl-input>
        </div>
      </div>
    `;
  }

  renderActions() {
    const isActive = this._details.experimentStatus === 'active';

    if (isActive) {
      return html`
      <div class="nx-action-area">
        ${this._status
    ? html`<p class="nx-status nx-status-type-${this._status?.type || 'info'}">${this._status?.text}</p>`
    : html`<p class="nx-status nx-status-type-info">This experiment is active.</p>`}
        <sl-button @click=${(e) => this.handleSave(e, 'draft', true)} class="primary outline">Pause</sl-button>
      </div>
    `;
    }

    return html`
      <div class="nx-action-area">
        <p class="nx-status nx-status-type-${this._status?.type || 'info'}">${this._status?.text}</p>
        <div>
          <sl-button @click=${(e) => this.handleSave(e, 'draft')} class="primary outline">Save as draft</sl-button>
          <sl-button @click=${(e) => this.handleSave(e, 'active')}>Publish</sl-button>
        </div>
      </div>
    `;
  }

  renderDetails() {
    return html`
      <form>
        <div class="nx-exp-details-header nx-space-bottom-200">
          <button aria-label="Back" @click=${this.handleBack}>
            <img class="nx-exp-back" src="${nxBase}/img/icons/S2_Icon_Undo_20_N.svg" />
          </button>
          <p class="sl-heading-m">Edit experiment</p>
        </div>
        <div class="nx-details-area">
          <sl-input
            @input=${this.handleNameInput}
            .value=${this._details.name}
            class="nx-space-bottom-100"
            type="text"
            label="Name"
            name="exp-name"
            error=${this._errors?.name || nothing}
            ?disabled="${this._details.experimentStatus === 'active' ? 'true' : undefined}"
            placeholder="Enter experiment name"
            class="nx-space-bottom-100"></sl-input>
          <div class="nx-grid-two-up nx-space-bottom-300">
            <sl-select
              label="Type"
              name="exp-type"
              .value=${this._details.type}
              ?disabled="${this._details.experimentStatus === 'active' ? 'true' : undefined}"
              @change=${(e) => this.handleSelectChange(e, 'type')}>
                <option value="ab">A/B test</option>
                <option value="mab">Multi-arm bandit</option>
            </sl-select>
            <sl-select
              label="Goal"
              name="exp-opt-for"
              .value=${this._details.goal}
              ?disabled="${this._details.experimentStatus === 'active' ? 'true' : undefined}"
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
      </form>
    `;
  }

  renderReady() {
    return this._details ? this.renderDetails() : this.renderNone();
  }

  render() {
    return html`
      ${this.renderHeader()}
      ${this._ims && this._connected ? this.renderReady() : nothing}
    `;
  }
}

customElements.define('nx-exp', NxExp);

export default async function init() {
  await loadStyle(`${nxBase}/public/sl/styles.css`);
  const expCmp = document.createElement('nx-exp');
  document.body.append(expCmp);

  window.addEventListener('message', (e) => {
    if (e.data && e.data.ready) [expCmp.port] = e.ports;
  });
}
