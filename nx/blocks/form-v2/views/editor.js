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
    el.scrollIntoView({ block: 'start', behavior: 'auto' });
  }

  render() {
    const root = this.context?.runtime?.root;

    if (!root) return html`<p class="hint">No editable fields found.</p>`;

    return html`
      <div class="editor-root">
        <da-sc-field-section
          .node=${root}
          .errorsByPointer=${this.context?.validation?.errorsByPointer}
          .activePointer=${this.context?.activeNavPointer}
        ></da-sc-field-section>
      </div>
    `;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, StructuredContentFormEditor);
}
