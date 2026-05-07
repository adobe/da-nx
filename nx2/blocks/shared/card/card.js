import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';

const styles = await loadStyle(import.meta.url);

class NxCard extends LitElement {
  static properties = {
    heading: { type: String },
    subheading: { type: String },
    pill: { type: String },
    selected: { type: Boolean, reflect: true },
    interactive: { type: Boolean, reflect: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  render() {
    return html`
      <div class="card" part="card">
        ${this.pill !== undefined
          ? html`<div class="card-pill" part="pill">${this.pill}</div>`
          : nothing}
        <slot name="pill"></slot>
        <div class="card-body">
          ${this.heading
            ? html`<span class="card-heading" part="heading">${this.heading}</span>`
            : nothing}
          ${this.subheading
            ? html`<span class="card-subheading" part="subheading">${this.subheading}</span>`
            : nothing}
          <slot></slot>
        </div>
        <div class="card-actions">
          <slot name="actions"></slot>
        </div>
      </div>
    `;
  }
}

customElements.define('nx-card', NxCard);
