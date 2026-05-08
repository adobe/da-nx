import { LitElement, html, nothing } from 'da-lit';
import '../../views/components/array-item-menu.js';

const EL_NAME = 'da-sc-object-group';

class StructuredContentObjectGroup extends LitElement {
  static properties = {
    node: { attribute: false },
    errorsByPointer: { attribute: false },
    activePointer: { attribute: false },
    arrayItemIndex: { attribute: false },
    arrayItemPointers: { attribute: false },
    arrayReadonly: { attribute: false },
    arrayItemCount: { attribute: false },
    arrayMinItems: { attribute: false },
    arrayMaxItems: { attribute: false },
    reorderActivePointer: { attribute: false },
  };

  createRenderRoot() {
    return this;
  }

  render() {
    const { node } = this;
    if (!node) return nothing;

    const children = node.children ?? [];
    const required = !!node.required;
    const isArrayItem = Number.isInteger(this.arrayItemIndex);
    const heading = isArrayItem
      ? `#${this.arrayItemIndex} ${node.label ?? ''}`
      : (node.label ?? '');
    const active = this.activePointer === node.pointer;

    return html`
      <fieldset data-pointer=${node.pointer} class=${active ? 'active-section' : ''}>
        <legend @click=${this._selectSelf}>
          <span class="legend-label">
            ${heading}${required ? html`<span class="is-required">*</span>` : nothing}
          </span>
          ${isArrayItem ? html`
            <span class="item-group-actions">
              <da-sc-array-item-menu
                .pointer=${node.pointer}
                .index=${Math.max(0, this.arrayItemIndex - 1)}
                .pointers=${this.arrayItemPointers}
                .readonly=${this.arrayReadonly}
                .itemCount=${this.arrayItemCount}
                .minItems=${this.arrayMinItems}
                .maxItems=${this.arrayMaxItems}
                .active=${this.reorderActivePointer === node.pointer}
              ></da-sc-array-item-menu>
            </span>
          ` : nothing}
        </legend>
        ${children.map((child) => html`
          <da-sc-field-section
            .node=${child}
            .errorsByPointer=${this.errorsByPointer}
            .activePointer=${this.activePointer}
          ></da-sc-field-section>
        `)}
      </fieldset>
    `;
  }

  _selectSelf() {
    this.dispatchEvent(new CustomEvent('form-intent', {
      detail: {
        type: 'form-nav-pointer-select',
        pointer: this.node?.pointer,
        origin: 'editor',
      },
      bubbles: true,
      composed: true,
    }));
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, StructuredContentObjectGroup);
}
