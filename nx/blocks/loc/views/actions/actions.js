import { LitElement, html, nothing } from 'da-lit';
import getStyle from '../../../../utils/styles.js';

const style = await getStyle(import.meta.url);

class NxLocActions extends LitElement {
  static properties = {
    prev: { type: String },
    prevDisabled: { type: Boolean },
    next: { type: String },
    message: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  handleAction(name) {
    const opts = { detail: name, bubbles: true, composed: true };
    const event = new CustomEvent('action', opts);
    this.dispatchEvent(event);
  }

  render() {
    return html`
      <div class="nx-loc-actions-header">
        <button @click=${() => this.handleAction('prev')} class="nx-prev" ?disabled=${this.prevDisabled}>
          <span>${this.prev}</span>
        </button>
        ${this.message ? html`<p class="message type-${this.message.type || 'info'}">${this.message.text}</p>` : nothing}
        <button @click=${() => this.handleAction('next')} class="nx-next">
          <span>${this.next}</span>
        </button>
      </div>`;
  }
}

customElements.define('nx-loc-actions', NxLocActions);
