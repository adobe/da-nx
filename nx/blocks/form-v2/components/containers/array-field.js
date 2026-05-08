import { LitElement, html, nothing } from 'da-lit';
import '../../views/components/array-item-menu.js';

const EL_NAME = 'da-sc-array-field';

class StructuredContentArrayField extends LitElement {
  static properties = {
    node: { attribute: false },
    errorsByPointer: { attribute: false },
  };

  _emitIntent(detail) {
    this.dispatchEvent(new CustomEvent('form-intent', {
      detail,
      bubbles: true,
      composed: true,
    }));
  }

  _addItem() {
    this._emitIntent({
      type: 'form-array-add',
      pointer: this.node?.pointer,
    });
  }

  render() {
    const node = this.node;
    if (!node) return nothing;

    const items = node.items ?? [];
    const pointers = items.map((item) => item.pointer);

    return html`
      <section data-pointer=${node.pointer}>
        <p>${node.label}${node.required ? '*' : ''}</p>
        ${items.map((item, index) => html`
          <article>
            <p>Item ${index + 1}</p>
            <da-sc-array-item-menu
              .pointer=${item.pointer}
              .index=${index}
              .pointers=${pointers}
            ></da-sc-array-item-menu>
            <da-sc-field-section
              .node=${item}
              .errorsByPointer=${this.errorsByPointer}
            ></da-sc-field-section>
          </article>
        `)}
        <button type="button" @click=${this._addItem}>Add item</button>
      </section>
    `;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, StructuredContentArrayField);
}
