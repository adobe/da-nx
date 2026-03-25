// eslint-disable-next-line import/no-unresolved
import getStyle from 'https://da.live/nx/utils/styles.js';
// eslint-disable-next-line import/no-unresolved
import { LitElement, html } from 'da-lit';

const style = await getStyle(import.meta.url);

function iconChevronDown() {
  return html`<sp-icon-chevron-down class="sl-fc-chevron-icon" size="xs"></sp-icon-chevron-down>`;
}

function iconClose() {
  return html`<sp-icon-cross75 class="sl-fc-close-icon" size="xs"></sp-icon-cross75>`;
}

/**
 * Drive-style filter chip: `<summary>` opens a menu; when `value !== clearValue`, shows a clear
 * control. Controlled component: set `value` from the host; listen for `sl-filter-chip-change` and
 * update host state.
 *
 * @fires sl-filter-chip-change - detail: { value: string }
 * @customElement sl-filter-chip
 */
class SlFilterChip extends LitElement {
  static properties = {
    placeholder: { type: String },
    value: { type: String },
    clearValue: { type: String, attribute: 'clear-value' },
    accessibleName: { type: String, attribute: 'accessible-name' },
    clearLabel: { type: String, attribute: 'clear-label' },
    /** @type {{ value: string, label: string }[]} */
    options: { type: Array },
  };

  constructor() {
    super();
    this.placeholder = 'Filter';
    this.value = '';
    this.clearValue = '';
    this.accessibleName = 'Filter';
    this.clearLabel = 'Clear filter';
    this.options = [];
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  _labelForValue(v) {
    const o = this.options.find((x) => x.value === v);
    return o ? o.label : v;
  }

  _triggerText() {
    if (this.value === this.clearValue) return this.placeholder;
    return this._labelForValue(this.value);
  }

  _isPlaceholderState() {
    return this.value === this.clearValue;
  }

  _active() {
    return this.value !== this.clearValue;
  }

  _closeDropdown() {
    const el = this.shadowRoot?.querySelector('details.sl-fc-dd');
    if (el) el.open = false;
  }

  /** Close the menu (e.g. when a sibling filter chip opens). */
  close() {
    this._closeDropdown();
  }

  /**
   * When this chip opens, close other `sl-filter-chip` in the same parent (Kind vs Format).
   * @param {Event} e
   */
  _onDetailsToggle(e) {
    const d = /** @type {HTMLDetailsElement} */ (e.target);
    if (!d.open) return;
    const p = this.parentElement;
    if (!p) return;
    for (const el of p.querySelectorAll('sl-filter-chip')) {
      if (el !== this && el instanceof SlFilterChip) {
        el.close();
      }
    }
  }

  /**
   * @param {Event} e
   * @param {string} next
   */
  _onOptionClick(e, next) {
    e.preventDefault();
    e.stopPropagation();
    this._closeDropdown();
    if (next === this.value) return;
    this.dispatchEvent(
      new CustomEvent('sl-filter-chip-change', {
        bubbles: true,
        composed: true,
        detail: { value: next },
      }),
    );
  }

  /**
   * @param {Event} e
   */
  _onClear(e) {
    e.stopPropagation();
    e.preventDefault();
    if (this.value === this.clearValue) return;
    this._closeDropdown();
    this.dispatchEvent(
      new CustomEvent('sl-filter-chip-change', {
        bubbles: true,
        composed: true,
        detail: { value: this.clearValue },
      }),
    );
  }

  render() {
    const f = this.value;
    const active = this._active();
    return html`
      <div
        class="sl-fc-chip ${active ? 'sl-fc-chip-active' : ''}"
        role="group"
        aria-label="${this.accessibleName}"
      >
        <details class="sl-fc-dd" @toggle="${this._onDetailsToggle}">
          <summary class="sl-fc-trigger">
            <span
              class="sl-fc-trigger-text ${this._isPlaceholderState()
                ? 'sl-fc-trigger-text-placeholder'
                : ''}"
            >
              ${this._triggerText()}
            </span>
            ${iconChevronDown()}
          </summary>
          <div class="sl-fc-panel" role="menu" @click="${(ev) => ev.stopPropagation()}">
            ${this.options.map(
              (opt) => html`
                <button
                  type="button"
                  role="menuitem"
                  class="sl-fc-option ${f === opt.value ? 'sl-fc-option-current' : ''}"
                  @click="${(ev) => this._onOptionClick(ev, opt.value)}"
                >
                  ${opt.label}
                </button>
              `,
            )}
          </div>
        </details>
        ${active
          ? html`
              <button
                type="button"
                class="sl-fc-clear"
                aria-label="${this.clearLabel}"
                @click="${this._onClear}"
              >
                ${iconClose()}
              </button>
            `
          : ''}
      </div>
    `;
  }
}

if (!customElements.get('sl-filter-chip')) {
  customElements.define('sl-filter-chip', SlFilterChip);
}

export { SlFilterChip };
