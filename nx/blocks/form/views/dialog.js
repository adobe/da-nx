import { LitElement, html } from 'da-lit';

const { default: getStyle } = await import('../../../utils/styles.js');
const style = await getStyle(import.meta.url);

class FormDialog extends LitElement {
  static properties = {
    title: { type: String },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  disconnectedCallback() {
    this.close();
    super.disconnectedCallback();
  }

  firstUpdated() {
    if (!this._dialog.open) this._dialog.showModal();
  }

  close() {
    if (this._dialog?.open) this._dialog.close();
  }

  _onCancel(e) {
    // Keep this dialog non-dismissible for current usage.
    e.preventDefault();
  }

  get _dialog() {
    return this.shadowRoot.querySelector('dialog');
  }

  render() {
    return html`
      <dialog
        class="da-form-dialog"
        @cancel=${this._onCancel}
      >
        <div class="da-form-dialog-inner">
          <p class="da-form-dialog-title">${this.title}</p>
          <hr />
          <div class="da-form-dialog-content">
            <slot></slot>
          </div>
        </div>
      </dialog>
    `;
  }
}

customElements.define('da-form-dialog', FormDialog);
