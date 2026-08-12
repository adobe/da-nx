import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';
import { getConfig } from '../../../scripts/nx.js';
import { pillIconName } from '../utils/icons.js';

const styles = await loadStyle(import.meta.url);
const { codeBase } = getConfig();

class NxPills extends LitElement {
  static properties = {
    items: { type: Array },
    addEvent: { type: String },
  };

  _keyedItemIds = new Map();

  get _list() {
    return this.items ?? [];
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    this._selfManaged = !!this.addEvent && this.items === undefined;
    if (this._selfManaged) document.addEventListener(this.addEvent, this._onAdd);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._selfManaged) {
      document.removeEventListener(this.addEvent, this._onAdd);
      this._revoke(this._list);
    }
  }

  _revoke(items) {
    items.forEach((item) => { if (item.thumbnail) URL.revokeObjectURL(item.thumbnail); });
  }

  _onAdd = ({ detail }) => {
    const { key, ...item } = detail;
    if (key === undefined) {
      this.add(item);
      return;
    }
    const without = this._list.filter((i) => i.id !== this._keyedItemIds.get(key));
    const matchesPinned = item.id
      && typeof item.selFrom === 'number'
      && typeof item.selTo === 'number'
      && without.some((i) => i.pinned && i.selFrom === item.selFrom && i.selTo === item.selTo);
    if (matchesPinned || !item.id) {
      this._keyedItemIds.delete(key);
      this.items = without;
      return;
    }
    this._keyedItemIds.set(key, item.id);
    this.items = [...without, item];
  };

  // Self-managed mode only — a direct push (e.g. a file attachment) outside the
  // addEvent flow.
  add(item) {
    if (this._list.some((i) => i.id === item.id)) return;
    this.items = [...this._list, item];
  }

  clear() {
    this._revoke(this._list);
    this.items = [];
    this._keyedItemIds = new Map();
  }

  _remove(id) {
    if (!this._selfManaged) {
      this.dispatchEvent(new CustomEvent('nx-pill-remove', { detail: { id } }));
      return;
    }
    const removed = this._list.find((i) => i.id === id);
    if (removed?.thumbnail) URL.revokeObjectURL(removed.thumbnail);
    for (const [key, mappedId] of this._keyedItemIds) {
      if (mappedId === id) this._keyedItemIds.delete(key);
    }
    this.items = this._list.filter((item) => item.id !== id);
  }

  _pin(id) {
    if (!this._selfManaged) {
      this.dispatchEvent(new CustomEvent('nx-pill-pin', { detail: { id } }));
      return;
    }
    const target = this._list.find((i) => i.id === id);
    if (!target || !target.pinnable || target.pinned) return;
    for (const [key, mappedId] of this._keyedItemIds) {
      if (mappedId === id) this._keyedItemIds.delete(key);
    }
    const pinnedId = `pinned-${crypto.randomUUID()}`;
    this.items = this._list.map((item) => (
      item.id === id ? { ...item, id: pinnedId, pinned: true } : item
    ));
  }

  _activate(id) {
    const item = this._list.find((i) => i.id === id);
    if (!item) return;
    const { selFrom, selTo, selectionType, blockName, proseIndex } = item;
    if (typeof selFrom !== 'number' || typeof selTo !== 'number') return;
    this.dispatchEvent(new CustomEvent('nx-pill-activate', {
      bubbles: true,
      composed: true,
      detail: {
        id, selFrom, selTo, selectionType, blockName, proseIndex,
      },
    }));
  }

  _pillTypeIcon(type, label, thumbnail) {
    if (thumbnail) return html`<img class="pill-thumbnail" src=${thumbnail} alt="" aria-hidden="true">`;
    const iconName = pillIconName(type, label);
    return html`<svg class="pill-type-icon" viewBox="0 0 20 20" aria-hidden="true"><use href="${codeBase}/img/icons/${iconName}.svg#icon"></use></svg>`;
  }

  _renderPill({
    id, label, thumbnail, type, pinnable, pinned,
  }) {
    const showPin = pinnable && !pinned;
    const action = showPin
      ? html`<button
          class="pill-icon pill-pin"
          type="button"
          aria-label="Pin ${label}"
          @click=${() => this._pin(id)}
        ><svg viewBox="0 0 20 20" aria-hidden="true"><use href="${codeBase}/img/icons/s2-icon-pinon-20-n.svg#icon"></use></svg></button>`
      : html`<button
          class="pill-icon"
          type="button"
          aria-label="Remove ${label}"
          @click=${() => this._remove(id)}
        ><svg viewBox="0 0 20 20" aria-hidden="true"><use href="${codeBase}/img/icons/s2-icon-close-20-n.svg#icon"></use></svg></button>`;
    const labelEl = pinnable
      ? html`<button
          class="pill-label pill-label-button"
          type="button"
          title=${label}
          @click=${() => this._activate(id)}
        >${label}</button>`
      : html`<span class="pill-label" title=${label}>${label}</span>`;
    const showTypeIcon = type === 'image' || type === 'file' || type === 'folder' || type === 'block' || type === 'text';
    return html`
      <li class="pill">
        ${action}
        ${showTypeIcon ? this._pillTypeIcon(type, label, thumbnail) : nothing}
        ${labelEl}
      </li>
    `;
  }

  render() {
    if (!this._list.length) return nothing;
    return html`
      <ul class="pills-container" aria-label="Attached items" aria-live="polite">
        ${this._list.map((item) => this._renderPill(item))}
      </ul>
    `;
  }
}

if (!customElements.get('nx-pills')) customElements.define('nx-pills', NxPills);
