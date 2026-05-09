import { LitElement, html, nothing } from 'da-lit';

const { default: getStyle } = await import('../../../../utils/styles.js');
const style = await getStyle(import.meta.url);

const EL_NAME = 'da-sc-form-sidebar';

class StructuredContentFormV3Sidebar extends LitElement {
  static properties = {
    context: { attribute: false },
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
    if (nextOrigin === 'sidebar') return;
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

  _emitNavSelect(pointer) {
    this.dispatchEvent(new CustomEvent('form-intent', {
      detail: {
        type: 'form-nav-pointer-select',
        pointer,
        origin: 'sidebar',
      },
      bubbles: true,
      composed: true,
    }));
  }

  _canRender(node) {
    return node?.kind === 'object' || node?.kind === 'array';
  }

  _renderNode(node, { isArrayItem = false, arrayIndex = null } = {}) {
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
          class=${`item ${isActive ? 'is-active' : ''}`}
          data-pointer=${node.pointer}
          aria-current=${isActive ? 'location' : undefined}
          @click=${() => this._emitNavSelect(node.pointer)}
        >${label}</button>
        ${children.length ? html`
          <ul>
            ${children.map((child, index) => this._renderNode(
      child,
      node.kind === 'array' ? { isArrayItem: true, arrayIndex: index + 1 } : {},
    ))}
          </ul>
        ` : nothing}
      </li>
    `;
  }

  render() {
    const root = this.context?.runtime?.root;

    return html`
      <div class="da-sidebar-section">
        <p class="da-sidebar-title">Navigation</p>
        ${root ? html`
          <div class="nav-list">
            <ul>${this._renderNode(root)}</ul>
          </div>
        ` : nothing}
      </div>
    `;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, StructuredContentFormV3Sidebar);
}
