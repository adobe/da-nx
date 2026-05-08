import { LitElement, html, nothing } from 'da-lit';
import '../components/save-status.js';
import '../components/error-summary.js';

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

  _emitNavSelect(pointer) {
    this.dispatchEvent(new CustomEvent('form-intent', {
      detail: {
        type: 'form-nav-pointer-select',
        pointer,
      },
      bubbles: true,
      composed: true,
    }));
  }

  _canRender(node) {
    return node?.kind === 'object' || node?.kind === 'array';
  }

  _renderNavNode(node, { isArrayItem = false, arrayIndex = null } = {}) {
    if (!this._canRender(node)) return nothing;

    const label = isArrayItem && arrayIndex != null
      ? `#${arrayIndex} ${node.label ?? ''}`
      : (node.label ?? '');
    const isActive = this.context?.activeNavPointer === node.pointer;
    const children = node.kind === 'array'
      ? (node.items ?? [])
      : (node.children ?? []);

    return html`
      <li>
        <button
          type="button"
          class=${`item nav-item ${isActive ? 'is-active' : ''}`}
          aria-current=${isActive ? 'location' : undefined}
          @click=${() => this._emitNavSelect(node.pointer)}
        >${label}</button>
        ${children.length ? html`<ul>
          ${children.map((child, index) => this._renderNavNode(
            child,
            node.kind === 'array' ? { isArrayItem: true, arrayIndex: index + 1 } : {},
          ))}
        </ul>` : nothing}
      </li>
    `;
  }

  render() {
    const schemaTitle = this.context?.schema?.title ?? '';
    const root = this.context?.runtime?.root;

    return html`
      <aside class="panel">
        <h2>Sidebar</h2>
        <p class="hint">Schema title: ${schemaTitle || '(not available)'}</p>
        <da-sc-save-status .saving=${this.context?.saving}></da-sc-save-status>
        <da-sc-error-summary .validation=${this.context?.validation}></da-sc-error-summary>
        ${root ? html`
          <p class="hint">Navigation</p>
          <div class="nav-list">
            <ul>${this._renderNavNode(root)}</ul>
          </div>
        ` : nothing}
      </aside>
    `;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, StructuredContentFormSidebar);
}
