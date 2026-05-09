import { LitElement, html, nothing } from 'da-lit';

const { default: getStyle } = await import('../../../../utils/styles.js');
const style = await getStyle(import.meta.url);

const EL_NAME = 'da-sc-form-editor';

class StructuredContentFormV3Editor extends LitElement {
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
    if (nextOrigin === 'editor') return;
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

  _emitIntent(detail) {
    this.dispatchEvent(new CustomEvent('form-intent', {
      detail,
      bubbles: true,
      composed: true,
    }));
  }

  _selectPointer(pointer) {
    this._emitIntent({
      type: 'form-nav-pointer-select',
      pointer,
      origin: 'editor',
    });
  }

  _errorsByPointer() {
    return this.context?.validation?.errorsByPointer ?? new Map();
  }

  _getError(pointer) {
    return this._errorsByPointer().get(pointer) ?? '';
  }

  _primitiveValue(node) {
    if (!node) return '';
    if (node.sourceValue !== undefined) return node.sourceValue;
    if (node.kind === 'boolean') return false;
    if (node.defaultValue !== undefined) return node.defaultValue;
    return '';
  }

  _activeClass(pointer) {
    return this.context?.activeNavPointer === pointer ? ' is-active' : '';
  }

  _handleTextInput(node, event) {
    this._emitIntent({
      type: 'form-field-change',
      pointer: node.pointer,
      value: event.target.value === '' ? undefined : event.target.value,
      debounceMs: 350,
    });
  }

  _handleNumberInput(node, event) {
    const raw = event.target.value;
    const value = raw === '' ? undefined : Number(raw);
    this._emitIntent({
      type: 'form-field-change',
      pointer: node.pointer,
      value: Number.isNaN(value) ? undefined : value,
      debounceMs: 350,
    });
  }

  _handleBooleanInput(node, event) {
    this._emitIntent({
      type: 'form-field-change',
      pointer: node.pointer,
      value: !!event.target.checked,
    });
  }

  _handleSelectInput(node, event) {
    const raw = event.target.value;
    this._emitIntent({
      type: 'form-field-change',
      pointer: node.pointer,
      value: raw === '' ? undefined : raw,
    });
  }

  _renderPrimitive(node) {
    const label = node?.label ?? '';
    const required = !!node?.required;
    const readonly = !!node?.readonly;
    const pointer = node?.pointer ?? '';
    const error = this._getError(pointer);
    const value = this._primitiveValue(node);

    if (Array.isArray(node.enumValues)) {
      return html`
        <label class="v3-field${this._activeClass(pointer)}" data-pointer=${pointer}>
          ${label}${required ? html`<span class="is-required">*</span>` : nothing}
          <select
            .value=${value ?? ''}
            ?disabled=${readonly}
            @focus=${() => this._selectPointer(pointer)}
            @change=${(e) => this._handleSelectInput(node, e)}
          >
            ${required ? html`<option value="" disabled>Please Select</option>` : html`<option value="">None</option>`}
            ${node.enumValues.map((item) => html`<option value=${item}>${item}</option>`)}
          </select>
          ${error ? html`<p class="v3-error">${error}</p>` : nothing}
        </label>
      `;
    }

    if (node.kind === 'boolean') {
      return html`
        <label class="v3-field v3-field-checkbox${this._activeClass(pointer)}" data-pointer=${pointer}>
          <input
            type="checkbox"
            .checked=${!!value}
            ?disabled=${readonly}
            @focus=${() => this._selectPointer(pointer)}
            @change=${(e) => this._handleBooleanInput(node, e)}
          />
          ${label}${required ? html`<span class="is-required">*</span>` : nothing}
          ${error ? html`<p class="v3-error">${error}</p>` : nothing}
        </label>
      `;
    }

    if (node.kind === 'number' || node.kind === 'integer') {
      return html`
        <label class="v3-field${this._activeClass(pointer)}" data-pointer=${pointer}>
          ${label}${required ? html`<span class="is-required">*</span>` : nothing}
          <input
            type="number"
            .value=${String(value ?? '')}
            ?disabled=${readonly}
            @focus=${() => this._selectPointer(pointer)}
            @input=${(e) => this._handleNumberInput(node, e)}
          />
          ${error ? html`<p class="v3-error">${error}</p>` : nothing}
        </label>
      `;
    }

    return html`
      <label class="v3-field${this._activeClass(pointer)}" data-pointer=${pointer}>
        ${label}${required ? html`<span class="is-required">*</span>` : nothing}
        <input
          type="text"
          .value=${value ?? ''}
          ?disabled=${readonly}
          @focus=${() => this._selectPointer(pointer)}
          @input=${(e) => this._handleTextInput(node, e)}
        />
        ${error ? html`<p class="v3-error">${error}</p>` : nothing}
      </label>
    `;
  }

