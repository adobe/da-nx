import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';
import '../popover/popover.js';
import { listKeydown } from '../utils/list-nav.js';

const styles = await loadStyle(import.meta.url);

// todo: replace with s2 icon once tools PR is merged
const CHECKMARK = html`<svg class="picker-check" viewBox="0 0 20 20" fill="none" aria-hidden="true">
  <path d="M4 10l4.5 4.5L16 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

class NxPicker extends LitElement {
  static properties = {
    items: { attribute: false },
    value: {},
    _active: { state: true },
  };

  get _popover() { return this.shadowRoot.querySelector('nx-popover'); }

  get _button() { return this.shadowRoot.querySelector('.picker-trigger'); }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  get open() { return this._popover?.open ?? false; }

  get _selectedLabel() {
    return this.items?.find((i) => i.value === this.value)?.label ?? '';
  }

  show() {
    this._popover?.show({
      anchor: this._button,
      placement: this.getAttribute('placement') ?? 'below',
    });
  }

  close() { this._popover?.close(); }

  _toggle() {
    if (this.open) {
      this.close();
      return;
    }
    this.show();
  }

  _onClose() {
    this._button?.toggleAttribute('data-active', false);
    this._button?.setAttribute('aria-expanded', 'false');
  }

  _onPopoverToggle(e) {
    if (e.newState !== 'open') return;
    this._active = this.value;
    this.updateComplete.then(() => {
      this.shadowRoot.querySelector(`[data-value="${this._active}"]`)?.focus();
    });
  }

  _select(item) {
    this.value = item.value;
    this.close();
    this.dispatchEvent(new CustomEvent('change', { detail: { value: item.value }, bubbles: true, composed: true }));
  }

  handleKey(key) {
    return listKeydown(key, {
      items: this.items,
      active: this._active,
      itemKey: 'value',
      shadowRoot: this.shadowRoot,
      setActive: (val) => { this._active = val; },
      onSelect: (item) => this._select(item),
      onClose: () => this.close(),
    });
  }

  _onTriggerKeydown(e) {
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !this.open) {
      e.preventDefault();
      this.show();
    }
  }

  _onKeydown(e) {
    const handled = this.handleKey(e.key);
    if (handled) e.preventDefault();
  }

  _renderItem(item) {
    if (item.divider) return html`<li role="separator"><hr class="picker-divider"></li>`;
    if (!item.label || item.value === undefined) return nothing;

    const selected = item.value === this.value;
    const active = item.value === this._active;

    return html`
      <li role="none">
        <button
          role="option"
          aria-selected=${selected}
          data-value=${item.value}
          class="picker-item ${active ? 'picker-item-active' : ''}"
          type="button"
          @click=${() => this._select(item)}
          @mouseenter=${() => { this._active = item.value; }}
          @focus=${() => { this._active = item.value; }}
        >
          <span class="picker-item-label">${item.label}</span>
          ${selected ? CHECKMARK : nothing}
        </button>
      </li>
    `;
  }

  render() {
    return html`
      <button
        class="picker-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded="false"
        @click=${this._toggle}
        @keydown=${this._onTriggerKeydown}
      >
        <span class="picker-trigger-label">${this._selectedLabel}</span>
        <span class="picker-chevron" aria-hidden="true"></span>
      </button>
      <nx-popover
        @toggle=${this._onPopoverToggle}
        @keydown=${this._onKeydown}
        @close=${this._onClose}
      >
        <ul role="listbox">
          ${this.items?.map((item) => this._renderItem(item))}
        </ul>
      </nx-popover>
    `;
  }
}

customElements.define('nx-picker', NxPicker);
