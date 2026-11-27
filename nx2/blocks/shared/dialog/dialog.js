import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';
import { getConfig } from '../../../scripts/nx.js';

const styles = await loadStyle(import.meta.url);
const buttons = await loadStyle(new URL('../../../styles/buttons.css', import.meta.url).href);

class NxDialog extends LitElement {
  static properties = {
    title: { type: String },
    busy: { type: Boolean },
    showCloseButton: { type: Boolean, attribute: 'show-close-button' },
    _hasActions: { state: true },
  };

  get _dialog() { return this.shadowRoot.querySelector('dialog'); }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [buttons, styles];
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
    if (!this._dialog?.open) return;
    this._dialog.close();
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  _onCancel(e) {
    e.preventDefault();
    if (!this.busy) this.close();
  }

  _onBackdropClick(e) {
    if (e.target !== e.currentTarget) return;
    if (!this.busy) this.close();
  }

  _onActionsSlotChange(e) {
    this._hasActions = e.target.assignedElements({ flatten: true }).length > 0;
  }

  render() {
    const titleText = this.title?.trim();
    const hasActions = this._hasActions ?? Boolean(this.querySelector('[slot="actions"]'));
    return html`
      <dialog
        aria-labelledby=${titleText ? 'nx-dialog-title' : nothing}
        aria-label=${titleText ? nothing : 'Dialog'}
        @cancel=${this._onCancel}
        @click=${this._onBackdropClick}
      >
        <div class="panel" part="panel" ?inert=${this.busy}>
          ${titleText || this.showCloseButton ? html`
            <div class="heading">
              ${titleText ? html`<h2 class="title" id="nx-dialog-title">${titleText}</h2>` : nothing}
              ${this.showCloseButton ? html`
                <button type="button" class="close nx-action-btn-icon" aria-label="Close" @click=${this.close}>
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <use href="${getConfig().codeBase ?? ''}/img/icons/s2-icon-close-20-n.svg#icon"></use>
                  </svg>
                </button>
              ` : nothing}
            </div>
          ` : nothing}
          <div class="body"><slot></slot></div>
          <div class="actions" ?hidden=${!hasActions}>
            <slot name="actions" @slotchange=${this._onActionsSlotChange}></slot>
          </div>
        </div>
      </dialog>
    `;
  }
}

if (!customElements.get('nx-dialog')) customElements.define('nx-dialog', NxDialog);
