import { LitElement, html } from 'da-lit';
import '../components/containers/field-section.js';
import '../components/error-summary.js';
import '../components/save-status.js';

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

  updated(changed) {
    if (!changed.has('context')) return;

    const prevContext = changed.get('context');
    const prevPointer = prevContext?.activeNavPointer;
    const nextPointer = this.context?.activeNavPointer;
    const nextOrigin = this.context?.activeNavOrigin;

    if (!nextPointer || nextPointer === prevPointer) return;
    if (nextOrigin === 'editor') return;
    this._scrollToPointer(nextPointer);
  }

  _scrollToPointer(pointer) {
    const safePointer = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(pointer)
      : pointer.replace(/"/g, '\\"');

    const el = this.shadowRoot?.querySelector(`[data-pointer="${safePointer}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }

  render() {
    const root = this.context?.runtime?.root;

    return html`
      <section class="panel">
        <div class="editor-header">
          <h2>Editor</h2>
          <da-sc-save-status .saving=${this.context?.saving}></da-sc-save-status>
        </div>
        <da-sc-error-summary .validation=${this.context?.validation}></da-sc-error-summary>
        ${root
    ? html`
              <div class="editor-root">
                <da-sc-field-section
                  .node=${root}
                  .errorsByPointer=${this.context?.validation?.errorsByPointer}
                  .activePointer=${this.context?.activeNavPointer}
                ></da-sc-field-section>
              </div>
            `
    : html`<p class="hint">No editable fields found.</p>`}
      </section>
    `;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, StructuredContentFormEditor);
}
