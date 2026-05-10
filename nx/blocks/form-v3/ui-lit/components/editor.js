import { LitElement, html, nothing } from 'da-lit';

await import('./array-item-menu.js');
await import('./reorder-dialog.js');

const { default: getStyle } = await import('../../../../utils/styles.js');
const style = await getStyle(import.meta.url);

const EL_NAME = 'sc-form-editor';

class StructuredContentFormEditor extends LitElement {
  static properties = {
    context: { attribute: false },
    _reorderPointer: { state: true },
    _reorderTargetIndex: { state: true },
  };

  constructor() {
    super();
    this._reorderPointer = '';
    this._reorderTargetIndex = 0;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  updated(changed) {
    if (!changed.has('context')) return;

    const prevContext = changed.get('context');
    const prevSequence = prevContext?.activeNavSequence ?? -1;
    const nextPointer = this.context?.activeNavPointer;
    const nextOrigin = this.context?.activeNavOrigin;
    const nextSequence = this.context?.activeNavSequence ?? 0;

    if (!nextPointer || nextSequence === prevSequence) return;
    if (nextOrigin !== 'sidebar') return;
    this._scrollToPointer(nextPointer, { block: 'start' });
  }

  _scrollToPointer(pointer, { block = 'start', behavior = 'auto' } = {}) {
    const safePointer = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(pointer)
      : pointer.replace(/"/g, '\\"');

    const el = this.shadowRoot?.querySelector(`[data-pointer="${safePointer}"]`);
    if (!el) return;
    el.scrollIntoView({ block, behavior });
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

  _renderPrimitive(node, { hideLabel = false } = {}) {
    const label = node?.label ?? '';
    const required = !!node?.required;
    const readonly = !!node?.readonly;
    const pointer = node?.pointer ?? '';
    const error = this._getError(pointer);
    const value = this._primitiveValue(node);
    const labelText = `${label}${required ? '*' : ''}`;
    const fieldClass = `form-field${this._activeClass(pointer)}${hideLabel ? ' is-compact' : ''}`;

    if (Array.isArray(node.enumValues)) {
      return html`
        <label class=${fieldClass} data-pointer=${pointer}>
          ${hideLabel ? nothing : html`${label}${required ? html`<span class="is-required">*</span>` : nothing}`}
          <select
            .value=${value ?? ''}
            aria-label=${labelText}
            ?disabled=${readonly}
            @focus=${() => this._selectPointer(pointer)}
            @change=${(e) => this._handleSelectInput(node, e)}
          >
            ${required ? html`<option value="" disabled>Please Select</option>` : html`<option value="">None</option>`}
            ${node.enumValues.map((item) => html`<option value=${item}>${item}</option>`)}
          </select>
          ${error ? html`<p class="form-error">${error}</p>` : nothing}
        </label>
      `;
    }

    if (node.kind === 'boolean') {
      return html`
        <label class="form-field form-field-checkbox${this._activeClass(pointer)}${hideLabel ? ' is-compact' : ''}" data-pointer=${pointer}>
          <input
            type="checkbox"
            .checked=${!!value}
            aria-label=${labelText}
            ?disabled=${readonly}
            @focus=${() => this._selectPointer(pointer)}
            @change=${(e) => this._handleBooleanInput(node, e)}
          />
          ${hideLabel
          ? html`<span class="form-sr-only">${label}${required ? '*' : ''}</span>`
          : html`${label}${required ? html`<span class="is-required">*</span>` : nothing}`}
          ${error ? html`<p class="form-error">${error}</p>` : nothing}
        </label>
      `;
    }

    if (node.kind === 'number' || node.kind === 'integer') {
      return html`
        <label class=${fieldClass} data-pointer=${pointer}>
          ${hideLabel ? nothing : html`${label}${required ? html`<span class="is-required">*</span>` : nothing}`}
          <input
            type="number"
            .value=${String(value ?? '')}
            aria-label=${labelText}
            ?disabled=${readonly}
            @focus=${() => this._selectPointer(pointer)}
            @input=${(e) => this._handleNumberInput(node, e)}
          />
          ${error ? html`<p class="form-error">${error}</p>` : nothing}
        </label>
      `;
    }

    return html`
      <label class=${fieldClass} data-pointer=${pointer}>
        ${hideLabel ? nothing : html`${label}${required ? html`<span class="is-required">*</span>` : nothing}`}
        <input
          type="text"
          .value=${value ?? ''}
          aria-label=${labelText}
          ?disabled=${readonly}
          @focus=${() => this._selectPointer(pointer)}
          @input=${(e) => this._handleTextInput(node, e)}
        />
        ${error ? html`<p class="form-error">${error}</p>` : nothing}
      </label>
    `;
  }

  _getAddItemLabel(node) {
    const itemLabel = node?.itemLabel ?? '';
    return itemLabel ? `+ Add ${itemLabel}` : '+ Add item';
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

  _onReorderStart(e, itemCount) {
    const pointer = e?.detail?.pointer ?? '';
    if (!pointer) return;

    this._reorderPointer = pointer;
    this._setReorderTarget(e?.detail?.index ?? 0, itemCount);
  }

  _handleArrayIntent(e, itemCount) {
    const detail = e?.detail;
    if (detail?.type !== 'form-array-reorder-start') return;
    e.stopPropagation();
    this._onReorderStart(e, itemCount);
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

  _renderUnsupported(node) {
    const unsupported = node?.unsupported ?? {};
    const feature = unsupported.feature ?? unsupported.compositionKeyword ?? unsupported.combinator ?? 'unknown';
    const reason = unsupported.reason ?? 'unsupported-schema-feature';
    const unsupportedType = unsupported?.details?.type;
    const detail = Array.isArray(unsupportedType)
      ? unsupportedType.join(', ')
      : unsupportedType;

    return html`
      <section class="form-node form-unsupported${this._activeClass(node.pointer)}" data-pointer=${node.pointer}>
        <p class="form-node-title" @click=${() => this._selectPointer(node.pointer)}>
          ${node.label}${node.required ? html`<span class="is-required">*</span>` : nothing}
        </p>
        <p class="form-unsupported-message">
          Unsupported schema feature: <strong>${feature}</strong>.
          ${reason === 'unsupported-type' && detail ? html`Type: <strong>${detail}</strong>.` : nothing}
        </p>
      </section>
    `;
  }

  _renderObject(node, { itemLabel = '' } = {}) {
    const children = node.children ?? [];
    return html`
      <fieldset class="form-node${this._activeClass(node.pointer)}" data-pointer=${node.pointer}>
        <legend class="form-node-title" @click=${() => this._selectPointer(node.pointer)}>
          ${itemLabel ? html`<span class="form-item-label">${itemLabel}</span>` : nothing}
          ${node.label}${node.required ? html`<span class="is-required">*</span>` : nothing}
        </legend>
        ${children.map((child) => this._renderNode(child))}
      </fieldset>
    `;
  }

  _renderArray(node) {
    const {
      items = [],
      readonly: nodeReadonly,
      minItems: nodeMinItems,
      maxItems,
    } = node ?? {};
    const pointers = items.map((item) => item.pointer);
    const itemCount = items.length;
    const displayItems = this._getItemsInPreviewOrder(items);
    const displayPointers = displayItems.map((item) => item.pointer);
    const readonly = !!nodeReadonly;
    const minItems = nodeMinItems ?? 0;
    const canAdd = !readonly && (maxItems === undefined || itemCount < maxItems);
    const addItemLabel = this._getAddItemLabel(node);

    return html`
      <section
        class="form-node${this._activeClass(node.pointer)}"
        data-pointer=${node.pointer}
        @form-array-menu-open=${this._onMenuOpen}
        @form-intent=${(e) => this._handleArrayIntent(e, itemCount)}
      >
        <div class="form-node-header">
          <p class="form-node-title" @click=${() => this._selectPointer(node.pointer)}>
            ${node.label}${node.required ? html`<span class="is-required">*</span>` : nothing}
          </p>
        </div>

        ${displayItems.map((item, index) => {
      const isStructuredItem = item.kind === 'object' || item.kind === 'array';
      const isReorderActive = this._reorderPointer === item.pointer;
      const itemTitle = `#${index + 1} ${item.label ?? node.itemLabel ?? 'Item'}`;
      const itemContent = item.kind === 'object'
        ? (item.children ?? []).map((child) => this._renderNode(child))
        : this._renderNode(item, { itemLabel: `#${index + 1}` });
      const itemMenu = html`
      <sc-array-item-menu
        .pointer=${item.pointer}
        .index=${index}
        .pointers=${displayPointers}
        .readonly=${readonly}
        .itemCount=${itemCount}
        .minItems=${minItems}
        .maxItems=${maxItems}
        .active=${isReorderActive}
      ></sc-array-item-menu>
    `;

      return html`
            <article class="form-array-item${this._activeClass(item.pointer)}${isStructuredItem ? '' : ' form-array-item-primitive'}${isReorderActive ? ' move-item-picked' : ''}" data-pointer=${item.pointer}>
              ${isStructuredItem ? html`
                <div class="form-array-item-header">
                  <p class="form-array-item-title" @click=${() => this._selectPointer(item.pointer)}>
                    ${itemTitle}
                  </p>
                  <div class="form-array-item-actions">
                    ${itemMenu}
                  </div>
                </div>
                ${itemContent}
              ` : html`
                <p class="form-array-item-simple-label" @click=${() => this._selectPointer(item.pointer)}>
                  ${itemTitle}
                </p>
                <div class="form-array-item-input-row">
                  <div class="form-array-item-input-main">
                    ${this._renderPrimitive(item, { hideLabel: true })}
                  </div>
                  <div class="form-array-item-actions">
                    ${itemMenu}
                  </div>
                </div>
              `}
              ${isReorderActive ? html`
                <sc-reorder-dialog
                  .targetIndex=${this._reorderTargetIndex}
                  .totalItems=${itemCount}
                  @reorder-move-up=${() => this._setReorderTarget(this._reorderTargetIndex - 1, itemCount)}
                  @reorder-move-down=${() => this._setReorderTarget(this._reorderTargetIndex + 1, itemCount)}
                  @reorder-move-to-first=${() => this._setReorderTarget(0, itemCount)}
                  @reorder-move-to-last=${() => this._setReorderTarget(itemCount - 1, itemCount)}
                  @reorder-confirm=${() => this._confirmReorder(items, pointers)}
                  @reorder-cancel=${() => this._resetReorder()}
                ></sc-reorder-dialog>
              ` : nothing}
            </article>
          `;
    })}
        <div class="form-array-footer">
          <button
            type="button"
            class="add-item-btn"
            ?disabled=${!canAdd}
            @click=${() => this._emitIntent({ type: 'form-array-add', pointer: node.pointer })}
          >${addItemLabel}</button>
        </div>
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
  customElements.define(EL_NAME, StructuredContentFormEditor);
}
