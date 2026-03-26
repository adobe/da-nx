// eslint-disable-next-line import/no-unresolved
import getStyle from 'https://da.live/nx/utils/styles.js';
// eslint-disable-next-line import/no-unresolved
import { LitElement, html, createRef, ref } from 'da-lit';
import { readSearchControlValueFromInputEvent } from '../sl-browse-search/sl-browse-search.js';

const style = await getStyle(import.meta.url);

/**
 * Rename confirmation dialog (Spectrum `sp-dialog-wrapper` + text field).
 *
 * Draft text is kept locally so typing does not re-render the parent (which was
 * breaking modal footer actions). Confirm includes the draft in `detail.value`.
 *
 * @fires sl-browse-rename-dialog-close
 * @fires sl-browse-rename-dialog-cancel
 * @fires sl-browse-rename-dialog-confirm - detail `{ value: string }`
 * @customElement sl-browse-rename-dialog
 */
export class SlBrowseRenameDialog extends LitElement {
  static properties = {
    open: { type: Boolean },
    loading: { type: Boolean },
    error: { type: String },
    /** Initial name when `open` becomes true (from host). */
    value: { type: String },
    _draft: { state: true },
  };

  constructor() {
    super();
    this.open = false;
    this.loading = false;
    this.error = '';
    this.value = '';
    this._draft = '';
    this._textfieldRef = createRef();
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  /**
   * @param {Map<PropertyKey, unknown>} changedProperties
   */
  willUpdate(changedProperties) {
    super.willUpdate(changedProperties);
    if (changedProperties.has('open') && this.open) {
      this._draft = this.value ?? '';
    }
  }

  /**
   * @param {Map<PropertyKey, unknown>} changedProperties
   */
  updated(changedProperties) {
    super.updated(changedProperties);
    if (changedProperties.has('open') && this.open) {
      queueMicrotask(() => this._focusTextfield());
    }
  }

  async _focusTextfield() {
    const textfield = this._textfieldRef.value;
    if (!textfield) return;
    await textfield.updateComplete;
    textfield.focus();
    if (typeof textfield.select === 'function') {
      textfield.select();
    }
  }

  _onClose() {
    this.dispatchEvent(new CustomEvent('sl-browse-rename-dialog-close', { bubbles: true, composed: true }));
  }

  _onCancel() {
    if (this.loading) return;
    this.dispatchEvent(new CustomEvent('sl-browse-rename-dialog-cancel', { bubbles: true, composed: true }));
  }

  _onConfirm() {
    if (this.loading) return;
    this.dispatchEvent(
      new CustomEvent('sl-browse-rename-dialog-confirm', {
        bubbles: true,
        composed: true,
        detail: { value: this._draft ?? '' },
      }),
    );
  }

  /** @param {Event} event */
  _onInput(event) {
    this._draft = readSearchControlValueFromInputEvent(event);
  }

  /** @param {KeyboardEvent} event */
  _onKeydown(event) {
    if (event.key !== 'Enter' || this.loading) return;
    event.preventDefault();
    this._onConfirm();
  }

  render() {
    return html`
      <sp-dialog-wrapper
        class="sl-browse-rename-dialog"
        size="s"
        headline="Rename"
        cancel-label="Cancel"
        confirm-label="OK"
        underlay
        ?open="${this.open}"
        ?error="${!!this.error}"
        @close="${this._onClose}"
        @cancel="${this._onCancel}"
        @confirm="${this._onConfirm}"
      >
        <div class="sl-browse-rename-dialog-body">
          <sp-textfield
            ${ref(this._textfieldRef)}
            class="sl-browse-rename-textfield"
            label="File name"
            placeholder="Enter a file name"
            autocomplete="off"
            .value="${this._draft}"
            @input="${this._onInput}"
            @keydown="${this._onKeydown}"
            ?disabled="${this.loading}"
          ></sp-textfield>
          ${this.error ? html`<p class="sl-browse-rename-error" role="alert">${this.error}</p>` : ''}
        </div>
      </sp-dialog-wrapper>
    `;
  }
}

customElements.define('sl-browse-rename-dialog', SlBrowseRenameDialog);
