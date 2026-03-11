import { LitElement, html } from 'da-lit';

const { default: getStyle } = await import('../../../../../utils/styles.js');
const style = await getStyle(import.meta.url);

/** Move array item to a new position. */
class MoveItemButton extends LitElement {
  static properties = {
    pointer: { type: String },
    index: { type: Number },
    arrayLength: { type: Number },
    _closed: { state: true },
  };

  constructor() {
    super();
    this.pointer = '';
    this.index = 1;
    this.arrayLength = 1;
    this._closed = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  _pickPosition(e, position) {
    e.stopPropagation();
    const currentIndex = this.index - 1;
    const targetIndex = position - 1;
    if (targetIndex !== currentIndex) {
      this.dispatchEvent(new CustomEvent('move-array-item', {
        detail: { pointer: this.pointer, targetIndex },
        bubbles: true,
        composed: true,
      }));
    }
    this._closed = true;
  }

  render() {
    const positions = Array.from({ length: this.arrayLength }, (_, i) => i + 1);
    const currentPosition = Number(this.index) || 1;
    const title = 'Move to position';

    return html`
      <div
        class="move-item-wrapper ${this._closed ? 'move-dropdown-closed' : ''}"
        @mouseleave=${() => { this._closed = false; }}
      >
        <button
          type="button"
          class="move-btn"
          title="${title}"
          aria-label="${title}"
        >
          <svg class="move-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
            <path d="M27.531 24.469c-0.136-0.136-0.324-0.22-0.531-0.22s-0.395 0.084-0.531 0.22v0l-3.719 3.721v-26.189c0-0.414-0.336-0.75-0.75-0.75s-0.75 0.336-0.75 0.75v0 26.188l-3.72-3.719c-0.136-0.134-0.322-0.218-0.528-0.218-0.415 0-0.751 0.336-0.751 0.751 0 0.207 0.083 0.394 0.218 0.529l4.999 5c0.026 0.026 0.066 0.018 0.095 0.039 0.052 0.040 0.087 0.097 0.149 0.123 0.085 0.035 0.183 0.056 0.287 0.057h0c0.207-0 0.395-0.084 0.531-0.219l5-5c0.135-0.136 0.218-0.324 0.218-0.531s-0.083-0.395-0.218-0.531l0 0zM10.53 1.47c-0.025-0.025-0.063-0.017-0.090-0.037-0.053-0.041-0.089-0.099-0.153-0.126-0.051-0.013-0.109-0.020-0.168-0.020-0.010 0-0.020 0-0.030 0.001l0.001-0c-0.041-0.009-0.087-0.014-0.135-0.014-0.004 0-0.007 0-0.011 0h0.001c-0.185 0.005-0.351 0.079-0.475 0.197l-5 5c-0.131 0.135-0.212 0.319-0.212 0.523 0 0.414 0.336 0.75 0.75 0.75 0.203 0 0.388-0.081 0.523-0.213l3.72-3.72v26.189c0 0.414 0.336 0.75 0.75 0.75s0.75-0.336 0.75-0.75v0-26.189l3.72 3.72c0.135 0.131 0.319 0.212 0.523 0.212 0.414 0 0.75-0.336 0.75-0.75 0-0.203-0.081-0.388-0.213-0.523l0 0z"/>
          </svg>
        </button>
        <div class="move-dropdown">
          ${positions.map((position) => html`
            <button
              type="button"
              class="move-option ${position === currentPosition ? 'move-option-current' : ''}"
              @click=${(e) => this._pickPosition(e, position)}
            >${position}</button>
          `)}
        </div>
      </div>
    `;
  }
}

customElements.define('move-item-button', MoveItemButton);
