import { LitElement, html, nothing } from 'da-lit';

const { default: getStyle } = await import('../../../utils/styles.js');
const style = await getStyle(import.meta.url);

const EL_NAME = 'sc-array-menu';
const PEER_EVENT = 'sc-array-menu-peer';

class ArrayMenu extends LitElement {
  static properties = {
    pointer: { attribute: false },
    index: { attribute: false },
    pointers: { attribute: false },
    readonly: { attribute: false },
    itemCount: { attribute: false },
    minItems: { attribute: false },
    maxItems: { attribute: false },
    active: { attribute: false },
    _open: { state: true },
    _confirmRemove: { state: true },
  };

  constructor() {
    super();
    this.active = false;
    this._open = false;
    this._confirmRemove = false;
    this._confirmTimer = null;
    this._onClickOutside = (e) => {
      if (!this.contains(e.target)) this._close();
    };
    this._onPeer = (e) => {
      if (e?.detail?.menu === this) return;
      this._close();
    };
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    document.addEventListener(PEER_EVENT, this._onPeer);
  }

  disconnectedCallback() {
    document.removeEventListener(PEER_EVENT, this._onPeer);
    document.removeEventListener('click', this._onClickOutside);
    this._clearConfirmTimer();
    super.disconnectedCallback();
  }

  _count() {
    return this.itemCount ?? (this.pointers?.length ?? 0);
  }

  _canInsert() {
    if (this.readonly) return false;
    return this.maxItems === undefined || this._count() < this.maxItems;
  }

  _canReorder() {
    if (this.readonly) return false;
    return this._count() > 1;
  }

  _canRemove() {
    if (this.readonly) return false;
    return this._count() > (this.minItems ?? 0);
  }

  _clearConfirmTimer() {
    if (!this._confirmTimer) return;
    clearTimeout(this._confirmTimer);
    this._confirmTimer = null;
  }

  _resetConfirmRemove() {
    this._clearConfirmTimer();
    this._confirmRemove = false;
  }

  _armConfirmRemove() {
    this._clearConfirmTimer();
    this._confirmRemove = true;
    this._notifyPeers('remove-confirm');
    this._confirmTimer = setTimeout(() => {
      this._confirmRemove = false;
      this._confirmTimer = null;
    }, 3000);
  }

  _close() {
    this._open = false;
    this._resetConfirmRemove();
    document.removeEventListener('click', this._onClickOutside);
  }

  _emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, {
      detail,
      bubbles: true,
      composed: true,
    }));
  }

  _notifyPeers(mode) {
    this.dispatchEvent(new CustomEvent(PEER_EVENT, {
      detail: { menu: this, mode },
      bubbles: true,
      composed: true,
    }));
  }

  _toggle(e) {
    e.stopPropagation();
    this._resetConfirmRemove();
    this._open = !this._open;
    if (this._open) {
      this._notifyPeers('menu-open');
      this._emit('array-menu-open');
      setTimeout(() => {
        document.addEventListener('click', this._onClickOutside);
      }, 0);
      return;
    }
    document.removeEventListener('click', this._onClickOutside);
  }

  _insert(e) {
    e.stopPropagation();
    if (!this._canInsert()) return;
    this._emit('array-insert', { pointer: this.pointer });
    this._close();
  }

  _startReorder(e) {
    e.stopPropagation();
    if (!this._canReorder()) return;
    this._close();
    this._emit('array-reorder-start', { pointer: this.pointer, index: this.index ?? 0 });
  }

  _remove(e) {
    e.stopPropagation();
    if (!this._canRemove()) return;

    if (!this._confirmRemove) {
      this._armConfirmRemove();
      return;
    }

    this._resetConfirmRemove();
    this._emit('array-remove', { pointer: this.pointer });
    this._close();
  }

  render() {
    const canInsert = this._canInsert();
    const canReorder = this._canReorder();
    const canRemove = this._canRemove();
    const removeLabel = this._confirmRemove && canRemove ? 'Confirm removal' : 'Remove';

    return html`
      <div class="array-item-menu ${this._open ? 'open' : ''}">
        <button
          type="button"
          class="menu-trigger ${this.active ? 'active' : ''}"
          title="Item actions"
          aria-label="Item actions"
          aria-expanded=${this._open ? 'true' : 'false'}
          aria-haspopup="true"
          @click=${this._toggle}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="12" cy="6" r="1.5"></circle>
            <circle cx="12" cy="12" r="1.5"></circle>
            <circle cx="12" cy="18" r="1.5"></circle>
          </svg>
        </button>
        ${this._open ? html`
          <div class="menu-dropdown" role="menu">
            <button
              type="button"
              class="menu-item"
              role="menuitem"
              ?disabled=${!canInsert}
              @click=${this._insert}
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
              @click=${this._startReorder}
            >
              <svg viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
                <path d="M27.531 24.469c-0.136-0.136-0.324-0.22-0.531-0.22s-0.395 0.084-0.531 0.22v0l-3.719 3.721v-26.189c0-0.414-0.336-0.75-0.75-0.75s-0.75 0.336-0.75 0.75v0 26.188l-3.72-3.719c-0.136-0.134-0.322-0.218-0.528-0.218-0.415 0-0.751 0.336-0.751 0.751 0 0.207 0.083 0.394 0.218 0.529l4.999 5c0.026 0.026 0.066 0.018 0.095 0.039 0.052 0.040 0.087 0.097 0.149 0.123 0.085 0.035 0.183 0.056 0.287 0.057h0c0.207-0 0.395-0.084 0.531-0.219l5-5c0.135-0.136 0.218-0.324 0.218-0.531s-0.083-0.395-0.218-0.531l0 0zM10.53 1.47c-0.025-0.025-0.063-0.017-0.090-0.037-0.053-0.041-0.089-0.099-0.153-0.126-0.051-0.013-0.109-0.020-0.168-0.020-0.010 0-0.020 0-0.030 0.001l0.001-0c-0.041-0.009-0.087-0.014-0.135-0.014-0.004 0-0.007 0-0.011 0h0.001c-0.185 0.005-0.351 0.079-0.475 0.197l-5 5c-0.131 0.135-0.212 0.319-0.212 0.523 0 0.414 0.336 0.75 0.75 0.75 0.203 0 0.388-0.081 0.523-0.213l3.72-3.72v26.189c0 0.414 0.336 0.75 0.75 0.75s0.75-0.336 0.75-0.75v0-26.189l3.72 3.72c0.135 0.131 0.319 0.212 0.523 0.212 0.414 0 0.75-0.336 0.75-0.75 0-0.203-0.081-0.388-0.213-0.523l0 0z"></path>
              </svg>
              Reorder
            </button>
            <button
              type="button"
              class="menu-item ${this._confirmRemove ? 'confirm' : ''}"
              role="menuitem"
              ?disabled=${!canRemove}
              @click=${this._remove}
            >
              ${this._confirmRemove
          ? html`<span class="check-icon">✓</span>`
          : html`
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
                    <path d="M10 11v6"></path>
                    <path d="M14 11v6"></path>
                    <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path>
                  </svg>
                `}
              ${removeLabel}
            </button>
          </div>
        ` : nothing}
      </div>
    `;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, ArrayMenu);
}
