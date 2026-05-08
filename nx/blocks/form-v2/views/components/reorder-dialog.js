import { LitElement, html } from 'da-lit';

const EL_NAME = 'da-sc-reorder-dialog';

class StructuredContentReorderDialog extends LitElement {
  static properties = {
    targetIndex: { attribute: false },
    totalItems: { attribute: false },
  };

  _dispatch(name) {
    this.dispatchEvent(new CustomEvent(name, {
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    return html`
      <div>
        <button type="button" @click=${() => this._dispatch('reorder-move-to-first')}>First</button>
        <button type="button" @click=${() => this._dispatch('reorder-move-up')}>Up</button>
        <button type="button" @click=${() => this._dispatch('reorder-move-down')}>Down</button>
        <button type="button" @click=${() => this._dispatch('reorder-move-to-last')}>Last</button>
        <button type="button" @click=${() => this._dispatch('reorder-confirm')}>Apply</button>
        <button type="button" @click=${() => this._dispatch('reorder-cancel')}>Cancel</button>
      </div>
    `;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, StructuredContentReorderDialog);
}
