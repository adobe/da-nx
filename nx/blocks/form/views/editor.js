import { LitElement, html, nothing, ref } from 'da-lit';
import './components/array-item-menu/array-item-menu.js';
import './components/reorder-dialog/reorder-dialog.js';
import { getParentPointer } from '../utils/pointer.js';
import { findNodeByPointer } from '../utils/utils.js';

const { default: getStyle } = await import('../../../utils/styles.js');
const style = await getStyle(import.meta.url);

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func.apply(this, args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

class FormEditor extends LitElement {
  static properties = {
    formModel: { state: true },
    activeNavPointer: { attribute: false },
    navPointerScroll: { attribute: false },
    _errorsByPointer: { state: true },
    _moveActive: { state: true },
  };

  constructor() {
    super();
    this._moveActive = null;
    this._sectionElByPointer = new Map();
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this.debouncedHandleChange = debounce(this.handleChange.bind(this), 1000);
  }

  _handleMoveActivate(e) {
    const { pointer, currentIndex } = e.detail;
    const parentPointer = getParentPointer(pointer);
    this._moveActive = {
      pointer,
      currentIndex,
      parentPointer,
      targetIndex: currentIndex,
    };
  }

  _getArrayItems(parentPointer) {
    const node = findNodeByPointer(this.formModel.annotated, parentPointer);
    return node?.children ?? [];
  }

  _cancelMoveMode() {
    this._moveActive = null;
  }

  _setTargetIndex(index) {
    if (!this._moveActive) return;
    const items = this.formModel?.annotated
      ? this._getArrayItems(this._moveActive.parentPointer)
      : [];
    const clamped = Math.max(0, Math.min(index, items.length));
    this._moveActive = { ...this._moveActive, targetIndex: clamped };
  }

  _handleConfirmMove() {
    if (!this._moveActive) return;
    const { pointer, currentIndex, targetIndex } = this._moveActive;
    if (targetIndex === currentIndex) {
      this._cancelMoveMode();
      return;
    }
    const items = this.formModel?.annotated
      ? this._getArrayItems(this._moveActive.parentPointer)
      : [];
    const beforePointer = targetIndex >= items.length
      ? undefined
      : items[targetIndex].pointer;
    this.dispatchEvent(new CustomEvent('move-array-item', {
      detail: { pointer, beforePointer },
      bubbles: true,
      composed: true,
    }));
    this._cancelMoveMode();
  }

  renderReorderDialog() {
    if (!this._moveActive) return nothing;
    const { targetIndex } = this._moveActive;
    const items = this.formModel?.annotated
      ? this._getArrayItems(this._moveActive.parentPointer)
      : [];
    return html`
      <reorder-dialog
        .targetIndex=${targetIndex}
        .totalItems=${items.length}
        @reorder-move-up=${() => this._setTargetIndex(this._moveActive.targetIndex - 1)}
        @reorder-move-down=${() => this._setTargetIndex(this._moveActive.targetIndex + 1)}
        @reorder-move-to-first=${() => this._setTargetIndex(0)}
        @reorder-move-to-last=${() => this._setTargetIndex(items.length)}
        @reorder-confirm=${this._handleConfirmMove}
        @reorder-cancel=${this._cancelMoveMode}
      ></reorder-dialog>
    `;
  }

  _getItemsInPreviewOrder(items, parentPointer) {
    if (!this._moveActive || this._moveActive.parentPointer !== parentPointer) return items;
    const { currentIndex, targetIndex } = this._moveActive;
    if (currentIndex === targetIndex) return items;
    const reordered = items.slice();
    const [item] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, item);
    return reordered;
  }

  update(props) {
    if (props.has('formModel') && this.formModel) {
      this.runValidation();
    }
    super.update(props);
  }

  updated(changed) {
    super.updated(changed);
    if (!changed.has('activeNavPointer') || !this.activeNavPointer) return;
    if (this.navPointerScroll?.scrollEditor === false) return;
    const el = this._sectionElByPointer.get(this.activeNavPointer);
    if (!el) return;
    el.scrollIntoView({ block: 'start', behavior: 'auto' });
  }

  _bindSectionRef(pointer, el) {
    if (el) this._sectionElByPointer.set(pointer, el);
    else this._sectionElByPointer.delete(pointer);
  }

  _onGroupPointerActivate(e, pointer) {
    if (e.button !== 0) return;
    const innermost = e.composedPath().find(
      (n) => n instanceof HTMLElement && n.classList.contains('item-group'),
    );
    if (innermost !== e.currentTarget) return;
    this.dispatchEvent(new CustomEvent('nav-pointer-select', {
      detail: { pointer },
      bubbles: true,
      composed: true,
    }));
  }

  runValidation() {
    if (!this.formModel) return;
    const result = this.formModel.validate();
    const { errorsByPointer } = result;
    this._errorsByPointer = errorsByPointer;
  }

  getError(pointer) {
    if (!this._errorsByPointer) return null;
    const key = pointer || '/data';
    return this._errorsByPointer.get?.(key) ?? null;
  }

  handleChange({ target }) {
    const { name } = target;
    const inputType = target.type ?? target.getAttribute?.('type');
    let value;
    switch (inputType) {
      case 'checkbox':
        value = target.checked;
        break;
      case 'number': {
        if (target.value === '') {
          value = undefined;
        } else {
          const parsed = Number(target.value);
          value = Number.isNaN(parsed) ? undefined : parsed;
        }
        break;
      }

      default:
        value = target.value;
    }
    if (value === '' || value === null) value = undefined;
    const opts = { detail: { name, value }, bubbles: true, composed: true };
    const event = new CustomEvent('update', opts);
    this.dispatchEvent(event);
  }

  handleInput({ target }) {
    this.debouncedHandleChange({ target });
  }

  handleAddItem(parent) {
    const { pointer, items } = parent;
    const opts = { detail: { pointer, items }, bubbles: true, composed: true };
    this.dispatchEvent(new CustomEvent('add-item', opts));
  }

  getItemLabel(item, arrayItemIndex = null) {
    const base = `${item.title ?? ''}${item.required ? ' *' : ''}`;
    return arrayItemIndex != null ? `#${arrayItemIndex} ${base}` : base;
  }

  renderCheckbox(item, arrayItemIndex = null) {
    const error = this.getError(item.pointer);
    const label = this.getItemLabel(item, arrayItemIndex);
    const value = this.formModel.getValue(item) ?? this.getDisplayFallbackForInput(item);
    return html`
      <sl-checkbox
        name="${item.pointer}"
        ?checked=${value}
        .error=${error || ''}
        @change=${this.handleChange}
      >${label}</sl-checkbox>
    `;
  }

  renderSelect(item, arrayItemIndex = null) {
    const error = this.getError(item.pointer);
    const label = this.getItemLabel(item, arrayItemIndex);
    const enumValues = item.enum ?? [];
    const optional = !item.required;
    const currentValue = this.formModel.getValue(item) ?? this.getDisplayFallbackForInput(item);
    const hasInvalidValue = currentValue && !enumValues.includes(currentValue);
    const options = hasInvalidValue
      ? [currentValue, ...enumValues]
      : enumValues;
    return html`
      <sl-select
        .label=${label}
        name="${item.pointer}"
        value="${currentValue}"
        .error=${error || ''}
        @change=${this.handleChange}
      >
        ${optional
        ? html`<option value="">None</option>`
        : html`<option value="" disabled>Please Select</option>`}
        ${options.map((optionValue) => html`<option value="${optionValue}">${optionValue}</option>`)}
      </sl-select>
    `;
  }

  renderInput(item, inputType = 'text', arrayItemIndex = null) {
    const error = this.getError(item.pointer);
    const label = this.getItemLabel(item, arrayItemIndex);
    const value = this.formModel.getValue(item) ?? this.getDisplayFallbackForInput(item);
    return html`
      <sl-input
        .label=${label}
        type="${inputType}"
        name="${item.pointer}"
        value="${value}"
        .error=${error || ''}
        @input=${this.handleInput}
      ></sl-input>
    `;
  }

  getPrimitiveType(item) {
    const { type, enum: enumVal } = item ?? {};
    if (enumVal) return 'select';
    if (type === 'boolean') return 'checkbox';
    if (type === 'string') return 'text';
    if (type === 'number' || type === 'integer') return 'number';
    return null;
  }

  /** Display value when key is omitted. For HTML inputs only; never stored. */
  getDisplayFallbackForInput(item) {
    const type = this.getPrimitiveType(item);
    if (type === 'checkbox') return false;
    if (type === 'select' || type === 'text' || type === 'number') return '';
    return '';
  }

  renderPrimitiveByType(item, arrayItemIndex = null) {
    const type = this.getPrimitiveType(item);
    let inner = nothing;
    switch (type) {
      case 'checkbox': inner = this.renderCheckbox(item, arrayItemIndex); break;
      case 'select': inner = this.renderSelect(item, arrayItemIndex); break;
      case 'text': inner = this.renderInput(item, 'text', arrayItemIndex); break;
      case 'number': inner = this.renderInput(item, 'number', arrayItemIndex); break;
      default: break;
    }
    return !inner ? nothing : html`
      <div class="primitive-item-content">
        ${inner}
      </div>
    `;
  }

  renderArrayItemMenu(item, index, arrayLength) {
    if (!arrayLength) return nothing;
    const active = this._moveActive?.pointer === item.pointer;
    return html`
      <array-item-menu
        .pointer=${item.pointer}
        .index=${index}
        .arrayLength=${arrayLength}
        .active=${active}
      ></array-item-menu>
    `;
  }

  renderPrimitiveAsArrayItem(control, item, index, arrayLength, arrayParent) {
    const moveItemPicked = this._moveActive?.pointer === item.pointer;
    return html`
      <div class="primitive-item-row ${moveItemPicked ? 'move-item-picked' : ''}">
        ${control}
        <div class="primitive-item-actions">
          ${arrayParent ? this.renderArrayItemMenu(item, index, arrayLength) : nothing}
        </div>
        ${moveItemPicked ? this.renderReorderDialog() : nothing}
      </div>
    `;
  }

  renderPrimitive(item, index, isArrayItem, arrayLength = 0, arrayParent = null) {
    const control = this.renderPrimitiveByType(item, isArrayItem ? index : null);
    if (!control) return nothing;

    const inner = isArrayItem
      ? this.renderPrimitiveAsArrayItem(control, item, index, arrayLength, arrayParent)
      : control;

    return html`
        ${inner}
    `;
  }

  isArrayType(parent) {
    return parent.type === 'array';
  }

  getAddItemLabel(parent) {
    const { items } = parent;
    const label = items?.title;
    return label ? `+ Add ${label}` : '+ Add item';
  }

  renderAddItemButton(parent) {
    return html`
      <button
        type="button"
        class="add-item-btn"
        @click=${() => this.handleAddItem(parent)}
      >${this.getAddItemLabel(parent)}</button>
    `;
  }

  renderList(
    parent,
    isRoot,
    parentIndex = null,
    isArrayItem = false,
    arrayLength = 0,
    arrayParent = null,
  ) {
    const { children } = parent;
    if (!Array.isArray(children)) {
      return this.renderPrimitive(parent, parentIndex, isArrayItem, arrayLength, arrayParent);
    }

    const showAddButton = this.isArrayType(parent);
    const items = children ?? [];

    const moveItemPicked = isArrayItem && this._moveActive?.pointer === parent.pointer;
    return html`
      <div
        class="item-group ${isRoot ? 'root-group' : 'child-group'} ${moveItemPicked ? 'move-item-picked' : ''}"
        data-key="${parent.key}"
        @click=${(e) => this._onGroupPointerActivate(e, parent.pointer)}
        ${ref((el) => this._bindSectionRef(parent.pointer, el))}
      >
        <div class="item-group-title">
          <p>
            ${isArrayItem && parentIndex != null ? `#${parentIndex} ` : ''}${parent.title ?? ''}${parent.required ? html`<span class="is-required">*</span>` : ''}
          </p>
          ${isArrayItem && arrayParent
        ? html`<div class="item-group-actions">
              ${this.renderArrayItemMenu(parent, parentIndex, items.length)}
            </div>`
        : nothing}
          ${moveItemPicked ? this.renderReorderDialog() : nothing}
        </div>
        <div class="item-group-children">
          ${(this._getItemsInPreviewOrder(items, parent.pointer)).map((item, index) => {
          const isArray = this.isArrayType(parent);
          const arrayLen = isArray ? items.length : 0;
          const nextArrayParent = isArray ? parent : arrayParent;
          return this.renderList(item, false, index + 1, isArray, arrayLen, nextArrayParent);
        })}
          ${showAddButton ? this.renderAddItemButton(parent) : nothing}
        </div>
      </div>
    `;
  }

  render() {
    const annotated = this.formModel?.annotated;
    if (!annotated) return nothing;

    return html`
      <form
        @move-activate=${this._handleMoveActivate}
        @menu-open=${this._cancelMoveMode}
      >
        <div>
          ${this.renderList(annotated, true)}
        </div>
      </form>
    `;
  }
}

customElements.define('da-form-editor', FormEditor);
