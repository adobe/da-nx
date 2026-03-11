import { LitElement, html, nothing } from 'da-lit';
import './components/remove-button/remove-button.js';
import './components/move-item-button/move-item-button.js';

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
    _errorsByPointer: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this.debouncedHandleChange = debounce(this.handleChange.bind(this), 1000);
  }

  update(props) {
    if (props.has('formModel') && this.formModel) {
      this.runValidation();
    }
    super.update(props);
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

  handleRemoveItem(e) {
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent('remove-item', {
      detail: { pointer: e.detail.pointer },
      bubbles: true,
      composed: true,
    }));
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

  renderDeleteButton(item, index, isArrayItem) {
    if (!isArrayItem) return nothing;
    return html`
      <remove-button
        .pointer=${item.pointer}
        .index=${index}
        @remove-item=${this.handleRemoveItem}
      ></remove-button>
    `;
  }

  renderMoveItemButton(item, index, arrayLength) {
    if (!arrayLength || arrayLength < 2) return nothing;
    return html`
      <move-item-button
        .pointer=${item.pointer}
        .index=${index}
        .arrayLength=${arrayLength}
      ></move-item-button>
    `;
  }

  renderPrimitiveAsArrayItem(control, item, index, arrayLength) {
    return html`
      <div class="primitive-item-row">
        ${control}
        <div class="primitive-item-actions">
          ${this.renderMoveItemButton(item, index, arrayLength)}
          ${this.renderDeleteButton(item, index, true)}
        </div>
      </div>
    `;
  }

  renderPrimitive(item, index, isArrayItem, arrayLength = 0) {
    const control = this.renderPrimitiveByType(item, isArrayItem ? index : null);
    if (!control) return nothing;

    const inner = isArrayItem
      ? this.renderPrimitiveAsArrayItem(control, item, index, arrayLength)
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

  renderList(parent, isRoot, parentIndex = null, isArrayItem = false, arrayLength = 0) {
    const { children } = parent;
    if (!Array.isArray(children)) {
      return this.renderPrimitive(parent, parentIndex, isArrayItem, arrayLength);
    }

    const showAddButton = this.isArrayType(parent);
    const items = children ?? [];

    return html`
      <div class="item-group ${isRoot ? 'root-group' : 'child-group'}" data-key="${parent.key}">
        <div class="item-group-title">
          <p>
            ${isArrayItem && parentIndex != null ? `#${parentIndex} ` : ''}${parent.title ?? ''}${parent.required ? html`<span class="is-required">*</span>` : ''}
          </p>
          ${isArrayItem
        ? html`<div class="item-group-actions">
              ${this.renderMoveItemButton(parent, parentIndex, items.length)}
              ${this.renderDeleteButton(parent, parentIndex, true)}
            </div>`
        : nothing}
        </div>
        <div class="item-group-children">
          ${items.map((item, index) => this.renderList(item, false, index + 1, this.isArrayType(parent), this.isArrayType(parent) ? items.length : 0))}
          ${showAddButton ? this.renderAddItemButton(parent) : nothing}
        </div>
      </div>
    `;
  }

  render() {
    const annotated = this.formModel?.annotated;
    if (!annotated) return nothing;

    return html`
      <form>
        <div>
          ${this.renderList(annotated, true)}
        </div>
      </form>
    `;
  }
}

customElements.define('da-form-editor', FormEditor);
