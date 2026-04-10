import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../utils/utils.js';
import '../shared/popover/popover.js';
import { loadHrefSvg } from '../../utils/svg.js';
import { getConfig } from '../../scripts/nx.js';

const styles = await loadStyle(import.meta.url);

// todo: remove once changes from ew are available with reusable utils
const loadSvgIcons = async (names) => {
  const { codeBase } = getConfig();
  const entries = await Promise.all(
    names.map(async (name) => {
      const svg = await loadHrefSvg(`${codeBase}/img/icons/S2_Icon_${name}_20_N.svg`);
      return [name, svg];
    }),
  );
  return Object.fromEntries(entries.filter(([, svg]) => svg));
};

class NxMenu extends LitElement {
  static properties = {
    items: { attribute: false },
    _active: { state: true },
    _icons: { state: true },
  };

  _active = -1;

  get _popover() { return this.shadowRoot.querySelector('nx-popover'); }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  updated(changed) {
    if (changed.has('items')) this._loadIcons();
  }

  async _loadIcons() {
    const names = this.items?.map((i) => i.icon).filter(Boolean) ?? [];
    if (!names.length) return;
    this._icons = await loadSvgIcons(names);
  }

  _onTriggerSlotChange(e) {
    const [trigger] = e.target.assignedElements();
    if (!trigger) return;
    this._trigger = trigger;
    const popover = this._popover;
    if (typeof trigger.popoverTargetElement !== 'undefined') {
      trigger.popoverTargetElement = popover;
      trigger.popoverTargetAction = 'toggle';
      popover.anchor = trigger;
    } else {
      trigger.addEventListener('click', () => this._toggle(trigger));
    }
  }

  _onMenuToggle(e) {
    if (e.newState !== 'open') return;
    this._active = -1;
    this._trigger?.toggleAttribute('data-active', true);
  }

  show({ anchor, placement } = {}) {
    this._active = -1;
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

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this._active = (this._active + 1) % selectable.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this._active = (this._active - 1 + selectable.length) % selectable.length;
    } else if (e.key === 'Enter' && this._active >= 0) {
      e.preventDefault();
      this._select(selectable[this._active]);
    }
  }

  _renderItem(item, idx) {
    if (item.divider) return html`<hr class="menu-divider">`;
    if (item.section) return html`<span class="menu-section">${item.section}</span>`;
    if (!item.label) return nothing;

    return html`
      <button
        class="menu-item ${idx === this._active ? 'menu-item-active' : ''}"
        type="button"
        title=""
        aria-label=${item.label}
        @click=${() => this._select(item)}
        @mouseenter=${() => { this._active = idx; }}
      >
        ${item.icon && this._icons?.[item.icon] ? html`<span class="menu-item-icon">${this._icons[item.icon].cloneNode(true)}</span>` : nothing}
        <span class="menu-item-label">${item.label}</span>
      </button>
    `;
  }

  render() {
    let selectableIdx = -1;
    return html`
      <slot name="trigger" @slotchange=${this._onTriggerSlotChange}></slot>
      <nx-popover @toggle=${this._onMenuToggle} @keydown=${this._onKeydown} @close=${this._onClose}>
        ${this.items?.map((item) => {
          if (!item.divider && !item.section) selectableIdx += 1;
          return this._renderItem(item, item.divider || item.section ? -1 : selectableIdx);
        })}
      </nx-popover> 
    `;
  }
}

customElements.define('nx-menu', NxMenu);
