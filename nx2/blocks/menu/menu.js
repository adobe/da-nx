import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../utils/utils.js';
import '../shared/popover/popover.js';
import { loadHrefSvg } from '../../utils/svg.js';

const ICONS_BASE = new URL('../../img/icons/', import.meta.url).href;
const styles = await loadStyle(import.meta.url);

// todo: remove once changes from ew are available with reusable utils
export async function loadSvgIcons(names) {
  const svgs = await Promise.all(
    names.map((name) => loadHrefSvg(`${ICONS_BASE}S2_Icon_${name}_20_N.svg`)),
  );
  return Object.fromEntries(names.map((name, i) => [name, svgs[i]]));
}

class NxMenu extends LitElement {
  static properties = {
    items: { attribute: false },
    _active: { state: true },
    _icons: { state: true },
  };

  get _popover() { return this.shadowRoot.querySelector('nx-popover'); }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  firstUpdated() {
    this._wireTrigger(this.shadowRoot.querySelector('slot[name="trigger"]'));
  }

  updated(changed) {
    if (changed.has('items')) this._loadIcons();
  }

  async _loadIcons() {
    const names = this.items?.map((i) => i.icon).filter(Boolean) ?? [];
    if (!names.length) return;
    this._icons = await loadSvgIcons(names);
  }

  _wireTrigger(slot) {
    const [trigger] = slot.assignedElements();
    if (!trigger || trigger === this._trigger) return;
    this._trigger = trigger;
    this._popover.anchor = trigger;
    trigger.addEventListener('click', () => this._toggle(trigger));
  }

  _onTriggerSlotChange(e) {
    this._wireTrigger(e.target);
  }

  _onMenuToggle(e) {
    if (e.newState !== 'open') return;
    this._active = undefined;
    this._trigger?.toggleAttribute('data-active', true);
  }

  show({ anchor, placement } = {}) {
    this._active = undefined;
    this._popover.show({
      anchor,
      placement: placement ?? this.getAttribute('placement') ?? 'below',
    });
  }

  close() {
    this._popover.close();
  }

  get open() {
    return this._popover?.open ?? false;
  }

  _toggle(trigger) {
    if (this.open) {
      this.close();
      return;
    }
    trigger.toggleAttribute('data-active', true);
    this.show({ anchor: trigger });
  }

  _onClose() {
    this._trigger?.toggleAttribute('data-active', false);
  }

  _select(item) {
    this.close();
    this.dispatchEvent(new CustomEvent('select', { detail: { id: item.id }, bubbles: true, composed: true }));
  }

  _onKeydown(e) {
    const selectable = this.items?.filter((i) => !i.divider && !i.section) ?? [];
    if (!selectable.length) return;

    const curIdx = selectable.findIndex((i) => i.id === this._active);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this._active = selectable[(curIdx + 1) % selectable.length].id;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this._active = selectable[(curIdx - 1 + selectable.length) % selectable.length].id;
    } else if (e.key === 'Enter' && this._active !== undefined) {
      e.preventDefault();
      this._select(selectable.find((i) => i.id === this._active));
    }
  }

  _renderItem(item) {
    if (item.divider) return html`<hr class="menu-divider">`;
    if (item.section) return html`<span class="menu-section">${item.section}</span>`;
    if (!item.label || !item.id) return nothing;

    return html`
      <button
        class="menu-item ${item.id === this._active ? 'menu-item-active' : ''}"
        type="button"
        title=""
        aria-label=${item.label}
        @click=${() => this._select(item)}
        @mouseenter=${() => { this._active = item.id; }}
        @focus=${() => { this._active = item.id; }}
      >
        ${item.icon && this._icons?.[item.icon] ? html`<span class="menu-item-icon">${this._icons[item.icon].cloneNode(true)}</span>` : nothing}
        <span class="menu-item-label">${item.label}</span>
      </button>
    `;
  }

  render() {
    return html`
      <slot name="trigger" @slotchange=${this._onTriggerSlotChange}></slot>
      <nx-popover @toggle=${this._onMenuToggle} @keydown=${this._onKeydown} @close=${this._onClose}>
        ${this.items?.map((item) => this._renderItem(item))}
      </nx-popover>
    `;
  }
}

customElements.define('nx-menu', NxMenu);
