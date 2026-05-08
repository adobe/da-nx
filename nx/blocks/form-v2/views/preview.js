import { LitElement, html } from 'da-lit';
import '../components/save-status.js';
import '../components/error-summary.js';

const { default: getStyle } = await import('../../../utils/styles.js');
const style = await getStyle(import.meta.url);

const EL_NAME = 'da-sc-form-preview';

class StructuredContentFormPreview extends LitElement {
  static properties = {
    context: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  render() {
    const json = this.context?.json;
    const text = JSON.stringify(json ?? {}, null, 2);

    return html`
      <section class="panel">
        <h2>Preview</h2>
        <da-sc-save-status .saving=${this.context?.saving}></da-sc-save-status>
        <da-sc-error-summary .validation=${this.context?.validation}></da-sc-error-summary>
        <pre class="json">${text}</pre>
      </section>
    `;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, StructuredContentFormPreview);
}
