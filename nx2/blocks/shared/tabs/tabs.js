/**
 * `<nx-tabs>` — accessible tab navigation primitive.
 *
 * Properties:
 *   - `items` (Array<{ id: string, label: string }>): tab definitions. Setting
 *     this property triggers a render; mutating the array in place will NOT.
 *   - `active` (String, reflected): id of the active tab. Auto-defaults to
 *     `items[0].id` when missing OR when the current value is not present in
 *     the new `items` list.
 *   - `label` (String): value used as `aria-label` on the tablist. Defaults to
 *     `"Navigation tabs"` when unset; override for localised contexts.
 *
 * Events:
 *   - `tab-change` (bubbles, composed): fired on click or keyboard activation.
 *     Detail: `{ id: string }`. Not fired when the active tab is reactivated.
 *
 * Keyboard model (matches WAI-ARIA tablist pattern):
 *   - ArrowRight / ArrowLeft cycle through tabs with wrap.
 *   - Home / End jump to first / last tab.
 *   - Focus follows selection; disconnect-safe (focus call no-ops if removed).
 *
 * Shadow part: `tab`.
 */
import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';

const styles = await loadStyle(import.meta.url);

const DEFAULT_TABLIST_LABEL = 'Navigation tabs';

class NxTabs extends LitElement {
  static properties = {
    items: { attribute: false },
    active: { type: String, reflect: true },
    label: { type: String },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  updated(changed) {
    if (!changed.has('items') || !this.items?.length) return;
    const ids = this.items.map((i) => i.id);
    if (!ids.includes(this.active)) {
      [this.active] = ids;
    }
  }

  _select(id) {
    if (id === this.active) return;
    this.active = id;
    this.dispatchEvent(new CustomEvent('tab-change', {
      detail: { id },
      bubbles: true,
      composed: true,
    }));
  }

  _focusTab(id) {
    if (!this.isConnected || !this.shadowRoot) return;
    const [btn] = this.shadowRoot.querySelectorAll(`[data-id="${CSS.escape(id)}"]`);
    btn?.focus();
  }

  _onKeydown(e) {
    const ids = this.items?.map((i) => i.id) ?? [];
    if (!ids.length) return;
    const curIdx = ids.indexOf(this.active);

    let nextIdx;
    if (e.key === 'ArrowRight') {
      nextIdx = (curIdx + 1) % ids.length;
    } else if (e.key === 'ArrowLeft') {
      nextIdx = (curIdx <= 0 ? ids.length : curIdx) - 1;
    } else if (e.key === 'Home') {
      nextIdx = 0;
    } else if (e.key === 'End') {
      nextIdx = ids.length - 1;
    } else {
      return;
    }

    e.preventDefault();
    const nextId = ids[nextIdx];
    this._select(nextId);
    this.updateComplete.then(() => this._focusTab(nextId));
  }

  render() {
    if (!this.items?.length) return nothing;

    return html`
      <div
        class="tabs"
        role="tablist"
        aria-label=${this.label || DEFAULT_TABLIST_LABEL}
        @keydown=${this._onKeydown}
      >
        ${this.items.map((item) => html`
          <button
            role="tab"
            part="tab"
            type="button"
            class="tab ${item.id === this.active ? 'is-active' : ''}"
            data-id=${item.id}
            aria-selected=${item.id === this.active ? 'true' : 'false'}
            tabindex=${item.id === this.active ? '0' : '-1'}
            @click=${() => this._select(item.id)}
          >${item.label}</button>
        `)}
      </div>
    `;
  }
}

if (!customElements.get('nx-tabs')) customElements.define('nx-tabs', NxTabs);
