import { LitElement, html, nothing } from 'da-lit';

const { default: getStyle } = await import('../../../utils/styles.js');

const { resolvePropSchema } = await import('../utils/utils.js');

import './components/remove-button/remove-button.js';

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
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this.debouncedHandleChange = debounce(this.handleChange.bind(this), 1000);
  }

  update(props) {
    if (props.has('formModel') && this.formModel) {
      this.getData();
    }
    super.update(props);
  }

  getData() {
    this._data = this.formModel.annotated;
  }

  handleChange({ target }) {
    const { name, value } = target;
    const opts = { detail: { name, value }, bubbles: true, composed: true };
    const event = new CustomEvent('update', opts);
    this.dispatchEvent(event);
  }

  handleInput({ target }) {
    this.debouncedHandleChange({ target });
  }

  handleConfirmRemove(e) {
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent('confirm-remove', {
      detail: { path: e.detail.path },
      bubbles: true,
      composed: true,
    }));
  }

  handleAddItem(parent) {
    const { path, schema } = parent;
    const itemsSchema = schema?.properties?.items;
    const opts = { detail: { path, itemsSchema }, bubbles: true, composed: true };
    this.dispatchEvent(new CustomEvent('add-item', opts));
  }

  renderCheckbox(item) {
    return html`
        <input type="checkbox" name="${item.key}" value="${item.data}" ?checked=${item.data}>
        <label class="primitive-item-title">${item.schema.title}</label>
    `;
  }

  renderSelect(item) {
    return html`
      <p class="primitive-item-title">${item.schema.title}</p>
      <sl-select name="${item.path}" value="${item.data}" @change=${this.handleChange}>
        ${item.schema.properties.enum.map((val) => html`<option>${val}</option>`)}
      </sl-select>
    `;
  }

  renderInput(item, inputType = 'text') {
    return html`
      <p class="primitive-item-title">${item.schema.title}${item.required ? html`<span class="is-required">*</span>` : ''}</p>
      <sl-input type="${inputType}" name="${item.path}" value="${item.data}" @input=${this.handleInput}></sl-input>
    `;
  }

  getPrimitiveType(item) {
    if (item.schema.properties.enum) return 'select';
    const type = item.schema.properties.type;
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
        .path=${item.path}
        .index=${index}
        @confirm-remove=${this.handleConfirmRemove}
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
    const schema = parent.schema;
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
          ${(parent.data ?? []).map((item, index) =>
      this.renderList(item, false, index + 1, this.isArrayType(parent))
    )}
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
