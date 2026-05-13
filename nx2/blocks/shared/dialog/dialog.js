import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';

const styles = await loadStyle(import.meta.url);

class NxDialog extends LitElement {
  static properties = {
    title: { type: String },
    busy: { type: Boolean },
  };

  persistent = false;

  get _dialog() { return this.shadowRoot.querySelector('dialog'); }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  firstUpdated() {
    this._dialog.showModal();
    queueMicrotask(() => {
      const target = this.querySelector('[autofocus]');
      if (!target) return;
      target.focus();
      if (target instanceof HTMLInputElement) target.select();
    });
  }

  close() {
    this._dialog?.close();
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  _onCancel(e) {
    e.preventDefault();
    if (!this.persistent && !this.busy) this.close();
  }

  _onBackdropClick(e) {
    if (e.target !== e.currentTarget) return;
    if (!this.persistent && !this.busy) this.close();
  }

  render() {
    const titleText = this.title?.trim();
    return html`
      <dialog
        aria-labelledby=${titleText ? 'nx-dialog-title' : nothing}
        aria-label=${titleText ? nothing : 'Dialog'}
        @cancel=${this._onCancel}
        @click=${this._onBackdropClick}
      >
        <div class="panel" ?inert=${this.busy}>
          ${titleText ? html`
            <div class="heading">
              <h2 class="title" id="nx-dialog-title">${titleText}</h2>
            </div>
          ` : nothing}
          <div class="body"><slot></slot></div>
          <div class="actions"><slot name="actions"></slot></div>
        </div>
      </dialog>
    `;
  }
}

customElements.define('nx-dialog', NxDialog);
