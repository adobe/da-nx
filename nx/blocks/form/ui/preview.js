import { LitElement, html } from 'da-lit';

const { default: getStyle } = await import('../../../utils/styles.js');
const style = await getStyle(import.meta.url);

const EL_NAME = 'sc-preview';

class Preview extends LitElement {
  static properties = {
    state: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  render() {
    const json = this.state?.document?.values;
    const text = JSON.stringify(json ?? {}, null, 2);

    return html`
      <div class="vis-wrapper is-visible">
        <p class="sc-title">Preview</p>
        <pre><code>${text}</code></pre>
      </div>
    `;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, Preview);
}
