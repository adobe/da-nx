import { LitElement, html, nothing } from 'da-lit';
import getStyle from '../../../utils/styles.js';
import '../popover/popover.js';

const ICONS_BASE = new URL('../../../public/icons/', import.meta.url).href;
const styles = await getStyle(import.meta.url);

const loadHrefSvg = async (href) => {
  const resp = await fetch(href);
  if (!resp.ok) return null;
  const text = await resp.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'image/svg+xml');
  return doc.querySelector('svg');
};

async function loadSvgIcons(names) {
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
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.addEventListener('click', () => this._toggle(trigger));
  }

  _onTriggerSlotChange(e) {
    this._wireTrigger(e.target);
  }

  _onMenuToggle(e) {
    if (e.newState !== 'open') return;
    this._active = undefined;
    this._trigger?.toggleAttribute('data-active', true);
    this._trigger?.setAttribute('aria-expanded', 'true');
  }

  show({ anchor, placement } = {}) {
    this._active = undefined;
    this._popover?.show({
      anchor,
      placement: placement ?? this.getAttribute('placement') ?? 'below',
    });
  }

  close() {
    this._popover?.close();
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
    trigger.setAttribute('aria-expanded', 'true');
    this.show({ anchor: trigger });
  }

  _onClose() {
    this._trigger?.toggleAttribute('data-active', false);
    this._trigger?.setAttribute('aria-expanded', 'false');
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
      this.shadowRoot.querySelector(`[data-id="${this._active}"]`)?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this._active = selectable[(curIdx <= 0 ? selectable.length : curIdx) - 1].id;
      this.shadowRoot.querySelector(`[data-id="${this._active}"]`)?.focus();
    } else if (e.key === 'Enter' && this._active !== undefined) {
      e.preventDefault();
      this._select(selectable.find((i) => i.id === this._active));
    }
  }

  _renderItem(item) {
    if (item.divider) return html`<li role="separator"><hr class="menu-divider"></li>`;
    if (item.section) return html`<li role="presentation"><span class="menu-section">${item.section}</span></li>`;
    if (!item.label || !item.id) return nothing;

    return html`
      <li role="none">
        <button
          role="menuitem"
          data-id=${item.id}
          class="menu-item ${item.id === this._active ? 'menu-item-active' : ''}"
          type="button"
          @click=${() => this._select(item)}
          @mouseenter=${() => { this._active = item.id; }}
          @focus=${() => { this._active = item.id; }}
        >
          ${item.icon && this._icons?.[item.icon] ? html`<span class="menu-item-icon">${this._icons[item.icon].cloneNode(true)}</span>` : nothing}
          <span class="menu-item-label">${item.label}</span>
        </button>
      </li>
    `;
  }

  render() {
    return html`
      <slot name="trigger" @slotchange=${this._onTriggerSlotChange}></slot>
      <nx-popover @toggle=${this._onMenuToggle} @keydown=${this._onKeydown} @close=${this._onClose}>
        <ul role="menu">
          ${this.items?.map((item) => this._renderItem(item))}
        </ul>
      </nx-popover>
    `;
  }
}

customElements.define('nx-menu', NxMenu);
