import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';

const styles = await loadStyle(import.meta.url);

class NxCard extends LitElement {
  static properties = {
    heading: { type: String },
    subheading: { type: String },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  render() {
    return html`
      <div class="card" part="card">
        <div class="card-body">
          <slot name="badge"></slot>
          ${this.heading
            ? html`<span class="card-heading" part="heading">${this.heading}</span>`
            : nothing}
          ${this.subheading
            ? html`<span class="card-subheading">${this.subheading}</span>`
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
