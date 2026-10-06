import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../../nx2/utils/utils.js';
import '../../../../nx2/blocks/shared/menu/menu.js';
import '../../../../nx2/blocks/shared/dialog/dialog.js';
import { icon } from '../icons.js';
import {
  CANCELLED, acceptsOnlyImages, describeAsset, isAssetHref, previewHrefFor,
} from '../utils/assets.js';
import defaults from './defaults.js';

const [style, formStyle] = await Promise.all([
  loadStyle(import.meta.url),
  loadStyle(new URL('../../../../nx2/styles/form.css', import.meta.url).href),
]);

const LABELS = {
  select: 'Select',
  replace: 'Replace',
  remove: 'Remove',
  cancel: 'Cancel',
  adding: (kind) => `Adding ${kind}`,
  empty: (kind) => `No ${kind} selected`,
  removeTitle: (kind) => `Remove ${kind}?`,
  removeBody: (kind) => `This removes the ${kind} from the field without deleting the original file.`,
};

const MESSAGES = {
  failed: 'The file could not be added.',
  noSource: 'No source is available for this field.',
  typeNotAllowed: 'This file type is not allowed here.',
  unusableResult: 'The selected file did not return a usable URL.',
};

const MENU_PLACEMENT = 'below-end';
const SELECTORS = {
  fileInput: '.file-input',
  removeButton: '.asset-remove',
  sourceTrigger: '.asset-source-trigger',
};
class FormAsset extends LitElement {
  static properties = {
    value: { type: String },
    label: { type: String },
    description: { type: String },
    error: { type: String },
    required: { type: Boolean },
    disabled: { type: Boolean, reflect: true },

    contentMediaType: { type: String },
    sources: { attribute: false },
    previewOrigin: { type: String },

    _selection: { state: true },
    _pending: { state: true },
    _selectionError: { state: true },

    _previewBroken: { state: true },
    _loadedPreviewSrc: { state: true },

    _confirmingRemove: { state: true },
  };

