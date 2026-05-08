import { LitElement, html } from 'da-lit';
import '../components/containers/field-section.js';

const { default: getStyle } = await import('../../../utils/styles.js');
const style = await getStyle(import.meta.url);

const EL_NAME = 'da-sc-form-editor';

class StructuredContentFormEditor extends LitElement {
  static properties = {
    context: { attribute: false },
    controller: { attribute: false },
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
    const errorCount = this.context?.validation?.errors?.length ?? 0;
    const saveStatus = this.context?.saving?.status
      ?? this.context?.savingStore?.getState()?.status
      ?? 'idle';
    const activePointer = this.context?.activeNavPointer ?? '';
    const root = this.context?.runtime?.root;

    return html`
      <section class="panel">
        <h2>Editor</h2>
        <p class="hint">Step 6 recursive containers + fields are active.</p>
        <p class="path">${fullpath}</p>
        <p class="path">Schema: ${schemaName || '(none)'}</p>
        <p class="path">Data keys: ${rootKeys.length}</p>
        <p class="path">Root kind: ${rootNode?.kind ?? '(none)'}</p>
        <p class="path">Indexed nodes: ${nodeCount}</p>
        <p class="path">Array nodes: ${arrayCount}</p>
        <p class="path">Validation errors: ${errorCount}</p>
        <p class="path">Save status: ${saveStatus}</p>
        <p class="path">Active pointer: ${activePointer || '(none)'}</p>
        ${root ? html`
          <div class="editor-root">
            <da-sc-field-section
              .node=${root}
              .errorsByPointer=${this.context?.validation?.errorsByPointer}
            ></da-sc-field-section>
          </div>
        ` : ''}
      </section>
    `;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, StructuredContentFormEditor);
}