  _moveUpBeforePointer(pointers, index) {
    if (index <= 0) return undefined;
    return pointers[index - 1];
  }

  _moveDownBeforePointer(pointers, index) {
    if (index >= pointers.length - 1) return undefined;
    const beforeIndex = index + 2;
    if (beforeIndex >= pointers.length) return undefined;
    return pointers[beforeIndex];
  }

  _renderUnsupported(node) {
    const unsupported = node?.unsupported ?? {};
    const combinator = unsupported.combinator ?? 'unknown';
    return html`
      <section class="v3-node v3-unsupported${this._activeClass(node.pointer)}" data-pointer=${node.pointer}>
        <p class="v3-node-title" @click=${() => this._selectPointer(node.pointer)}>
          ${node.label}${node.required ? html`<span class="is-required">*</span>` : nothing}
        </p>
        <p class="v3-unsupported-message">
          Unsupported schema combinator: <strong>${combinator}</strong>.
        </p>
      </section>
    `;
  }

  _renderObject(node, { itemLabel = '' } = {}) {
    const children = node.children ?? [];
    return html`
      <fieldset class="v3-node${this._activeClass(node.pointer)}" data-pointer=${node.pointer}>
        <legend class="v3-node-title" @click=${() => this._selectPointer(node.pointer)}>
          ${itemLabel ? html`<span class="v3-item-label">${itemLabel}</span>` : nothing}
          ${node.label}${node.required ? html`<span class="is-required">*</span>` : nothing}
        </legend>
        ${children.map((child) => this._renderNode(child))}
      </fieldset>
    `;
  }

  _renderArray(node) {
    const items = node.items ?? [];
    const pointers = items.map((item) => item.pointer);
    const readonly = !!node.readonly;
    const minItems = node.minItems ?? 0;
    const maxItems = node.maxItems;
    const canAdd = !readonly && (maxItems === undefined || items.length < maxItems);

    return html`
      <section class="v3-node${this._activeClass(node.pointer)}" data-pointer=${node.pointer}>
        <div class="v3-node-header">
          <p class="v3-node-title" @click=${() => this._selectPointer(node.pointer)}>
            ${node.label}${node.required ? html`<span class="is-required">*</span>` : nothing}
          </p>
          <button
            type="button"
            class="v3-action"
            ?disabled=${!canAdd}
            @click=${() => this._emitIntent({ type: 'form-array-add', pointer: node.pointer })}
          >+ Add</button>
        </div>

        ${items.map((item, index) => {
    const canRemove = !readonly && items.length > minItems;
    const canMoveUp = !readonly && index > 0;
    const canMoveDown = !readonly && index < items.length - 1;

    return html`
            <article class="v3-array-item${this._activeClass(item.pointer)}" data-pointer=${item.pointer}>
              <div class="v3-array-item-header">
                <p class="v3-array-item-title" @click=${() => this._selectPointer(item.pointer)}>
                  #${index + 1} ${item.label ?? node.itemLabel ?? 'Item'}
                </p>
                <div class="v3-array-item-actions">
                  <button
                    type="button"
                    class="v3-action"
                    ?disabled=${readonly || !item.pointer}
                    @click=${() => this._emitIntent({ type: 'form-array-insert', pointer: item.pointer })}
                  >Insert</button>
                  <button
                    type="button"
                    class="v3-action"
                    ?disabled=${!canMoveUp}
                    @click=${() => this._emitIntent({
      type: 'form-array-reorder',
      pointer: item.pointer,
      beforePointer: this._moveUpBeforePointer(pointers, index),
    })}
                  >Up</button>
                  <button
                    type="button"
                    class="v3-action"
                    ?disabled=${!canMoveDown}
                    @click=${() => this._emitIntent({
      type: 'form-array-reorder',
      pointer: item.pointer,
      beforePointer: this._moveDownBeforePointer(pointers, index),
    })}
                  >Down</button>
                  <button
                    type="button"
                    class="v3-action danger"
                    ?disabled=${!canRemove}
                    @click=${() => this._emitIntent({ type: 'form-array-remove', pointer: item.pointer })}
                  >Remove</button>
                </div>
              </div>
              ${this._renderNode(item, { itemLabel: `#${index + 1}` })}
            </article>
          `;
  })}
      </section>
    `;
  }

  _renderNode(node, options = {}) {
    if (!node) return nothing;
    if (node.kind === 'unsupported') return this._renderUnsupported(node);
    if (node.kind === 'object') return this._renderObject(node, options);
    if (node.kind === 'array') return this._renderArray(node);
    return this._renderPrimitive(node);
  }

  render() {
    const root = this.context?.runtime?.root;
    if (!root) return html`<p class="hint">No editable fields found.</p>`;

    return html`
      <div class="editor-root">
        ${this._renderNode(root)}
      </div>
    `;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, StructuredContentFormV3Editor);
}
