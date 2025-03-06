import { html, LitElement, nothing } from 'da-lit';
import { getConfig } from '../../../scripts/nexter.js';
import getStyle from '../../../utils/styles.js';
import { toColor, getDefaultData, calcLinks, getAbb } from '../utils.js';

const { nxBase } = getConfig();

const sl = await getStyle(`${nxBase}/public/sl/styles.css`);
const style = await getStyle(import.meta.url);

class NxExpEdit extends LitElement {
  static properties = {
    details: { attribute: false },
  };

  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, style];
    // getSvg({ parent: this.shadowRoot, paths: ICONS });
  }

  renderVariant(variant, idx) {
    const error = this._errors?.variants?.[idx].error;
    const isControl = idx === 0;
    const percent = variant.percent || 0;
    const isActive = this._details?.experimentStatus === 'active';

    const {
      editUrl,
      openUrl,
      previewParam,
    } = calcLinks(this._details.name, variant, idx);

    return html`
      <li class="${variant.open ? 'is-open' : ''} ${error ? 'has-error' : ''} nx-expandable">
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
                      step="1"
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
    return html`
      <div class="nx-date-area">
        <div class="nx-grid-two-up nx-space-bottom-100">
          <sl-input
            label="Start date"
            type="date"
            id="start" name="start"
            @change=${(e) => { this.handleDateChange(e, 'startDate'); }}
            .value=${this._details.startDate}>
          </sl-input>
          <sl-input
            label="End date"
            type="date"
            id="end"
            name="end"
            @change=${(e) => { this.handleDateChange(e, 'endDate'); }}
            .value=${this._details.endDate}
            min="2025-03-01">
          </sl-input>
        </div>
      </div>
    `;
  }

  renderActions() {
    return html`
      <div class="nx-action-area">
        <p class="nx-status nx-status-type-${this._uiStatus?.type || 'info'}">${this._uiStatus?.text}</p>
        <div>
          <sl-button @click=${(e) => this.handleSave(e, 'draft')} class="primary outline">Save as draft</sl-button>
          <sl-button @click=${(e) => this.handleSave(e, 'active')}>Publish</sl-button>
        </div>
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

  render() {
    if (this.details.name) this.renderNone();

    return html`
      <div class="nx-exp-main">
        <div class="nx-exp-details-header nx-space-bottom-200">
          <p class="sl-heading-m">Edit experiment</p>
        </div>
        <div class="nx-details-area">
          <sl-input
            @input=${this.handleNameInput}
            .value=${this.details.name}
            class="nx-space-bottom-100"
            type="text"
            label="Name"
            name="exp-name"
            error=${this._errors?.name || nothing}
            ?disabled="${this.details.experimentStatus === 'active' ? 'true' : undefined}"
            placeholder="Enter experiment name"
            class="nx-space-bottom-100"></sl-input>
          <div class="nx-grid-two-up nx-space-bottom-300">
            <sl-select
              label="Type"
              name="exp-type"
              .value=${this.details.type}
              ?disabled="${this.details.experimentStatus === 'active' ? 'true' : undefined}"
              @change=${(e) => this.handleSelectChange(e, 'type')}>
                <option value="ab">A/B test</option>
                <option value="mab">Multi-arm bandit</option>
            </sl-select>
            <sl-select
              label="Goal"
              name="exp-opt-for"
              .value=${this.details.goal}
              ?disabled="${this.details.experimentStatus === 'active' ? 'true' : undefined}"
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
      <sl-dialog class="nx-dialog" ?open=${this._alertMessage} modal="true">
        <h2>${this._alertMessage?.title}</h2>
        <p>${this._alertMessage?.message}</p>
        <div class="nx-dialog-actions">
          <sl-button
              @click=${() => { this._alertMessage?.onCancel?.(); this._alertMessage = null; }}
              class="primary outline">
            Cancel
          </sl-button>
          <sl-button
              @click=${() => { this._alertMessage?.onConfirm?.(); this._alertMessage = null; }}>
            Confirm
          </sl-button>
        </div>
      </sl-dialog>
    `;
  }
}

customElements.define('nx-exp-edit', NxExpEdit);
