import { LitElement, html, nothing } from 'da-lit';
import './components/remove-button/remove-button.js';

const { default: getStyle } = await import('../../../utils/styles.js');
const { resolvePropSchema } = await import('../utils/utils.js');
const { normalizePointer } = await import('../utils/validator.js');
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
    _data: { state: true },
    _errorsByPointer: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this.debouncedHandleChange = debounce(this.handleChange.bind(this), 1000);
  }

  update(props) {
    if (props.has('formModel') && this.formModel) {
      this.getData();
      this.runValidation();
    }
    super.update(props);
  }

  getData() {
    this._data = this.formModel.annotated;
  }

  runValidation() {
    if (!this.formModel) return;
    const { errorsByPointer } = this.formModel.validate();
    this._errorsByPointer = errorsByPointer;
  }

  getError(pointer) {
    if (!this._errorsByPointer) return null;
    const key = normalizePointer(pointer);
    return this._errorsByPointer.get?.(key) ?? this._errorsByPointer[key] ?? null;
  }

  handleChange({ target }) {
    const { name } = target;
    let value;
    switch (target.type) {
      case 'checkbox':
        value = target.checked;
        break;
      default:
        value = target.value;
    }
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
    const { pointer, schema } = parent;
    const itemsSchema = schema?.properties?.items;
    const opts = { detail: { pointer, itemsSchema }, bubbles: true, composed: true };
    this.dispatchEvent(new CustomEvent('add-item', opts));
  }

  renderCheckbox(item) {
    const error = this.getError(item.pointer);
    const label = `${item.schema.title}${item.required ? ' *' : ''}`;
    return html`
      <sl-checkbox
        name="${item.pointer}"
        ?checked=${item.data}
        .error=${error || ''}
        @change=${this.handleChange}
      >${label}</sl-checkbox>
    `;
  }

  renderSelect(item) {
    const error = this.getError(item.pointer);
    const label = `${item.schema.title}${item.required ? ' *' : ''}`;
    return html`
      <sl-select
        .label=${label}
        name="${item.pointer}"
        value="${item.data}"
        .error=${error || ''}
        @change=${this.handleChange}
      >
        ${item.schema.properties.enum.map((val) => html`<option>${val}</option>`)}
      </sl-select>
    `;
  }

  renderInput(item, inputType = 'text') {
    const error = this.getError(item.pointer);
    const label = `${item.schema.title}${item.required ? ' *' : ''}`;
    return html`
      <sl-input
        .label=${label}
        type="${inputType}"
        name="${item.pointer}"
        value="${item.data}"
        .error=${error || ''}
        @input=${this.handleInput}
      ></sl-input>
    `;
  }

  getPrimitiveType(item) {
    const { type, enum: enumVal } = item.schema.properties;
    if (enumVal) return 'select';
    if (type === 'boolean') return 'checkbox';
    if (type === 'string') return 'text';
    if (type === 'number') return 'number';
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
    const { schema } = parent;
    return schema?.type === 'array' || schema?.properties?.type === 'array';
  }

  getAddItemLabel(parent) {
    const itemsSchema = parent.schema?.properties?.items;
    const resolved = itemsSchema && resolvePropSchema(itemsSchema, this.formModel?.schema);
    const label = resolved?.title;
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
    if (!Array.isArray(parent.data)) {
      return this.renderPrimitive(parent, parentIndex, isArrayItem);
    }

    const showAddButton = this.isArrayType(parent);

    return html`
      <div class="item-group ${isRoot ? 'root-group' : 'child-group'}" data-key="${parent.key}">
        <div class="item-group-title">
          <p>
            ${parent.schema.title}${parent.required ? html`<span class="is-required">*</span>` : ''}
          </p>
          ${this.renderDeleteButton(parent, parentIndex, isArrayItem)}
        </div>
        <div class="item-group-children">
          ${(parent.data ?? []).map((item, index) => this.renderList(item, false, index + 1, this.isArrayType(parent)))}
          ${showAddButton ? this.renderAddItemButton(parent) : nothing}
        </div>
      </div>
    `;
  }

  render() {
    if (!this._data) return nothing;

    return html`
      <form>
        <div>
          ${this.renderList(this._data, true)}
        </div>
      </form>
    `;
  }
}

customElements.define('da-form-editor', FormEditor);
