import { LitElement, html } from 'da-lit';

const { default: getStyle } = await import('../../../../../utils/styles.js');
const style = await getStyle(import.meta.url);

/** Dialog with move/confirm/cancel buttons for reordering array items. */
class ReorderDialog extends LitElement {
  static properties = {
    targetIndex: { type: Number },
    totalItems: { type: Number },
  };

  constructor() {
    super();
    this.targetIndex = 0;
    this.totalItems = 0;
    this._boundHandleKeydown = this._handleKeydown.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    document.addEventListener('keydown', this._boundHandleKeydown);
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this._boundHandleKeydown);
    super.disconnectedCallback();
  }

  _handleKeydown(e) {
    const n = this.totalItems;
    const { targetIndex } = this;

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

    if (e.key === 'ArrowUp' && targetIndex > 0) {
      this._dispatch(e.shiftKey ? 'reorder-move-to-first' : 'reorder-move-up');
      e.preventDefault();
      return;
    }

    if (e.key === 'ArrowDown' && targetIndex < n - 1) {
      this._dispatch(e.shiftKey ? 'reorder-move-to-last' : 'reorder-move-down');
      e.preventDefault();
    }
  }

  _dispatch(name, detail = {}) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  render() {
    const n = this.totalItems;
    const canMoveUp = this.targetIndex > 0;
    const canMoveDown = this.targetIndex < n - 1;
    const canMoveToFirst = this.targetIndex > 0;
    const canMoveToLast = this.targetIndex < n - 1;

    return html`
      <div class="reorder-dialog" role="dialog" aria-label="Reorder item">
        <div class="reorder-dialog-buttons">
          <button
            type="button"
            class="reorder-btn"
            ?disabled=${!canMoveToFirst}
            title="Move to top (Shift+↑)"
            aria-label="Move to top (Shift+↑)"
            @click=${() => this._dispatch('reorder-move-to-first')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="12 19 7 14 12 9"/>
              <polyline points="19 19 14 14 19 9"/>
            </svg>
          </button>
          <button
            type="button"
            class="reorder-btn"
            ?disabled=${!canMoveUp}
            title="Move up one (↑)"
            aria-label="Move up one (↑)"
            @click=${() => this._dispatch('reorder-move-up')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="18 15 12 9 6 15"/>
            </svg>
          </button>
          <button
            type="button"
            class="reorder-btn"
            ?disabled=${!canMoveDown}
            title="Move down one (↓)"
            aria-label="Move down one (↓)"
            @click=${() => this._dispatch('reorder-move-down')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          <button
            type="button"
            class="reorder-btn"
            ?disabled=${!canMoveToLast}
            title="Move to bottom (Shift+↓)"
            aria-label="Move to bottom (Shift+↓)"
            @click=${() => this._dispatch('reorder-move-to-last')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="12 5 17 10 12 15"/>
              <polyline points="5 5 10 10 5 15"/>
            </svg>
          </button>
          <span class="reorder-dialog-separator" aria-hidden="true"></span>
          <button
            type="button"
            class="reorder-btn reorder-confirm"
            title="Apply new order (Enter)"
            aria-label="Apply new order (Enter)"
            @click=${() => this._dispatch('reorder-confirm')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </button>
          <button
            type="button"
            class="reorder-btn reorder-cancel"
            title="Cancel reorder (Esc)"
            aria-label="Cancel reorder (Esc)"
            @click=${() => this._dispatch('reorder-cancel')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }
}

customElements.define('reorder-dialog', ReorderDialog);
