import { LitElement, html, nothing } from 'da-lit';
import '../../views/components/array-item-menu.js';
import '../../views/components/reorder-dialog.js';

const EL_NAME = 'da-sc-array-field';

class StructuredContentArrayField extends LitElement {
  static properties = {
    node: { attribute: false },
    errorsByPointer: { attribute: false },
    activePointer: { attribute: false },
    _reorderPointer: { state: true },
    _reorderTargetIndex: { state: true },
  };

  constructor() {
    super();
    this._reorderPointer = '';
    this._reorderTargetIndex = 0;
  }

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
    this._resetReorder();
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

  _resetReorder() {
    this._reorderPointer = '';
    this._reorderTargetIndex = 0;
  }

  _setReorderTarget(index, itemCount) {
    const lastIndex = Math.max(itemCount - 1, 0);
    this._reorderTargetIndex = Math.max(0, Math.min(index, lastIndex));
  }

  _onMenuOpen() {
    if (!this._reorderPointer) return;
    this._resetReorder();
  }

  _handleDescendantIntent(e) {
    const detail = e?.detail;
    if (detail?.type !== 'form-array-reorder-start') return;

    e.stopPropagation();
    this._onReorderStart(e, this.node?.items?.length ?? 0);
  }

  _onReorderStart(e, itemCount) {
    const pointer = e?.detail?.pointer ?? '';
    if (!pointer) return;

    this._reorderPointer = pointer;
    this._setReorderTarget(e?.detail?.index ?? 0, itemCount);
  }

  _beforePointerFromTargetIndex(pointers, currentIndex, targetIndex) {
    if (!pointers.length) return undefined;

    const lastIndex = pointers.length - 1;
    if (targetIndex > currentIndex) {
      if (targetIndex >= lastIndex) return undefined;
      return pointers[targetIndex + 1];
    }

    return pointers[targetIndex];
  }

  _getItemsInPreviewOrder(items) {
    if (!this._reorderPointer) return items;

    const currentIndex = items.findIndex((item) => item.pointer === this._reorderPointer);
    if (currentIndex < 0) return items;

    const lastIndex = Math.max(items.length - 1, 0);
    const targetIndex = Math.max(0, Math.min(this._reorderTargetIndex, lastIndex));
    if (targetIndex === currentIndex) return items;

    const reordered = items.slice();
    const [item] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, item);
    return reordered;
  }

  _confirmReorder(items, pointers) {
    if (!this._reorderPointer) return;

    const pointer = this._reorderPointer;
    const currentIndex = items.findIndex((item) => item.pointer === pointer);
    if (currentIndex < 0) {
      this._resetReorder();
      return;
    }

    const targetIndex = this._reorderTargetIndex;
    if (targetIndex === currentIndex) {
      this._resetReorder();
      return;
    }

    const beforePointer = this._beforePointerFromTargetIndex(pointers, currentIndex, targetIndex);
    this._emitIntent({
      type: 'form-array-reorder',
      pointer,
      beforePointer,
    });
    this._resetReorder();
  }

  updated(changed) {
    if (!this._reorderPointer) return;
    if (!changed.has('node')) return;

    const items = this.node?.items ?? [];
    const activeItemIndex = items.findIndex((item) => item.pointer === this._reorderPointer);
    if (activeItemIndex < 0) {
      this._resetReorder();
      return;
    }

    this._setReorderTarget(this._reorderTargetIndex, items.length);
  }

  render() {
    const { node } = this;
    if (!node) return nothing;

    const items = node.items ?? [];
    const pointers = items.map((item) => item.pointer);
    const displayItems = this._getItemsInPreviewOrder(items);
    const displayPointers = displayItems.map((item) => item.pointer);
    const readonly = !!node.readonly;
    const active = this.activePointer === node.pointer;
    const itemCount = items.length;
    const { minItems: rawMinItems, maxItems } = node;
    const minItems = rawMinItems ?? 0;
    const canAdd = !readonly && (maxItems === undefined || itemCount < maxItems);
    const canRemove = !readonly && itemCount > minItems;
    const addItemLabel = this._getAddItemLabel(node);

    return html`
      <section
        data-pointer=${node.pointer}
        class=${active ? 'active-section' : ''}
        @form-array-menu-open=${this._onMenuOpen}
        @form-intent=${this._handleDescendantIntent}
      >
        <p @click=${this._selectSelf}>
          ${node.label}${node.required ? html`<span class="is-required">*</span>` : nothing}
        </p>
        ${displayItems.map((item, index) => {
    const isObjectItem = item.kind === 'object';
    const isReorderActive = this._reorderPointer === item.pointer;

    return html`
            <article class=${isReorderActive ? 'move-item-picked' : ''}>
              ${isObjectItem ? html`
                <da-sc-field-section
                  .node=${item}
                  .errorsByPointer=${this.errorsByPointer}
                  .activePointer=${this.activePointer}
                  .arrayItemIndex=${index + 1}
                  .arrayItemPointers=${displayPointers}
                  .arrayReadonly=${readonly}
                  .arrayItemCount=${itemCount}
                  .arrayMinItems=${minItems}
                  .arrayMaxItems=${maxItems}
                  .reorderActivePointer=${this._reorderPointer}
                ></da-sc-field-section>
              ` : html`
                <div class="item-group-title">
                  <p>${this._getArrayItemHeading(item, index)}</p>
                  <div class="item-group-actions">
                    <da-sc-array-item-menu
                      .pointer=${item.pointer}
                      .index=${index}
                      .pointers=${displayPointers}
                      .readonly=${readonly}
                      .itemCount=${itemCount}
                      .minItems=${minItems}
                      .maxItems=${maxItems}
                      .active=${isReorderActive}
                    ></da-sc-array-item-menu>
                  </div>
                </div>
                <da-sc-field-section
                  .node=${item}
                  .errorsByPointer=${this.errorsByPointer}
                  .activePointer=${this.activePointer}
                ></da-sc-field-section>
              `}
              ${isReorderActive ? html`
                <da-sc-reorder-dialog
                  .targetIndex=${this._reorderTargetIndex}
                  .totalItems=${itemCount}
                  @reorder-move-up=${() => this._setReorderTarget(this._reorderTargetIndex - 1, itemCount)}
                  @reorder-move-down=${() => this._setReorderTarget(this._reorderTargetIndex + 1, itemCount)}
                  @reorder-move-to-first=${() => this._setReorderTarget(0, itemCount)}
                  @reorder-move-to-last=${() => this._setReorderTarget(itemCount - 1, itemCount)}
                  @reorder-confirm=${() => this._confirmReorder(items, pointers)}
                  @reorder-cancel=${() => this._resetReorder()}
                ></da-sc-reorder-dialog>
              ` : nothing}
            </article>
          `;
  })}
        <button type="button" class="add-item-btn" ?disabled=${!canAdd} @click=${this._addItem}>
          ${addItemLabel}
        </button>
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
