import { LitElement, html, nothing } from 'da-lit';

const EL_NAME = 'da-sc-error-summary';

class StructuredContentErrorSummary extends LitElement {
  static properties = {
    validation: { attribute: false },
  };

  render() {
    const errors = this.validation?.errors ?? [];
    if (!errors.length) return nothing;

    return html`
      <section>
        <p>Validation errors (${errors.length})</p>
        <ul>
          ${errors.map((error) => html`
            <li><strong>${error.pointer}</strong>: ${error.message}</li>
          `)}
        </ul>
      </section>
    `;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, StructuredContentErrorSummary);
}