  // Results of an older request are ignored once a newer one starts or the value changes.
  _activeRequestId = 0;

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [defaults, formStyle, style];
  }

  disconnectedCallback() {
    this._forgetSelection();
    this._confirmingRemove = false;
    super.disconnectedCallback();
  }

  willUpdate(changed) {
    if (changed.has('value') && this.value !== this._selection?.href) this._forgetSelection();
    if (changed.has('value') || changed.has('previewOrigin')) this._previewBroken = false;
    this._asset = describeAsset({
      href: this.value,
      name: this._selection?.name,
      type: this._selection?.type,
      contentMediaType: this.contentMediaType,
    });
  }

  get _imageOnly() {
    return acceptsOnlyImages({ contentMediaType: this.contentMediaType });
  }

  get _kindLabel() {
    return this._imageOnly ? 'image' : 'file';
  }

  get _typeMismatch() {
    return !!this.value && !this._asset.isAllowed;
  }

  get _availableSources() {
    const { contentMediaType } = this;
    return (this.sources ?? []).filter((source) => source.accepts({ contentMediaType }));
  }

  get _previewSrc() {
    if (this._previewBroken || !this._asset.isImage) return undefined;
    return previewHrefFor({ href: this.value, previewOrigin: this.previewOrigin });
  }

  get _canChange() {
    return !this.disabled && !this._pending;
  }

  get _canRemove() {
    return this._canChange && !!this.value;
  }

  _forgetSelection() {
    this._activeRequestId += 1;
    this._selection = undefined;
    this._selectionError = undefined;
    this._pending = false;
  }

  // Native `change` events are not composed, so the host emits its own.
  _emitChange() {
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  async _focus(selector) {
    await this.updateComplete;
    if (this.isConnected) this.shadowRoot.querySelector(selector)?.focus();
  }

  _pickFile(types) {
    const input = this.shadowRoot.querySelector(SELECTORS.fileInput);
    input.accept = types.join(',');
    input.value = '';
    return new Promise((resolve) => {
      const listening = new AbortController();
      const finish = () => {
        listening.abort();
        resolve(input.files?.[0]);
      };
      input.addEventListener('change', finish, { signal: listening.signal });
      input.addEventListener('cancel', finish, { signal: listening.signal });
      input.click();
    });
  }

  async _runSource(source) {
    const { contentMediaType } = this;
    try {
      if (!source.localFileTypes) return await source.select({ contentMediaType });
      const file = await this._pickFile(source.localFileTypes({ contentMediaType }));
      return file ? await source.select({ contentMediaType, file }) : CANCELLED;
    } catch (error) {
      return { error: error?.message || MESSAGES.failed };
    }
  }

  _applyResult(result) {
    if (result.cancelled) return;
    if (result.error || !isAssetHref(result.href)) {
      this._selectionError = result.error || MESSAGES.unusableResult;
      return;
    }
    this._selection = { href: result.href, name: result.name, type: result.type };
    this.value = result.href;
    this._emitChange();
  }

  async _selectFrom(source) {
    if (!this._canChange || !source) {
      return;
    }

    this._activeRequestId += 1;
    const requestId = this._activeRequestId;
    this._pending = true;
    this._selectionError = undefined;

    const result = await this._runSource(source);

    // A newer selection or a cleared field superseded this request.
    if (requestId !== this._activeRequestId) {
      return;
    }

    this._pending = false;
    this._applyResult(result);
    this._focus(SELECTORS.sourceTrigger);
  }

  _onMenuSelect({ detail }) {
    this._selectFrom(this._availableSources.find(({ id }) => id === detail.id));
  }

  _openRemoveDialog() {
    if (this._canRemove) this._confirmingRemove = true;
  }

  _closeRemoveDialog() {
    this.shadowRoot.querySelector('nx-dialog')?.close();
  }

  _onRemoveDialogClose() {
    this._confirmingRemove = false;
    this._focus(this.value ? SELECTORS.removeButton : SELECTORS.sourceTrigger);
  }

  // Clearing the field never deletes the file at its source.
  _confirmRemove() {
    if (this._canRemove) {
      this._forgetSelection();
      this.value = undefined;
      this._emitChange();
    }
    this._closeRemoveDialog();
  }

  _onPreviewError() {
    this._previewBroken = true;
  }

  _onPreviewLoad(event) {
    this._loadedPreviewSrc = event.currentTarget.getAttribute('src');
  }

  _renderSourceTrigger() {
    const text = this.value ? LABELS.replace : LABELS.select;
    const className = `asset-source-trigger ${this.value ? 'nx-form-btn-secondary' : 'nx-form-btn-primary'}`;
    const sources = this._availableSources;
    if (sources.length > 1) {
      const items = sources.map(({ id, label }) => ({ id, label }));
      return html`
        <nx-menu placement=${MENU_PLACEMENT} .items=${items} @select=${this._onMenuSelect}>
          <button slot="trigger" type="button" class=${className} ?disabled=${this.disabled}>
            ${text}${icon('chevronDown', 'asset-menu-chevron')}
          </button>
        </nx-menu>
      `;
    }
    const [source] = sources;
    return html`<button type="button" class=${className} ?disabled=${this.disabled || !source}
      @click=${() => this._selectFrom(source)}>${text}</button>`;
  }

  _renderActions() {
    if (this._pending) {
      return html`<span class="nx-loading-spinner" role="status" aria-label=${LABELS.adding(this._kindLabel)}></span>`;
    }
    return html`
      ${this._renderSourceTrigger()}
      ${this.value ? html`<button type="button" class="asset-remove nx-form-btn-secondary"
        ?disabled=${this.disabled} @click=${this._openRemoveDialog}>${LABELS.remove}</button>` : nothing}
    `;
  }

  _renderPreview() {
    const previewSrc = this._previewSrc;
    return html`
      <div class="asset-preview">
        ${previewSrc ? html`<img class=${previewSrc === this._loadedPreviewSrc ? 'is-loaded' : ''}
          src=${previewSrc} alt="" @load=${this._onPreviewLoad} @error=${this._onPreviewError}>` : nothing}
      </div>
    `;
  }

  _renderRow() {
    const { name } = this._asset;
    return html`
      <div class="asset-row">
        ${this.value
          ? html`<span class="asset-name" title=${name}>${name}</span>`
          : html`<span class="asset-placeholder">${LABELS.empty(this._kindLabel)}</span>`}
        <div class="asset-actions">${this._renderActions()}</div>
      </div>
    `;
  }

  _renderRemoveDialog() {
    if (!this._confirmingRemove) return nothing;
    return html`
      <nx-dialog title=${LABELS.removeTitle(this._kindLabel)} @close=${this._onRemoveDialogClose}>
        <p>${LABELS.removeBody(this._kindLabel)}</p>
        <button slot="actions" type="button" class="nx-form-btn-secondary" autofocus
          @click=${this._closeRemoveDialog}>${LABELS.cancel}</button>
        <button slot="actions" type="button" class="asset-remove-confirm nx-form-btn-primary"
          @click=${this._confirmRemove}>${LABELS.remove}</button>
      </nx-dialog>
    `;
  }

  _renderMessage() {
    if (this._selectionError) {
      return html`<p role="alert" class="form-field-error">${this._selectionError}</p>`;
    }
    if (this.error) return html`<p class="form-field-error">${this.error}</p>`;
    if (this._typeMismatch) return html`<p class="form-field-error">${MESSAGES.typeNotAllowed}</p>`;
    if (this.sources && !this._availableSources.length && !this.disabled) {
      return html`<p class="form-field-description">${MESSAGES.noSource}</p>`;
    }
    if (this.description) return html`<p class="form-field-description">${this.description}</p>`;
    return nothing;
  }

  render() {
    const invalid = this.error || this._selectionError || this._typeMismatch;
    return html`
      <div class="form-field${invalid ? ' has-error' : ''}">
        ${this.label ? html`
          <label id="asset-label">${this.label}${this.required ? html`<span class="form-required">*</span>` : nothing}</label>
        ` : nothing}
        <div class="asset${this._imageOnly ? ' has-preview' : ''}" role="group"
          aria-labelledby=${this.label ? 'asset-label' : nothing} aria-busy=${this._pending ? 'true' : 'false'}>
          ${this._imageOnly ? this._renderPreview() : nothing}
          ${this._renderRow()}
        </div>
        ${this._renderMessage()}
      </div>
      <input class="file-input" type="file" hidden>
      ${this._renderRemoveDialog()}
    `;
  }
}

if (!customElements.get('form-asset')) customElements.define('form-asset', FormAsset);

export default FormAsset;
