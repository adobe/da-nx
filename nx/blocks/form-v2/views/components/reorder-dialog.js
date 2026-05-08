import { LitElement, html } from 'da-lit';

const EL_NAME = 'da-sc-reorder-dialog';

class StructuredContentReorderDialog extends LitElement {
  static properties = {
    targetIndex: { attribute: false },
    totalItems: { attribute: false },
  };

  constructor() {
    super();
    this.targetIndex = 0;
    this.totalItems = 0;
    this._boundHandleKeydown = this._handleKeydown.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this._boundHandleKeydown);
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this._boundHandleKeydown);
    super.disconnectedCallback();
  }

  _dispatch(name) {
    this.dispatchEvent(new CustomEvent(name, {
      bubbles: true,
      composed: true,
    }));
  }

  _handleKeydown(e) {
    const lastIndex = Math.max((this.totalItems ?? 0) - 1, 0);

    if (e.key === 'Escape') {
      this._dispatch('reorder-cancel');
      e.preventDefault();
      return;
    }

    if (e.key === 'Enter') {
      this._dispatch('reorder-confirm');
      e.preventDefault();
      return;
    }

    if (e.key === 'ArrowUp' && this.targetIndex > 0) {
      this._dispatch(e.shiftKey ? 'reorder-move-to-first' : 'reorder-move-up');
      e.preventDefault();
      return;
    }

    if (e.key === 'ArrowDown' && this.targetIndex < lastIndex) {
      this._dispatch(e.shiftKey ? 'reorder-move-to-last' : 'reorder-move-down');
      e.preventDefault();
    }
  }

  render() {
    const totalItems = this.totalItems ?? 0;
    const lastIndex = Math.max(totalItems - 1, 0);
    const canMoveUp = this.targetIndex > 0;
    const canMoveDown = this.targetIndex < lastIndex;
    const position = totalItems > 0
      ? `${Math.min(this.targetIndex + 1, totalItems)} of ${totalItems}`
      : '0 of 0';

    return html`
      <div>
        <p>Reorder position: ${position}</p>
        <button type="button" ?disabled=${!canMoveUp} @click=${() => this._dispatch('reorder-move-to-first')}>First</button>
        <button type="button" ?disabled=${!canMoveUp} @click=${() => this._dispatch('reorder-move-up')}>Up</button>
        <button type="button" ?disabled=${!canMoveDown} @click=${() => this._dispatch('reorder-move-down')}>Down</button>
        <button type="button" ?disabled=${!canMoveDown} @click=${() => this._dispatch('reorder-move-to-last')}>Last</button>
        <button type="button" @click=${() => this._dispatch('reorder-confirm')}>Apply</button>
        <button type="button" @click=${() => this._dispatch('reorder-cancel')}>Cancel</button>
      </div>
    `;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, StructuredContentReorderDialog);
}
