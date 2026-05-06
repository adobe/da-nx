import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';
import { formatColumnLastModified } from './format.js';
import { getIconByExtension, isFolder, loadIcons } from '../utils.js';

const styles = await loadStyle(import.meta.url);

export class NxBrowseList extends LitElement {
  static properties = {
    items: { type: Array },
    folderKey: { type: String, attribute: 'folder-key' },
    _icons: { state: true },
    _selectedKeys: { state: true },
  };

  willUpdate(changedProperties) {
    if (changedProperties.has('folderKey')) {
      this._selectedKeys = [];
      this._emitSelectionChange();
    }
  }

  updated() {
    const input = this.shadowRoot?.getElementById('select-all');
    if (!input) {
      return;
    }
    if (this.items === undefined) {
      return;
    }
    const { items } = this;
    const selectedKeys = this._selectedKeys || [];
    const paths = items.map((item) => item.path);
    const selectedCount = paths
      .filter((selectedPath) => selectedKeys.includes(selectedPath)).length;
    input.indeterminate = selectedCount > 0 && selectedCount < paths.length;
    if (!paths.length) {
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

  _handleRowActivate(event, item) {
    event.stopPropagation();
    this.dispatchEvent(
      new CustomEvent('nx-browse-activate', {
        detail: { item },
        bubbles: true,
        composed: true,
      }),
    );
  }

  _emitSelectionChange() {
    this.dispatchEvent(
      new CustomEvent('nx-browse-selection-change', {
        detail: { selectedKeys: [...(this._selectedKeys || [])] },
        bubbles: true,
        composed: true,
      }),
    );
  }

  clearSelection() {
    if (!this._selectedKeys?.length) return;
    this._selectedKeys = [];
    this._emitSelectionChange();
  }

  _isRowSelected(path) {
    return (this._selectedKeys ?? []).includes(path);
  }

  _handleSelectAllChange(event) {
    event.stopPropagation();
    if (this.items === undefined) {
      return;
    }
    const { items } = this;
    const paths = items.map((item) => item.path);
    this._selectedKeys = event.target.checked ? [...paths] : [];
    this._emitSelectionChange();
  }

  _handleRowCheckboxChange(event, item) {
    event.stopPropagation();
    const { path } = item;
    const selectedKeys = this._selectedKeys || [];
    if (event.target.checked) {
      this._selectedKeys = selectedKeys.includes(path)
        ? selectedKeys
        : [...selectedKeys, path];
    } else {
      this._selectedKeys = selectedKeys.filter((selectedPath) => selectedPath !== path);
    }
    this._emitSelectionChange();
  }

  render() {
    if (this.items === undefined) {
      return nothing;
    }
    const { items } = this;
    const selectedKeys = this._selectedKeys || [];
    const paths = items.map((item) => item.path);
    const selectedCount = paths
      .filter((selectedPath) => selectedKeys.includes(selectedPath)).length;
    const hasAllSelected = items.length > 0 && selectedCount === items.length;

    return html`
      <div class="scroll">
        <table class="sheet" role="table">
          <thead>
            <tr>
              <th class="column-selection" scope="col">
                <label class="check">
                  <span class="sr-only">Select all</span>
                  <input
                    id="select-all"
                    type="checkbox"
                    .checked=${hasAllSelected}
                    @change=${this._handleSelectAllChange}
                  />
                </label>
              </th>
              <th class="column-entry-type" scope="col"><span class="sr-only">Type</span></th>
              <th class="column-file-name" scope="col">Name</th>
              <th class="column-modified" scope="col">Last modified</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item) => {
      const { path } = item;
      const isSelected = this._isRowSelected(path);
      const isFolderRow = isFolder(item);
      const modified = isFolderRow
        ? { label: '' }
        : formatColumnLastModified(item.lastModified);
      const rowKind = isFolderRow ? 'row-dir' : 'row-file';
      return html`
                <tr
                  class="row ${rowKind}"
                  aria-selected=${isSelected ? 'true' : 'false'}
                  @click=${(event) => this._handleRowActivate(event, item)}
                >
                  <td class="column-selection" @click=${(event) => event.stopPropagation()}>
                    <label class="check">
                      <span class="sr-only">Select ${item.name || 'row'}</span>
                      <input
                        type="checkbox"
                        .checked=${isSelected}
                        @change=${(event) => this._handleRowCheckboxChange(event, item)}
                      />
                    </label>
                  </td>
                  <td class="column-entry-type">${this._renderIcon(getIconByExtension(item?.ext))}</td>
                  <td class="column-file-name">
                    <span class="filename" title=${item.name}>${item.name}</span>
                  </td>
                  <td class="column-modified" title=${modified.title || nothing}>
                    ${modified.label === '' ? '' : modified.label ?? '—'}
                  </td>
                </tr>
              `;
    })}
          </tbody>
        </table>
      </div>
    `;
  }
}

customElements.define('nx-browse-list', NxBrowseList);
