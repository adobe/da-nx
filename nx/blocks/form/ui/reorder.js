import { LitElement, html } from 'da-lit';

const { default: getStyle } = await import('../../../utils/styles.js');
const style = await getStyle(import.meta.url);

const EL_NAME = 'sc-reorder';

class Reorder extends LitElement {
  static properties = {
    targetIndex: { attribute: false },
    totalItems: { attribute: false },
  };

  constructor() {
    super();
    this.targetIndex = 0;
    this.totalItems = 0;
    this._onKeydown = this._handleKeydown.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    document.addEventListener('keydown', this._onKeydown);
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this._onKeydown);
    super.disconnectedCallback();
  }

  _dispatch(name) {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true }));
  }

  _isTypingTarget(target) {
    if (!(target instanceof Element)) return false;
    const tag = target.tagName?.toLowerCase?.();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    return target.closest?.('[contenteditable="true"]') != null;
  }

  _handleKeydown(e) {
    if (e.defaultPrevented) return;
    if (this._isTypingTarget(e.target)) return;

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

    return html`
      <div class="reorder-dialog" role="dialog" aria-label="Reorder item">
        <div class="reorder-dialog-buttons">
          <button
            type="button"
            class="reorder-btn"
            ?disabled=${!canMoveUp}
            title="Move to top (Shift+Up)"
            aria-label="Move to top (Shift+Up)"
            @click=${() => this._dispatch('reorder-move-to-first')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="12 19 7 14 12 9"></polyline>
              <polyline points="19 19 14 14 19 9"></polyline>
            </svg>
          </button>
          <button
            type="button"
            class="reorder-btn"
            ?disabled=${!canMoveUp}
            title="Move up one (Up)"
            aria-label="Move up one (Up)"
            @click=${() => this._dispatch('reorder-move-up')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="18 15 12 9 6 15"></polyline>
            </svg>
          </button>
          <button
            type="button"
            class="reorder-btn"
            ?disabled=${!canMoveDown}
            title="Move down one (Down)"
            aria-label="Move down one (Down)"
            @click=${() => this._dispatch('reorder-move-down')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
          <button
            type="button"
            class="reorder-btn"
            ?disabled=${!canMoveDown}
            title="Move to bottom (Shift+Down)"
            aria-label="Move to bottom (Shift+Down)"
            @click=${() => this._dispatch('reorder-move-to-last')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="12 5 17 10 12 15"></polyline>
              <polyline points="5 5 10 10 5 15"></polyline>
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
              <polyline points="20 6 9 17 4 12"></polyline>
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
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
    `;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, Reorder);
}
