import { LitElement, html } from 'da-lit';

const { default: getStyle } = await import('../../../../../utils/styles.js');
const style = await getStyle(import.meta.url);

/**
 * A two-stage confirmation remove button.
 * First click: Shows checkmark (confirmation state)
 * Second click: Dispatches 'confirm-remove' event
 * Auto-reverts to trash icon after 3 seconds if not confirmed
 */
class RemoveButton extends LitElement {
  static properties = {
    path: { type: String },
    index: { type: Number },
    confirmState: { state: true },
  };

  constructor() {
    super();
    this.path = '';
    this.index = null;
    this.confirmState = false;
    this.timeoutId = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  disconnectedCallback() {
    this.clearConfirmTimeout();
    super.disconnectedCallback();
  }

  clearConfirmTimeout() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  handleClick(e) {
    e.stopPropagation();

    if (this.confirmState) {
      this.clearConfirmTimeout();
      this.confirmState = false;
      this.dispatchEvent(new CustomEvent('confirm-remove', {
        detail: { path: this.path },
        bubbles: true,
        composed: true,
      }));
      return;
    }

    this.confirmState = true;
    this.timeoutId = setTimeout(() => {
      this.confirmState = false;
      this.timeoutId = null;
    }, 3000);
  }

  render() {
    const indexLabel = this.index != null ? `Remove item ${this.index}` : 'Remove item';
    const ariaLabel = this.confirmState ? 'Confirm removal' : indexLabel;
    const title = this.confirmState
      ? 'Click to confirm removal'
      : 'Remove this item';

    return html`
      <button
        class="remove-btn ${this.confirmState ? 'confirm-state' : ''}"
        @click=${this.handleClick}
        title="${title}"
        aria-label="${ariaLabel}"
      >
        ${this.confirmState
        ? html`<span class="check-icon">✓</span>`
        : html`
              <svg class="trash-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6"/>
                <path d="M14 11v6"/>
                <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
              </svg>
            `}
      </button>
    `;
  }
}

customElements.define('remove-button', RemoveButton);
