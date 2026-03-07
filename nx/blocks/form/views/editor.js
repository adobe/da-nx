import { LitElement, html, nothing } from 'da-lit';
import './components/remove-button/remove-button.js';

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
    _annotated: { state: true },
    _errorsByPointer: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this.debouncedHandleChange = debounce(this.handleChange.bind(this), 1000);
  }

  update(props) {
    if (props.has('formModel') && this.formModel) {
      this.getAnnotated();
      this.runValidation();
    }
    super.update(props);
  }

  getAnnotated() {
    this._annotated = this.formModel.annotated;
  }

  runValidation() {
    if (!this.formModel) return;
    const { errorsByPointer } = this.formModel.validate();
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
        const parsed = Number(target.value);
        value = Number.isNaN(parsed) ? undefined : parsed;
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

  renderCheckbox(item) {
    const error = this.getError(item.pointer);
    const label = `${item.title ?? ''}${item.required ? ' *' : ''}`;
    const value = this.formModel.getValue(item) ?? false;
    return html`
      <sl-checkbox
        name="${item.pointer}"
        ?checked=${value}
        .error=${error || ''}
        @change=${this.handleChange}
      >${label}</sl-checkbox>
    `;
  }

  renderSelect(item) {
    const error = this.getError(item.pointer);
    const label = `${item.title ?? ''}${item.required ? ' *' : ''}`;
    const enumValues = item.enum ?? [];
    const optional = !item.required;
    const currentValue = this.formModel.getValue(item) ?? '';
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
        ${options.map((val) => html`<option value="${val}">${val}</option>`)}
      </sl-select>
    `;
  }

  renderInput(item, inputType = 'text') {
    const error = this.getError(item.pointer);
    const label = `${item.title ?? ''}${item.required ? ' *' : ''}`;
    const value = this.formModel.getValue(item) ?? '';
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

  renderPrimitiveByType(item) {
    const type = this.getPrimitiveType(item);
    let inner = nothing;
    switch (type) {
      case 'checkbox': inner = this.renderCheckbox(item); break;
      case 'select': inner = this.renderSelect(item); break;
      case 'text': inner = this.renderInput(item, 'text'); break;
      case 'number': inner = this.renderInput(item, 'number'); break;
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

  renderPrimitiveAsArrayItem(control, item, index) {
    return html`
      <div class="primitive-item-row">
        ${control}
        ${this.renderDeleteButton(item, index, true)}
      </div>
    `;
  }

  renderPrimitive(item, index, isArrayItem) {
    const control = this.renderPrimitiveByType(item);
    if (!control) return nothing;

    const inner = isArrayItem ? this.renderPrimitiveAsArrayItem(control, item, index) : control;

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

  renderList(parent, isRoot, parentIndex = null, isArrayItem = false) {
    const { children } = parent;
    if (!Array.isArray(children)) {
      return this.renderPrimitive(parent, parentIndex, isArrayItem);
    }

    const showAddButton = this.isArrayType(parent);

    return html`
      <div class="item-group ${isRoot ? 'root-group' : 'child-group'}" data-key="${parent.key}">
        <div class="item-group-title">
          <p>
            ${parent.title ?? ''}${parent.required ? html`<span class="is-required">*</span>` : ''}
          </p>
          ${this.renderDeleteButton(parent, parentIndex, isArrayItem)}
        </div>
        <div class="item-group-children">
          ${(children ?? []).map((item, index) => this.renderList(item, false, index + 1, this.isArrayType(parent)))}
          ${showAddButton ? this.renderAddItemButton(parent) : nothing}
        </div>
      </div>
    `;
  }

  render() {
    if (!this._annotated) return nothing;

    return html`
      <form>
        <div>
          ${this.renderList(this._annotated, true)}
        </div>
      </form>
    `;
  }
}

customElements.define('da-form-editor', FormEditor);
