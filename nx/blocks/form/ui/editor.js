import { LitElement, html, nothing } from 'da-lit';

const { default: getStyle } = await import('../../../utils/styles.js');
const style = await getStyle(import.meta.url);

const EL_NAME = 'sc-editor';
const DEBOUNCE_MS = 350;

class Editor extends LitElement {
  static properties = {
    core: { attribute: false },
    state: { attribute: false },
    nav: { attribute: false },
    onSelect: { attribute: false },
    _reorderPointer: { state: true },
    _reorderTargetIndex: { state: true },
    _reorderConfirmed: { state: true },
  };

  constructor() {
    super();
    this._reorderPointer = '';
    this._reorderTargetIndex = 0;
    this._reorderConfirmed = false;
    this._inputTimers = new Map();
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  firstUpdated() {
    // Lazily register array UI sub-elements. Browsers upgrade existing tags
    // (`sc-array-menu`, `sc-reorder`) once the modules call customElements.define.
    import('./array-menu.js');
    import('./reorder.js');
  }

  disconnectedCallback() {
    this._inputTimers.forEach((id) => clearTimeout(id));
    this._inputTimers.clear();
    super.disconnectedCallback();
  }

  updated(changed) {
    if (!changed.has('state') && !changed.has('nav')) return;

    if (this._reorderConfirmed) {
      this._resetReorder();
      return;
    }

    const prevNav = changed.get('nav');
    const prevSeq = prevNav?.seq ?? -1;
    const nextPointer = this.nav?.pointer;
    const nextOrigin = this.nav?.origin;
    const nextSeq = this.nav?.seq ?? 0;

    if (!nextPointer || nextSeq === prevSeq) return;
    if (nextOrigin !== 'sidebar') return;
    this._scrollTo(nextPointer);
  }

  _scrollTo(pointer) {
    const safe = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(pointer)
      : pointer.replace(/"/g, '\\"');
    const el = this.shadowRoot?.querySelector(`[data-pointer="${safe}"]`);
    el?.scrollIntoView({ block: 'start', behavior: 'auto' });
  }

  _select(pointer) {
    this.onSelect?.(pointer, 'editor');
  }

  _mutate(fn) {
    // State notification flows through core's `onChange` callback wired in
    // the shell. UI just invokes the mutation.
    fn(this.core);
  }

  _mutateDebounced(pointer, fn) {
    clearTimeout(this._inputTimers.get(pointer));
    this._inputTimers.set(pointer, setTimeout(() => {
      this._inputTimers.delete(pointer);
      this._mutate(fn);
    }, DEBOUNCE_MS));
  }

  _error(pointer) {
    return this.state?.validation?.errorsByPointer?.[pointer] ?? '';
  }

  _activeClass(pointer) {
    return this.nav?.pointer === pointer ? ' is-active' : '';
  }

  _primitiveValue(node) {
    if (!node) return '';
    if (node.value !== undefined) return node.value;
    if (node.kind === 'boolean') return false;
    // Defaults are materialized into the document at load (see core/index.js).
    // The renderer is a pure function of `node.value` — a missing value means
    // the field is empty, never that a default should be synthesized here.
    return '';
  }

  _onTextInput(node, e) {
    const raw = e.target.value;
    this._mutateDebounced(node.pointer, (core) => {
      core.setField(node.pointer, raw === '' ? undefined : raw);
    });
  }

  _onNumberInput(node, e) {
    const raw = e.target.value;
    const value = raw === '' ? undefined : Number(raw);
    this._mutateDebounced(node.pointer, (core) => {
      core.setField(node.pointer, Number.isNaN(value) ? undefined : value);
    });
  }

  _onBooleanInput(node, e) {
    this._mutate((core) => core.setField(node.pointer, !!e.target.checked));
  }

  _onSelectInput(node, e) {
    const raw = e.target.value;
    this._mutate((core) => core.setField(node.pointer, raw === '' ? undefined : raw));
  }

  _renderPrimitive(node, { hideLabel = false } = {}) {
    const label = node?.label ?? '';
    const required = !!node?.required;
    const readonly = !!node?.readonly;
    const pointer = node?.pointer ?? '';
    const error = this._error(pointer);
    const invalid = error ? 'true' : 'false';
    const value = this._primitiveValue(node);
    const labelText = `${label}${required ? '*' : ''}`;
    const fieldClass = `form-field${this._activeClass(pointer)}${hideLabel ? ' is-compact' : ''}`;

    if (Array.isArray(node.enumValues)) {
      const currentValue = value === '' || value === undefined || value === null ? '' : value;
      return html`
        <label class=${fieldClass} data-pointer=${pointer}>
          ${hideLabel ? nothing : html`${label}${required ? html`<span class="is-required">*</span>` : nothing}`}
          <select
            aria-label=${labelText}
            aria-invalid=${invalid}
            ?disabled=${readonly}
            @focus=${() => this._select(pointer)}
            @change=${(e) => this._onSelectInput(node, e)}
          >
            ${required
          ? html`<option value="" disabled ?selected=${currentValue === ''}>Please Select</option>`
          : html`<option value="" ?selected=${currentValue === ''}>None</option>`}
            ${node.enumValues.map((item) => html`
              <option value=${item} ?selected=${item === currentValue}>${item}</option>
            `)}
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
            aria-invalid=${invalid}
            ?disabled=${readonly}
            @focus=${() => this._select(pointer)}
            @change=${(e) => this._onBooleanInput(node, e)}
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
            aria-invalid=${invalid}
            ?disabled=${readonly}
            @focus=${() => this._select(pointer)}
            @input=${(e) => this._onNumberInput(node, e)}
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
          aria-invalid=${invalid}
          ?disabled=${readonly}
          @focus=${() => this._select(pointer)}
          @input=${(e) => this._onTextInput(node, e)}
        />
        ${error ? html`<p class="form-error">${error}</p>` : nothing}
      </label>
    `;
  }

  _addLabel(node) {
    const itemLabel = node?.itemLabel ?? '';
    return itemLabel ? `+ Add ${itemLabel}` : '+ Add item';
  }

  _resetReorder() {
    this._reorderPointer = '';
    this._reorderTargetIndex = 0;
    this._reorderConfirmed = false;
  }

  _setReorderTarget(index, itemCount) {
    const lastIndex = Math.max(itemCount - 1, 0);
    this._reorderTargetIndex = Math.max(0, Math.min(index, lastIndex));
  }

  _onArrayMenuOpen() {
    if (this._reorderPointer) this._resetReorder();
  }

  _onReorderStart(e, itemCount) {
    const pointer = e?.detail?.pointer ?? '';
    if (!pointer) return;
    this._reorderPointer = pointer;
    this._setReorderTarget(e?.detail?.index ?? 0, itemCount);
  }

  _onArrayInsert(e) {
    const pointer = e?.detail?.pointer ?? '';
    if (!pointer) return;
    this._mutate((core) => core.insertItem(pointer));
  }

  _onArrayRemove(e) {
    const pointer = e?.detail?.pointer ?? '';
    if (!pointer) return;
    this._mutate((core) => core.removeItem(pointer));
  }

  _itemsInPreviewOrder(items) {
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

  _confirmReorder(arrayPointer, items) {
    if (!this._reorderPointer) return;

    const fromIndex = items.findIndex((item) => item.pointer === this._reorderPointer);
    if (fromIndex < 0) {
      this._resetReorder();
      return;
    }

    const toIndex = this._reorderTargetIndex;
    if (toIndex === fromIndex) {
      this._resetReorder();
      return;
    }

    this._reorderConfirmed = true;
    this._mutate((core) => core.moveItem(arrayPointer, fromIndex, toIndex));
  }

  _renderUnsupported(node) {
    const u = node?.unsupported ?? {};
    const feature = u.feature ?? u.compositionKeyword ?? 'unknown';
    const reason = u.reason ?? 'unsupported-schema-feature';
    const t = u?.details?.type;
    const detail = Array.isArray(t) ? t.join(', ') : t;

    return html`
      <section class="form-node form-unsupported${this._activeClass(node.pointer)}" data-pointer=${node.pointer}>
        <p class="form-node-title" @click=${() => this._select(node.pointer)}>
          ${node.label}${node.required ? html`<span class="is-required">*</span>` : nothing}
        </p>
        <p class="form-unsupported-message">
          Unsupported schema definition: <strong>${feature}</strong>. This field cannot be displayed.
          ${reason === 'unsupported-type' && detail ? html`Type: <strong>${detail}</strong>.` : nothing}
        </p>
      </section>
    `;
  }

  _renderObject(node, { itemLabel = '' } = {}) {
    const children = node.children ?? [];
    const uc = node.unsupportedComposition;
    return html`
      <fieldset class="form-node${this._activeClass(node.pointer)}" data-pointer=${node.pointer}>
        <legend class="form-node-title" @click=${() => this._select(node.pointer)}>
          ${itemLabel ? html`<span class="form-item-label">${itemLabel}</span>` : nothing}
          ${node.label}${node.required ? html`<span class="is-required">*</span>` : nothing}
        </legend>
        ${uc ? html`<p class="form-unsupported-message">Unsupported schema definition: <strong>${uc.compositionKeyword}</strong>. Constraints from this definition will not be applied.</p>` : nothing}
        ${children.map((child) => this._renderNode(child))}
      </fieldset>
    `;
  }

  _renderArray(node) {
    const {
      items = [], readonly: nodeReadonly, minItems: nodeMin, maxItems,
    } = node ?? {};
    const itemCount = items.length;
    const displayItems = this._itemsInPreviewOrder(items);
    const displayPointers = displayItems.map((item) => item.pointer);
    const readonly = !!nodeReadonly;
    const minItems = nodeMin ?? 0;
    const canAdd = !readonly && (maxItems === undefined || itemCount < maxItems);
    const addLabel = this._addLabel(node);

    return html`
      <section
        class="form-node${this._activeClass(node.pointer)}"
        data-pointer=${node.pointer}
        @array-menu-open=${this._onArrayMenuOpen}
        @array-reorder-start=${(e) => { e.stopPropagation(); this._onReorderStart(e, itemCount); }}
        @array-insert=${(e) => { e.stopPropagation(); this._onArrayInsert(e); }}
        @array-remove=${(e) => { e.stopPropagation(); this._onArrayRemove(e); }}
      >
        <div class="form-node-header">
          <p class="form-node-title" @click=${() => this._select(node.pointer)}>
            ${node.label}${node.required ? html`<span class="is-required">*</span>` : nothing}
          </p>
        </div>

        ${displayItems.map((item, index) => {
      const structured = item.kind === 'object' || item.kind === 'array';
      const reorderActive = this._reorderPointer === item.pointer && !this._reorderConfirmed;
      const title = `#${index + 1} ${item.label ?? node.itemLabel ?? 'Item'}`;
      const content = item.kind === 'object'
        ? (item.children ?? []).map((c) => this._renderNode(c))
        : this._renderNode(item, { itemLabel: `#${index + 1}` });
      const menu = html`
      <sc-array-menu
        .pointer=${item.pointer}
        .index=${index}
        .pointers=${displayPointers}
        .readonly=${readonly}
        .itemCount=${itemCount}
        .minItems=${minItems}
        .maxItems=${maxItems}
        .active=${reorderActive}
      ></sc-array-menu>
    `;

      return html`
            <article class="form-array-item${this._activeClass(item.pointer)}${structured ? '' : ' form-array-item-primitive'}${reorderActive ? ' move-item-picked' : ''}" data-pointer=${item.pointer}>
              ${structured ? html`
                <div class="form-array-item-header">
                  <p class="form-array-item-title" @click=${() => this._select(item.pointer)}>
                    ${title}
                  </p>
                  <div class="form-array-item-actions">${menu}</div>
                </div>
                ${content}
              ` : html`
                <p class="form-array-item-simple-label" @click=${() => this._select(item.pointer)}>
                  ${title}
                </p>
                <div class="form-array-item-input-row">
                  <div class="form-array-item-input-main">
                    ${this._renderPrimitive(item, { hideLabel: true })}
                  </div>
                  <div class="form-array-item-actions">${menu}</div>
                </div>
              `}
              ${reorderActive ? html`
                <sc-reorder
                  .targetIndex=${this._reorderTargetIndex}
                  .totalItems=${itemCount}
                  @reorder-move-up=${() => this._setReorderTarget(this._reorderTargetIndex - 1, itemCount)}
                  @reorder-move-down=${() => this._setReorderTarget(this._reorderTargetIndex + 1, itemCount)}
                  @reorder-move-to-first=${() => this._setReorderTarget(0, itemCount)}
                  @reorder-move-to-last=${() => this._setReorderTarget(itemCount - 1, itemCount)}
                  @reorder-confirm=${() => this._confirmReorder(node.pointer, items)}
                  @reorder-cancel=${() => this._resetReorder()}
                ></sc-reorder>
              ` : nothing}
            </article>
          `;
    })}
        <div class="form-array-footer">
          <button
            type="button"
            class="add-item-btn"
            ?disabled=${!canAdd}
            @click=${() => this._mutate((core) => core.addItem(node.pointer))}
          >${addLabel}</button>
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
    const root = this.state?.model?.root;
    if (!root) return html`<p class="hint">No editable fields found.</p>`;
    return html`<div class="editor-root">${this._renderNode(root)}</div>`;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, Editor);
}
