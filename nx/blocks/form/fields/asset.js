import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../../nx2/utils/utils.js';
import './button.js';
import defaults from './defaults.js';

const style = await loadStyle(import.meta.url);
const IMAGE_ICON = html`
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
    <rect x="2" y="3" width="16" height="14" rx="2"></rect>
    <circle cx="7" cy="8" r="1.5"></circle>
    <path d="m3 15 5-5 3 3 2-2 4 4"></path>
  </svg>
`;
const UPLOAD_ICON = html`
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
    <path d="M10 14V3m-4 4 4-4 4 4M3 13v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3"></path>
  </svg>
`;
const LIBRARY_ICON = html`
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
    <rect x="2" y="3" width="7" height="7" rx="1"></rect>
    <rect x="11" y="3" width="7" height="7" rx="1"></rect>
    <rect x="2" y="12" width="7" height="6" rx="1"></rect>
    <rect x="11" y="12" width="7" height="6" rx="1"></rect>
  </svg>
`;

function isImageHref(href) {
  if (typeof href !== 'string' || !href.trim()) {
    return false;
  }

  if (href.startsWith('./media_')) {
    return !/[\s<>"']/.test(href);
  }

  try {
    return ['http:', 'https:'].includes(new URL(href).protocol);
  } catch {
    return false;
  }
}

class FormAsset extends LitElement {
  static properties = {
    value: { type: String },
    label: { type: String },
    displayName: { type: String },
    previewHref: { type: String },
    description: { type: String },
    error: { type: String },
    required: { type: Boolean },
    disabled: { type: Boolean, reflect: true },
    aemAssetsAvailable: { type: Boolean, attribute: false },
    aemAssetsError: { attribute: false },
    onSelectSource: { attribute: false },
    _pending: { state: true },
    _selectionError: { state: true },
    _previewBroken: { state: true },
  };

  // Invalidates a pending result when the field is removed or disconnected.
  _requestGeneration = 0;

  _dialogTrigger;

  get _dialog() {
    return this.shadowRoot.querySelector('.asset-source-dialog');
  }

  get _removeDialog() {
    return this.shadowRoot.querySelector('.asset-remove-dialog');
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [defaults, style];
  }

  disconnectedCallback() {
    this._requestGeneration += 1;
    [this._dialog, this._removeDialog].forEach((dialog) => {
      if (dialog?.open) dialog.close();
    });
    super.disconnectedCallback();
  }

  updated(changed) {
    if (changed.has('value') || changed.has('previewHref')) {
      this._previewBroken = false;
    }
  }

  _emit(value) {
    this.dispatchEvent(new CustomEvent('asset-change', {
      detail: { value },
      bubbles: true,
      composed: true,
    }));
  }

  _openDialog(event) {
    if (this.disabled || this._pending) {
      return;
    }

    if (!(event.currentTarget instanceof HTMLElement)) {
      return;
    }

    this._dialogTrigger = event.currentTarget;
    this._selectionError = undefined;
    this._dialog.showModal();
    this.shadowRoot.getElementById('asset-dialog-title').focus();
  }

  _closeDialog() {
    if (this._dialog.open) {
      this._dialog.close();
    }
  }

  _onDialogClick(event) {
    if (event.target === event.currentTarget) {
      event.currentTarget.close();
    }
  }

  _onPreviewError() {
    this._previewBroken = true;
  }

  _restoreFocus() {
    const trigger = this._dialogTrigger;
    queueMicrotask(() => {
      if (!this.isConnected) {
        return;
      }

      const target = trigger?.getClientRects().length
        ? trigger
        : this.shadowRoot.querySelector(this.value ? '.asset-replace' : '.asset-select');
      target?.shadowRoot?.querySelector('button')?.focus();
    });
  }

  async _choose(source) {
    if (this.disabled || this._pending) {
      return;
    }

    this._closeDialog();
    const selectSource = this.onSelectSource;
    if (typeof selectSource !== 'function') {
      this._selectionError = 'Asset selection is unavailable.';
      return;
    }

    this._requestGeneration += 1;
    const request = this._requestGeneration;
    this._pending = true;
    this._selectionError = undefined;

    try {
      const result = await selectSource({ source, value: this.value });
      if (!this.isConnected || request !== this._requestGeneration) {
        return;
      }

      if (result?.cancelled) {
        return;
      }

      if (!isImageHref(result?.href)) {
        this._selectionError = 'The selected image did not return a usable URL.';
        return;
      }

      this.value = result.href;
      this.displayName = result.name;
      this.previewHref = result.previewHref;
      this._emit(result.href);
      await this.updateComplete;
      this.shadowRoot.querySelector('.asset-replace')?.shadowRoot?.querySelector('button')?.focus();
    } catch (error) {
      if (this.isConnected && request === this._requestGeneration) {
        this._selectionError = error?.message || 'The image could not be selected.';
      }
    } finally {
      if (this.isConnected && request === this._requestGeneration) {
        this._pending = false;
      }
    }
  }

  _openRemoveDialog() {
    if (this.disabled || this._pending || !this.value) {
      return;
    }

    this._removeDialog.showModal();
    this.shadowRoot.querySelector('.asset-remove-cancel')?.shadowRoot?.querySelector('button')?.focus();
  }

  _closeRemoveDialog() {
    if (this._removeDialog.open) {
      this._removeDialog.close();
    }
  }

  _restoreRemoveFocus() {
    queueMicrotask(() => {
      if (!this.isConnected) {
        return;
      }
      const target = this.shadowRoot.querySelector(this.value ? '.asset-remove' : '.asset-select');
      target?.shadowRoot?.querySelector('button')?.focus();
    });
  }

  async _remove() {
    if (this.disabled || this._pending || !this.value) {
      this._closeRemoveDialog();
      return;
    }

    // Clearing a form reference never deletes the image in its media store.
    this._requestGeneration += 1;
    this._selectionError = undefined;
    this.value = undefined;
    this.displayName = undefined;
    this.previewHref = undefined;
    this._emit(undefined);
    await this.updateComplete;
    this._closeRemoveDialog();
  }

  get _name() {
    if (this.displayName) {
      return this.displayName;
    }

    if (!this.value) {
      return '';
    }

    try {
      return decodeURIComponent(new URL(this.value, document.baseURI).pathname.split('/').pop()) || 'Selected image';
    } catch {
      return 'Selected image';
    }
  }

  get _imageSrc() {
    const href = this.previewHref || (/^https?:\/\//.test(this.value ?? '') ? this.value : '');
    if (!href || this._previewBroken) {
      return '';
    }

    try {
      const url = new URL(href, document.baseURI);
      return ['http:', 'https:', 'blob:'].includes(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  }

  render() {
    const imageSrc = this._imageSrc;
    return html`
      <div class="form-field${this.error ? ' has-error' : ''}">
        ${this.label ? html`
          <label id="asset-label">${this.label}${this.required ? html`<span class="form-required">*</span>` : nothing}</label>
        ` : nothing}
        <div class="asset" role="group" aria-labelledby=${this.label ? 'asset-label' : nothing}>
          <div class="asset-empty" ?hidden=${!!this.value}>
            <span class="asset-empty-icon" aria-hidden="true">${IMAGE_ICON}</span>
            <p>No image selected</p>
            <form-button class="asset-select" ?disabled=${this.disabled || this._pending} @click=${this._openDialog}>Select</form-button>
          </div>
          <div class="asset-selected" ?hidden=${!this.value}>
            <div class="asset-preview">
              ${imageSrc ? html`
                <img src=${imageSrc} alt="" @error=${this._onPreviewError}>
              ` : html`<span class="asset-preview-placeholder" aria-hidden="true">${IMAGE_ICON}</span>`}
              <div class="asset-actions">
                <form-button class="asset-replace" variant="secondary" ?disabled=${this.disabled || this._pending} @click=${this._openDialog}>Replace</form-button>
                <form-button class="asset-remove" variant="secondary" ?disabled=${this.disabled || this._pending} @click=${this._openRemoveDialog}>Remove</form-button>
              </div>
            </div>
            <div class="asset-info">
              <span class="asset-file-icon" aria-hidden="true">${IMAGE_ICON}</span>
              <span class="asset-name">${this._name}</span>
            </div>
          </div>
        </div>
        ${this._pending ? html`<p role="status" class="asset-progress">Selecting image...</p>` : nothing}
        ${this._selectionError ? html`<p role="alert" class="form-field-error">${this._selectionError}</p>` : nothing}
        ${this.error ? html`<p class="form-field-error">${this.error}</p>` : nothing}
        ${!this.error && this.description ? html`<p class="form-field-description">${this.description}</p>` : nothing}
      </div>
      <dialog
        class="asset-source-dialog${this.aemAssetsAvailable ? '' : ' asset-dialog-single'}"
        aria-labelledby="asset-dialog-title"
        @close=${this._restoreFocus}
        @click=${this._onDialogClick}
      >
        <div class="asset-dialog-header">
          <div>
            <h2 id="asset-dialog-title" tabindex="-1">${this.value ? 'Replace image' : 'Select image'}</h2>
            <p>Choose where to get the image for this field.</p>
          </div>
          <button type="button" class="asset-dialog-close" aria-label="Close" @click=${this._closeDialog}>&times;</button>
        </div>
        <div class="asset-sources">
          <button type="button" class="asset-source" @click=${() => this._choose('upload')}>
            <span class="asset-source-icon" aria-hidden="true">${UPLOAD_ICON}</span>
            <span class="source-title">Upload</span>
            <span class="source-description">Choose an image from your device.</span>
          </button>
          ${this.aemAssetsAvailable ? html`
            <button type="button" class="asset-source" @click=${() => this._choose('aem-assets')}>
              <span class="asset-source-icon" aria-hidden="true">${LIBRARY_ICON}</span>
              <span class="source-title">AEM Assets</span>
              <span class="source-description">Select an image from the connected asset repository.</span>
            </button>
          ` : nothing}
        </div>
        ${this.aemAssetsError ? html`
          <p class="asset-config-error" role="alert">${this.aemAssetsError} Upload remains available.</p>
        ` : nothing}
        <div class="asset-dialog-footer">
          <form-button variant="secondary" @click=${this._closeDialog}>Cancel</form-button>
        </div>
      </dialog>
      <dialog
        class="asset-remove-dialog"
        role="alertdialog"
        aria-labelledby="asset-remove-title"
        aria-describedby="asset-remove-description"
        @close=${this._restoreRemoveFocus}
        @click=${this._onDialogClick}
      >
        <div class="asset-dialog-header">
          <div>
            <h2 id="asset-remove-title">Remove asset?</h2>
            <p id="asset-remove-description">This removes the asset from the editor without deleting the original file..</p>
          </div>
        </div>
        <div class="asset-dialog-footer">
          <form-button class="asset-remove-cancel" variant="secondary" @click=${this._closeRemoveDialog}>Cancel</form-button>
          <form-button class="asset-remove-confirm" variant="negative" @click=${this._remove}>Remove</form-button>
        </div>
      </dialog>
    `;
  }
}

if (!customElements.get('form-asset')) customElements.define('form-asset', FormAsset);

export default FormAsset;
