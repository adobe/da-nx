import { LitElement, html, nothing } from 'da-lit';

const { default: getStyle } = await import('../../../utils/styles.js');
const style = await getStyle(import.meta.url);

const EL_NAME = 'nx-editor';
const DEBOUNCE_MS = 350;

function describeIssue(issue) {
  const feature = issue.feature ?? issue.compositionKeyword ?? 'unknown';
  const ref = issue.details?.ref;
  switch (issue.reason) {
    case 'unsupported-composition':
      return `uses unsupported composition keyword "${feature}"`;
    case 'unsupported-type':
      return `declares unsupported type "${feature}"`;
    case 'type-as-array':
      return 'declares "type" as an array';
    case 'missing-type':
      return 'is missing a "type" declaration';
    case 'external-ref':
      return `uses external $ref "${ref}" (only same-document refs are supported)`;
    case 'unresolved-ref':
      return `uses $ref "${ref}" which does not resolve in the document`;
    default:
      return `uses unsupported schema feature "${feature}"`;
  }
}

class Editor extends LitElement {
  static properties = {
    editor: { attribute: false },
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
    this._lastIssues = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  firstUpdated() {
    // Lazily register array UI sub-elements. Browsers upgrade existing tags
    // (`nx-array-menu`, `nx-reorder`) once the modules call customElements.define.
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

    this._maybeShowIssuesDialog();

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

  // Group containers (object fieldsets, array sections, structured array
  // items) claim selection for their own pointer on click/focusin and stop
  // propagation. Native bubbling ensures the innermost container wins, so
  // clicking a leaf input inside nested groups activates the closest group.
  _onGroupActivate(pointer, e) {
    e.stopPropagation();
    this._select(pointer);
  }

  _mutate(fn) {
    // State notification flows through editor's `onChange` callback wired in
    // the shell. UI just invokes the mutation.
    fn(this.editor);
  }

  _mutateDebounced(pointer, fn) {
    clearTimeout(this._inputTimers.get(pointer));
    this._inputTimers.set(pointer, setTimeout(() => {
      this._inputTimers.delete(pointer);
      this._mutate(fn);
    }, DEBOUNCE_MS));
  }

  _error(pointer) {
    return this.state?.validation?.errors?.[pointer]?.message ?? '';
  }

  _activeClass(pointer) {
    return pointer && this.nav?.pointer === pointer ? ' is-active' : '';
  }

  _primitiveValue(node) {
    if (!node) return '';
    if (node.value !== undefined) return node.value;
    if (node.kind === 'boolean') return false;
    // Defaults are materialized into the document at load by the SDK. The
    // renderer is a pure function of `node.value` — a missing value means the
    // field is empty, never that a default should be synthesized here.
    return '';
  }

  _onTextInput(node, e) {
    const raw = e.target.value;
    this._mutateDebounced(node.pointer, (editor) => {
      editor.setField(node.pointer, raw === '' ? undefined : raw);
    });
  }

  _onNumberInput(node, e) {
    const raw = e.target.value;
    const value = raw === '' ? undefined : Number(raw);
    this._mutateDebounced(node.pointer, (editor) => {
      editor.setField(node.pointer, Number.isNaN(value) ? undefined : value);
    });
  }

  _onBooleanInput(node, e) {
    this._mutate((editor) => editor.setField(node.pointer, !!e.target.checked));
  }

  _onSelectInput(node, e) {
    const raw = e.target.value;
    this._mutate((editor) => editor.setField(node.pointer, raw === '' ? undefined : raw));
  }

  _renderPrimitive(node, { hideLabel = false } = {}) {
    const required = !!node?.required;
    const readonly = !!node?.readonly;
    const pointer = node?.pointer ?? '';
    const error = this._error(pointer);
    const value = this._primitiveValue(node);
    const label = hideLabel ? '' : `${node?.label ?? ''}${required ? '*' : ''}`;

    if (Array.isArray(node.enumValues)) {
      const currentValue = value === '' || value === undefined || value === null ? '' : value;
      return html`
        <sl-select
          data-pointer=${pointer}
          .label=${label}
          .error=${error}
          .value=${currentValue}
          ?disabled=${readonly}
          @change=${(e) => this._onSelectInput(node, e)}
        >
          ${required
        ? html`<option value="" disabled ?selected=${currentValue === ''}>Please Select</option>`
        : html`<option value="" ?selected=${currentValue === ''}>None</option>`}
          ${node.enumValues.map((item) => html`
            <option value=${item} ?selected=${item === currentValue}>${item}</option>
          `)}
        </sl-select>
      `;
    }

    if (node.kind === 'boolean') {
      // sl-checkbox uses its default slot as the label.
      return html`
        <sl-checkbox
          data-pointer=${pointer}
          .error=${error}
          ?checked=${!!value}
          ?disabled=${readonly}
          @change=${(e) => this._onBooleanInput(node, e)}
        >${label}</sl-checkbox>
      `;
    }

    if (node.kind === 'number' || node.kind === 'integer') {
      return html`
        <sl-input
          data-pointer=${pointer}
          type="number"
          .label=${label}
          .error=${error}
          .value=${String(value ?? '')}
          ?disabled=${readonly}
          @input=${(e) => this._onNumberInput(node, e)}
        ></sl-input>
      `;
    }

    return html`
      <sl-input
        data-pointer=${pointer}
        type="text"
        .label=${label}
        .error=${error}
        .value=${value ?? ''}
        ?disabled=${readonly}
        @input=${(e) => this._onTextInput(node, e)}
      ></sl-input>
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
    this._mutate((editor) => editor.insertItem(pointer));
  }

  _onArrayRemove(e) {
    const pointer = e?.detail?.pointer ?? '';
    if (!pointer) return;
    this._mutate((editor) => editor.removeItem(pointer));
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
    this._mutate((editor) => editor.moveItem(arrayPointer, fromIndex, toIndex));
  }

  _renderObject(node, { itemLabel = '' } = {}) {
    const children = node.children ?? [];
    const activate = (e) => this._onGroupActivate(node.pointer, e);
    return html`
      <fieldset
        class="form-node${this._activeClass(node.pointer)}"
        data-pointer=${node.pointer}
        @click=${activate}
        @focusin=${activate}
      >
        <legend class="form-node-title">
          ${itemLabel ? html`<span class="form-item-label">${itemLabel}</span>` : nothing}
          ${node.label}${node.required ? html`<span class="is-required">*</span>` : nothing}
        </legend>
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

    const activate = (e) => this._onGroupActivate(node.pointer, e);
    return html`
      <section
        class="form-node${this._activeClass(node.pointer)}"
        data-pointer=${node.pointer}
        @click=${activate}
        @focusin=${activate}
        @array-menu-open=${this._onArrayMenuOpen}
        @array-reorder-start=${(e) => { e.stopPropagation(); this._onReorderStart(e, itemCount); }}
        @array-insert=${(e) => { e.stopPropagation(); this._onArrayInsert(e); }}
        @array-remove=${(e) => { e.stopPropagation(); this._onArrayRemove(e); }}
      >
        <div class="form-node-header">
          <p class="form-node-title">
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
      <nx-array-menu
        .pointer=${item.pointer}
        .index=${index}
        .pointers=${displayPointers}
        .readonly=${readonly}
        .itemCount=${itemCount}
        .minItems=${minItems}
        .maxItems=${maxItems}
        .active=${reorderActive}
      ></nx-array-menu>
    `;

      // For primitive items we deliberately do nothing so the click bubbles
      // up to the surrounding array section and activates the array.
      const itemActivate = (e) => {
        if (!structured) return;
        this._onGroupActivate(item.pointer, e);
      };
      return html`
            <article
              class="form-array-item${this._activeClass(item.pointer)}${structured ? '' : ' form-array-item-primitive'}${reorderActive ? ' move-item-picked' : ''}"
              data-pointer=${item.pointer}
              @click=${itemActivate}
              @focusin=${itemActivate}
            >
              ${structured ? html`
                <div class="form-array-item-header">
                  <p class="form-array-item-title">${title}</p>
                  <div class="form-array-item-actions">${menu}</div>
                </div>
                ${content}
              ` : html`
                <p class="form-array-item-simple-label">${title}</p>
                <div class="form-array-item-input-row">
                  <div class="form-array-item-input-main">
                    ${this._renderPrimitive(item, { hideLabel: true })}
                  </div>
                  <div class="form-array-item-actions">${menu}</div>
                </div>
              `}
              ${reorderActive ? html`
                <nx-reorder
                  .targetIndex=${this._reorderTargetIndex}
                  .totalItems=${itemCount}
                  @reorder-move-up=${() => this._setReorderTarget(this._reorderTargetIndex - 1, itemCount)}
                  @reorder-move-down=${() => this._setReorderTarget(this._reorderTargetIndex + 1, itemCount)}
                  @reorder-move-to-first=${() => this._setReorderTarget(0, itemCount)}
                  @reorder-move-to-last=${() => this._setReorderTarget(itemCount - 1, itemCount)}
                  @reorder-confirm=${() => this._confirmReorder(node.pointer, items)}
                  @reorder-cancel=${() => this._resetReorder()}
                ></nx-reorder>
              ` : nothing}
            </article>
          `;
    })}
        <div class="form-array-footer">
          <button
            type="button"
            class="add-item-btn"
            ?disabled=${!canAdd}
            @click=${() => this._mutate((editor) => editor.addItem(node.pointer))}
          >${addLabel}</button>
        </div>
      </section>
    `;
  }

  _renderNode(node, options = {}) {
    if (!node) return nothing;
    // Unsupported subtrees are skipped — the schema-issues dialog explains
    // what was dropped. The document value is preserved untouched.
    if (node.kind === 'unsupported') return nothing;
    if (node.kind === 'object') return this._renderObject(node, options);
    if (node.kind === 'array') return this._renderArray(node);
    return this._renderPrimitive(node);
  }

  _maybeShowIssuesDialog() {
    // schemaIssues is a closure-stable reference in createEngine (only changes
    // inside load), so reference equality is sufficient to detect a new set.
    const issues = this.state?.schemaIssues;
    if (issues === this._lastIssues) return;
    this._lastIssues = issues;
    if (!issues || issues.length === 0) return;
    const dialog = this.shadowRoot?.querySelector('dialog.schema-issues');
    if (dialog && !dialog.open) dialog.showModal();
  }

  _renderIssuesDialog() {
    const issues = this.state?.schemaIssues ?? [];
    if (issues.length === 0) return nothing;
    return html`
      <dialog class="schema-issues">
        <h2>Schema issues</h2>
        <p>The schema uses features the form does not support. Affected fields are not rendered. Their existing values remain in the saved document but cannot be edited here.</p>
        <ul>
          ${issues.map((issue) => html`
            <li>
              <code>${issue.pointer}</code> — ${describeIssue(issue)}
            </li>
          `)}
        </ul>
        <form method="dialog">
          <button type="submit">Dismiss</button>
        </form>
      </dialog>
    `;
  }

  render() {
    const root = this.state?.model?.root;
    return html`
      ${this._renderIssuesDialog()}
      ${root
        ? html`<div class="editor-root">${this._renderNode(root)}</div>`
        : html`<p class="hint">No editable fields found.</p>`}
    `;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, Editor);
}
