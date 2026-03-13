import { LitElement, html, nothing } from 'da-lit';

const { default: getStyle } = await import('../../../../../utils/styles.js');
const style = await getStyle(import.meta.url);

/** Menu with Insert, Reorder and Delete options for array items. */
class ArrayItemMenu extends LitElement {
  static properties = {
    pointer: { type: String },
    index: { type: Number },
    arrayLength: { type: Number },
    active: { type: Boolean },
    _open: { state: true },
    _deleteConfirm: { state: true },
  };

  constructor() {
    super();
    this.pointer = '';
    this.index = 1;
    this.arrayLength = 1;
    this.active = false;
    this._open = false;
    this._deleteConfirm = false;
    this._closeTimeout = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._clearCloseTimeout();
    document.removeEventListener('click', this._boundHandleClickOutside);
  }

  _boundHandleClickOutside = (e) => {
    if (!this.contains(e.target)) {
      this._close();
    }
  };

  _clearCloseTimeout() {
    if (this._closeTimeout) {
      clearTimeout(this._closeTimeout);
      this._closeTimeout = null;
    }
  }

  _toggle(e) {
    e.stopPropagation();
    this._open = !this._open;
    this._deleteConfirm = false;
    if (this._open) {
      setTimeout(() => {
        document.addEventListener('click', this._boundHandleClickOutside);
      }, 0);
    } else {
      document.removeEventListener('click', this._boundHandleClickOutside);
    }
  }

  _close() {
    this._open = false;
    this._deleteConfirm = false;
    this._clearCloseTimeout();
    document.removeEventListener('click', this._boundHandleClickOutside);
  }

  _handleInsert(e) {
    e.stopPropagation();
    if (!this.pointer) return;
    this.dispatchEvent(new CustomEvent('insert-item', {
      detail: { pointer: this.pointer },
      bubbles: true,
      composed: true,
    }));
    this._close();
  }

  _handleReorder(e) {
    e.stopPropagation();
    if (this.arrayLength < 2) return;
    const currentIndex = this.index - 1;
    this.dispatchEvent(new CustomEvent('move-activate', {
      detail: { pointer: this.pointer, currentIndex },
      bubbles: true,
      composed: true,
    }));
    this._close();
  }

  _handleDelete(e) {
    e.stopPropagation();
    if (this._deleteConfirm) {
      this.dispatchEvent(new CustomEvent('remove-item', {
        detail: { pointer: this.pointer },
        bubbles: true,
        composed: true,
      }));
      this._close();
      return;
    }
    this._deleteConfirm = true;
    this._clearCloseTimeout();
    this._closeTimeout = setTimeout(() => {
      this._deleteConfirm = false;
      this._closeTimeout = null;
    }, 3000);
  }

  render() {
    const canReorder = this.arrayLength > 1;
    const canInsert = !!this.pointer;

    return html`
      <div class="array-item-menu ${this._open ? 'open' : ''}">
        <button
          type="button"
          class="menu-trigger ${this.active ? 'active' : ''}"
          title="Item actions"
          aria-label="Item actions"
          aria-expanded="${this._open}"
          aria-haspopup="true"
          @click=${this._toggle}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="12" cy="6" r="1.5"/>
            <circle cx="12" cy="12" r="1.5"/>
            <circle cx="12" cy="18" r="1.5"/>
          </svg>
        </button>
        ${this._open ? html`
          <div class="menu-dropdown" role="menu">
            <button
              type="button"
              class="menu-item"
              role="menuitem"
              ?disabled=${!canInsert}
              @click=${this._handleInsert}
            >
              <svg class="insert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Insert before
            </button>
            <button
              type="button"
              class="menu-item"
              role="menuitem"
              ?disabled=${!canReorder}
              @click=${this._handleReorder}
            >
              <svg viewBox="0 0 32 32" fill="currentColor">
                <path d="M27.531 24.469c-0.136-0.136-0.324-0.22-0.531-0.22s-0.395 0.084-0.531 0.22v0l-3.719 3.721v-26.189c0-0.414-0.336-0.75-0.75-0.75s-0.75 0.336-0.75 0.75v0 26.188l-3.72-3.719c-0.136-0.134-0.322-0.218-0.528-0.218-0.415 0-0.751 0.336-0.751 0.751 0 0.207 0.083 0.394 0.218 0.529l4.999 5c0.026 0.026 0.066 0.018 0.095 0.039 0.052 0.040 0.087 0.097 0.149 0.123 0.085 0.035 0.183 0.056 0.287 0.057h0c0.207-0 0.395-0.084 0.531-0.219l5-5c0.135-0.136 0.218-0.324 0.218-0.531s-0.083-0.395-0.218-0.531l0 0zM10.53 1.47c-0.025-0.025-0.063-0.017-0.090-0.037-0.053-0.041-0.089-0.099-0.153-0.126-0.051-0.013-0.109-0.020-0.168-0.020-0.010 0-0.020 0-0.030 0.001l0.001-0c-0.041-0.009-0.087-0.014-0.135-0.014-0.004 0-0.007 0-0.011 0h0.001c-0.185 0.005-0.351 0.079-0.475 0.197l-5 5c-0.131 0.135-0.212 0.319-0.212 0.523 0 0.414 0.336 0.75 0.75 0.75 0.203 0 0.388-0.081 0.523-0.213l3.72-3.72v26.189c0 0.414 0.336 0.75 0.75 0.75s0.75-0.336 0.75-0.75v0-26.189l3.72 3.72c0.135 0.131 0.319 0.212 0.523 0.212 0.414 0 0.75-0.336 0.75-0.75 0-0.203-0.081-0.388-0.213-0.523l0 0z"/>
              </svg>
              Reorder
            </button>
            <button
              type="button"
              class="menu-item ${this._deleteConfirm ? 'confirm' : ''}"
              role="menuitem"
              @click=${this._handleDelete}
            >
              ${this._deleteConfirm
                ? html`<span class="check-icon">✓</span>`
                : html`
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                      <path d="M10 11v6"/>
                      <path d="M14 11v6"/>
                      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
                    </svg>
                  `}
              ${this._deleteConfirm ? 'Confirm removal' : 'Remove'}
            </button>
          </div>
        ` : nothing}
      </div>
    `;
  }
}

customElements.define('array-item-menu', ArrayItemMenu);
