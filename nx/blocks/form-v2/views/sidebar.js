import { LitElement, html } from 'da-lit';

const { default: getStyle } = await import('../../../utils/styles.js');
const style = await getStyle(import.meta.url);

const EL_NAME = 'da-sc-form-sidebar';

class StructuredContentFormSidebar extends LitElement {
  static properties = {
    context: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  render() {
    const schemaTitle = this.context?.schema?.title ?? '';

    return html`
      <aside class="panel">
        <h2>Sidebar</h2>
        <p class="hint">Navigation and document controls land here.</p>
        <p class="hint">Schema title: ${schemaTitle || '(not available)'}</p>
      </aside>
    `;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, StructuredContentFormSidebar);
}
