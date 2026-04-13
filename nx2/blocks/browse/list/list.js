import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';
import { loadIcons, getIconByExtension, itemRowPathKey } from '../utils.js';

const styles = await loadStyle(import.meta.url);

export class NxBrowseList extends LitElement {
  static properties = {
    items: { type: Array },
    currentPathKey: { type: String, attribute: 'current-path-key' },
    _icons: { state: true },
    _selectedKeys: { state: true },
  };

  willUpdate(changedProperties) {
    if (changedProperties.has('currentPathKey')) {
      this._selectedKeys = [];
      this._emitSelectionChange();
    }
  }

  updated() {
    const input = this.shadowRoot?.getElementById('browse-select-all');
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    if (this.items === undefined) {
      return;
    }
    const { items } = this;
    const selectedKeys = this._selectedKeys ?? [];
    const keys = items.map((item) => itemRowPathKey(this.currentPathKey, item));
    const selectedCount = keys.filter((rowKey) => selectedKeys.includes(rowKey)).length;
    input.indeterminate = selectedCount > 0 && selectedCount < keys.length;
    if (keys.length === 0) {
      input.checked = false;
      input.indeterminate = false;
    }
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  async firstUpdated() {
    this._icons = await loadIcons();
  }

  _renderIcon(iconKey) {
    const svg = this._icons?.[iconKey];
    return svg ? svg.cloneNode(true) : nothing;
  }

  _onRowActivate(event, item) {
    if (item.ext) {
      return;
    }
    const pathKey = itemRowPathKey(this.currentPathKey, item);
    event.stopPropagation();
    this.dispatchEvent(
      new CustomEvent('nx-browse-open-folder', {
        detail: { pathKey },
        bubbles: true,
        composed: true,
      }),
    );
  }

  _emitSelectionChange() {
    this.dispatchEvent(
      new CustomEvent('nx-browse-selection-change', {
        detail: { selectedKeys: [...(this._selectedKeys ?? [])] },
        bubbles: true,
        composed: true,
      }),
    );
  }

  _isRowSelected(key) {
    return (this._selectedKeys ?? []).includes(key);
  }

  _onSelectAllChange(event) {
    event.stopPropagation();
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    if (this.items === undefined) {
      return;
    }
    const { items } = this;
    const keys = items.map((item) => itemRowPathKey(this.currentPathKey, item));
    this._selectedKeys = input.checked ? [...keys] : [];
    this._emitSelectionChange();
  }

  _onRowCheckboxChange(event, item) {
    event.stopPropagation();
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    const key = itemRowPathKey(this.currentPathKey, item);
    const selectedKeys = this._selectedKeys ?? [];
    if (input.checked) {
      this._selectedKeys = selectedKeys.includes(key)
        ? selectedKeys
        : [...selectedKeys, key];
    } else {
      this._selectedKeys = selectedKeys.filter((selectedKey) => selectedKey !== key);
    }
    this._emitSelectionChange();
  }

  render() {
    if (this.items === undefined) {
      return nothing;
    }
    const { items } = this;
    const selectedKeys = this._selectedKeys ?? [];
    const rowKeys = items.map((item) => itemRowPathKey(this.currentPathKey, item));
    const selectedCount = rowKeys.filter((rowKey) => selectedKeys.includes(rowKey)).length;
    const allSelected = items.length > 0 && selectedCount === items.length;

    return html`
      <table class="browse-data-table" role="table">
        <thead>
          <tr>
            <th class="browse-col-select" scope="col">
              <label class="browse-checkbox-label">
                <span class="browse-sr-only">Select all</span>
                <input
                  id="browse-select-all"
                  type="checkbox"
                  .checked=${allSelected}
                  @change=${this._onSelectAllChange}
                />
              </label>
            </th>
            <th class="browse-col-icon" scope="col"><span class="browse-sr-only">Type</span></th>
            <th class="browse-col-name" scope="col">Name</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item) => {
      const key = itemRowPathKey(this.currentPathKey, item);
      const selected = this._isRowSelected(key);
      return html`
              <tr
                class="browse-data-row ${item.ext ? 'browse-data-row-file' : 'browse-data-row-folder'}"
                aria-selected=${selected ? 'true' : 'false'}
                @click=${(event) => this._onRowActivate(event, item)}
              >
                <td class="browse-col-select" @click=${(event) => event.stopPropagation()}>
                  <label class="browse-checkbox-label">
                    <span class="browse-sr-only">Select ${item.name || 'row'}</span>
                    <input
                      type="checkbox"
                      .checked=${selected}
                      @change=${(event) => this._onRowCheckboxChange(event, item)}
                    />
                  </label>
                </td>
                <td class="browse-col-icon">${this._renderIcon(getIconByExtension(item?.ext))}</td>
                <td class="browse-col-name">
                  <span class="browse-name-text" title=${item.name || ''}>${item.name}</span>
                </td>
              </tr>
            `;
    })}
        </tbody>
      </table>
    `;
  }
}

if (!customElements.get('nx-browse-list')) {
  customElements.define('nx-browse-list', NxBrowseList);
}
