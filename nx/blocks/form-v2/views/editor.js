import { LitElement, html } from 'da-lit';

const { default: getStyle } = await import('../../../utils/styles.js');
const style = await getStyle(import.meta.url);

const EL_NAME = 'da-sc-form-editor';

class StructuredContentFormEditor extends LitElement {
  static properties = {
    context: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  render() {
    const fullpath = this.context?.details?.fullpath ?? '';
    const schemaName = this.context?.schemaName ?? '';
    const rootKeys = Object.keys(this.context?.json?.data ?? {});
    const rootNode = this.context?.runtime?.root;
    const nodeCount = this.context?.index?.nodesByPointer?.size ?? 0;
    const arrayCount = this.context?.index?.arraysByPointer?.size ?? 0;

    return html`
      <section class="panel">
        <h2>Editor</h2>
        <p class="hint">Step 3 runtime model is built from compiled schema.</p>
        <p class="path">${fullpath}</p>
        <p class="path">Schema: ${schemaName || '(none)'}</p>
        <p class="path">Data keys: ${rootKeys.length}</p>
        <p class="path">Root kind: ${rootNode?.kind ?? '(none)'}</p>
        <p class="path">Indexed nodes: ${nodeCount}</p>
        <p class="path">Array nodes: ${arrayCount}</p>
      </section>
    `;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, StructuredContentFormEditor);
}
