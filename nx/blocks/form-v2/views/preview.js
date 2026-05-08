import { LitElement, html } from 'da-lit';

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
      <div class="vis-wrapper is-visible">
        <p class="da-title">Preview</p>
        <pre class="language-json"><code class="language-json">${text}</code></pre>
      </div>
    `;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, StructuredContentFormPreview);
}
