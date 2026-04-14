import { LitElement, html } from 'da-lit';
import { loadStyle } from '../../../../utils/utils.js';
import '../../../shared/popover/popover.js';

const menuStyles = await loadStyle(new URL('../../../shared/menu/menu.js', import.meta.url).href);

function getFilteredItems(items, command) {
  const searchText = command.toLowerCase().trim();
  const inputText = searchText.split(' ')[0];

  return items
    .filter((item) => {
      const itemTitle = item.title.toLowerCase();
      return item.argument
        ? itemTitle.includes(inputText)
        : itemTitle.includes(searchText);
    })
    .sort((a, b) => {
      const aTitle = a.title.toLowerCase();
      const bTitle = b.title.toLowerCase();

      const getScore = (title) => {
        if (title.startsWith(searchText)) return 2;
        if (title.includes(searchText)) return 1;
        return 0;
      };

      return getScore(bTitle) - getScore(aTitle)
        || aTitle.localeCompare(bTitle);
    });
}

export class NxSlashPopover extends LitElement {
  static properties = {
    items: { type: Array, attribute: false },
    command: { type: String },
    _selectedIndex: { state: true },
  };

  constructor() {
    super();
    this.items = [];
    this.command = '';
    this._selectedIndex = 0;
  }

  get _popover() {
    return this.shadowRoot?.querySelector('nx-popover');
  }

  get visible() {
    return Boolean(this._popover?.open);
  }

  connectedCallback() {
    super.connectedCallback();
    this.style.display = 'contents';
    this.shadowRoot.adoptedStyleSheets = [menuStyles];
  }

  willUpdate(changed) {
    super.willUpdate(changed);
    if (changed.has('command') || changed.has('items')) {
      this._selectedIndex = 0;
    }
  }

  updated(changed) {
    super.updated(changed);
    if (changed.has('command') || changed.has('items') || changed.has('_selectedIndex')) {
      const row = this.getFilteredItems()[this._selectedIndex];
      this.updateComplete.then(() => {
        if (row) {
          this.shadowRoot.querySelector(`[data-slash-idx="${this._selectedIndex}"]`)?.scrollIntoView({
            block: 'nearest',
          });
        }
      });
    }
    if (this._popover?.open && this.getFilteredItems().length === 0) {
      this._popover.close();
    }
  }

  getFilteredItems() {
    return getFilteredItems(this.items ?? [], this.command ?? '');
  }

  show({ x, y }) {
    this.updateComplete.then(() => {
      const filtered = this.getFilteredItems();
      if (!filtered.length) return;
      this._selectedIndex = 0;
      this._popover?.show({ x, y });
    });
  }

  hide() {
    this.command = '';
    this._popover?.close();
  }

  _emitSelect(item) {
    this.dispatchEvent(new CustomEvent('item-selected', {
      bubbles: true,
      composed: true,
      detail: { item },
    }));
  }

  _onClose() {
    this.command = '';
  }

  _onKeydown(e) {
    const filtered = this.getFilteredItems();
    if (!filtered.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this._selectedIndex = (this._selectedIndex + 1) % filtered.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this._selectedIndex = (this._selectedIndex <= 0 ? filtered.length : this._selectedIndex) - 1;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filtered[this._selectedIndex];
      if (item) this._emitSelect(item);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.hide();
    }
  }

  handleKeyDown(event) {
    this._onKeydown(event);
  }

  render() {
    const filtered = this.getFilteredItems();
    if (!filtered.length) {
      return html`<nx-popover @close=${this._onClose} @keydown=${this._onKeydown}></nx-popover>`;
    }

    return html`
      <nx-popover @close=${this._onClose} @keydown=${this._onKeydown}>
        <ul role="menu">
          ${filtered.map((item, index) => html`
            <li role="none">
              <button
                type="button"
                role="menuitem"
                data-slash-idx=${index}
                class="menu-item ${index === this._selectedIndex ? 'menu-item-active' : ''}"
                @mousedown=${(ev) => { ev.preventDefault(); }}
                @click=${() => this._emitSelect(item)}
                @mouseenter=${() => { this._selectedIndex = index; }}
              >
                <span class="menu-item-label">${item.title}</span>
              </button>
            </li>
          `)}
        </ul>
      </nx-popover>
    `;
  }
}

customElements.define('nx-slash-popover', NxSlashPopover);
