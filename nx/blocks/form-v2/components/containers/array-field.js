import { LitElement, html, nothing } from 'da-lit';
import '../../views/components/array-item-menu.js';

const EL_NAME = 'da-sc-array-field';

class StructuredContentArrayField extends LitElement {
  static properties = {
    node: { attribute: false },
    errorsByPointer: { attribute: false },
    activePointer: { attribute: false },
  };

  createRenderRoot() {
    return this;
  }

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

  _selectSelf() {
    this._emitIntent({
      type: 'form-nav-pointer-select',
      pointer: this.node?.pointer,
      origin: 'editor',
    });
  }

  _getAddItemLabel(node) {
    const itemLabel = node?.itemLabel ?? '';
    return itemLabel ? `+ Add ${itemLabel}` : '+ Add item';
  }

  _getArrayItemHeading(item, index) {
    if (!item || (item.kind !== 'object' && item.kind !== 'array')) {
      return `Item ${index + 1}`;
    }
    const label = item.label ?? '';
    return label ? `#${index + 1} ${label}` : `Item ${index + 1}`;
  }

  render() {
    const { node } = this;
    if (!node) return nothing;

    const items = node.items ?? [];
    const pointers = items.map((item) => item.pointer);
    const readonly = !!node.readonly;
    const active = this.activePointer === node.pointer;
    const itemCount = items.length;
    const { minItems: rawMinItems, maxItems } = node;
    const minItems = rawMinItems ?? 0;
    const canAdd = !readonly && (maxItems === undefined || itemCount < maxItems);
    const canRemove = !readonly && itemCount > minItems;
    const addItemLabel = this._getAddItemLabel(node);

    return html`
      <section data-pointer=${node.pointer} class=${active ? 'active-section' : ''}>
        <p @click=${this._selectSelf}>${node.label}${node.required ? '*' : ''}</p>
        ${items.map((item, index) => html`
          <article>
            <p>${this._getArrayItemHeading(item, index)}</p>
            <da-sc-array-item-menu
              .pointer=${item.pointer}
              .index=${index}
              .pointers=${pointers}
              .readonly=${readonly}
              .itemCount=${itemCount}
              .minItems=${minItems}
              .maxItems=${maxItems}
            ></da-sc-array-item-menu>
            <da-sc-field-section
              .node=${item}
              .errorsByPointer=${this.errorsByPointer}
              .activePointer=${this.activePointer}
            ></da-sc-field-section>
          </article>
        `)}
        <button type="button" ?disabled=${!canAdd} @click=${this._addItem}>${addItemLabel}</button>
        ${minItems > 0 && !canRemove && itemCount <= minItems
    ? html`<p>At least ${minItems} item${minItems === 1 ? '' : 's'} required.</p>`
    : nothing}
        ${maxItems !== undefined && itemCount >= maxItems
    ? html`<p>Maximum ${maxItems} item${maxItems === 1 ? '' : 's'} reached.</p>`
    : nothing}
      </section>
    `;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, StructuredContentArrayField);
}
