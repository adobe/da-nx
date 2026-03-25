// eslint-disable-next-line import/no-unresolved
import getStyle from 'https://da.live/nx/utils/styles.js';
// eslint-disable-next-line import/no-unresolved
import { LitElement, html } from 'da-lit';
import {
  aemEnvDeployRelativeCell,
  displayNameWithoutExtension,
  fileKindFromExtension,
  itemLastModifiedRaw,
  itemRowKey,
  lastModifiedByCell,
  lastModifiedRelativeCell,
  relativePathKeyFromFolder,
} from '../../lib/content-browser-utils.js';

const style = await getStyle(import.meta.url);

function iconFolder() {
  return html`<sp-icon-folder class="sl-browse-kind-icon" size="m"></sp-icon-folder>`;
}

function iconFile() {
  return html`<sp-icon-file class="sl-browse-kind-icon" size="m"></sp-icon-file>`;
}

function iconDocument() {
  return html`<sp-icon-file-text class="sl-browse-kind-icon" size="m"></sp-icon-file-text>`;
}

function iconMedia() {
  return html`<sp-icon-image class="sl-browse-kind-icon" size="m"></sp-icon-image>`;
}

function iconSheet() {
  return html`<sp-icon-table class="sl-browse-kind-icon" size="m"></sp-icon-table>`;
}

/** Kind column icon: folder, document, media, sheet, or generic file. */
function rowKindIcon(item) {
  const kind = fileKindFromExtension(item.ext);
  if (kind === 'folder') return iconFolder();
  if (kind === 'document') return iconDocument();
  if (kind === 'media') return iconMedia();
  if (kind === 'sheet') return iconSheet();
  return iconFile();
}

/**
 * Placeholder rows while loading (stable height vs. a plain “Loading…” block).
 */
const SKELETON_ROW_COUNT = 10;

function skeletonRowsTemplate() {
  return Array.from({ length: SKELETON_ROW_COUNT }, () => html`
    <tr class="sl-data-row sl-data-row-skeleton" aria-hidden="true">
      <td class="sl-col-check"></td>
      <td class="sl-col-icon"></td>
      <td class="sl-col-name"><span class="sl-data-row-skeleton-bar" aria-hidden="true"></span></td>
      <td class="sl-col-modified">
        <span class="sl-data-row-skeleton-bar sl-data-row-skeleton-bar-medium" aria-hidden="true"></span>
      </td>
      <td class="sl-col-modified-by"><span class="sl-data-row-skeleton-bar sl-data-row-skeleton-bar-medium" aria-hidden="true"></span></td>
      <td class="sl-col-aem-status"></td>
      <td class="sl-col-aem-status"></td>
    </tr>
  `);
}

/**
 * Folder/file list grid with multi-select; bulk actions live in the host toolbar.
 * @fires sl-table-selection-change - detail: { selected: string[] }
 * @fires sl-open-folder - detail: { pathKey: string }
 * @fires sl-file-request-edit - detail: { pathKey: string } (row activate on files)
 * @customElement sl-browse-body
 */
export class SlBrowseBody extends LitElement {
  static properties = {
    /** @type {Array<object>} List rows (`name`, `path`, `ext`, AEM fields, etc.). */
    items: { type: Array },
    currentPathKey: { type: String, attribute: 'current-path-key' },
    /** @type {string[]} */
    selectedRows: { type: Array },
    /**
     * First fetch: skeleton rows until items load (avoids “Loading…” layout swap).
     */
    initialLoading: { type: Boolean, attribute: 'initial-loading' },
    /**
     * When true (e.g. subtree search), show each file’s path under {@link currentPathKey}.
     */
    showRelativePath: { type: Boolean, attribute: 'show-relative-path' },
  };

  constructor() {
    super();
    this.items = [];
    this.currentPathKey = '';
    this.selectedRows = [];
    this.initialLoading = false;
    this.showRelativePath = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  /**
   * Returns stable row keys for the current `items` list.
   * @returns {string[]}
   */
  _rowKeys() {
    const folderPathKey = this.currentPathKey;
    return (this.items || []).map((item) => itemRowKey(item, folderPathKey));
  }

  /**
   * Notifies the host that row selection changed.
   * @param {string[]} selectedRowKeys - Selected row path keys.
   */
  emitSelectionChangeEvent(selectedRowKeys) {
    this.dispatchEvent(
      new CustomEvent('sl-table-selection-change', {
        detail: { selected: selectedRowKeys },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /**
   * Toggles one row in the selection and emits {@link emitSelectionChangeEvent}.
   * @param {string} rowPathKey - Row key to toggle.
   */
  _toggleRowSelection(rowPathKey) {
    const nextSelection = new Set(this.selectedRows);
    if (nextSelection.has(rowPathKey)) nextSelection.delete(rowPathKey);
    else nextSelection.add(rowPathKey);
    this.emitSelectionChangeEvent([...nextSelection]);
  }

  /**
   * Header “select all” checkbox binding: checked / indeterminate from items + selection.
   * @returns {{ checked: boolean, indeterminate: boolean }}
   */
  _selectAllCheckboxBinding() {
    const rowKeys = this._rowKeys();
    const selectedCount = rowKeys.filter((key) => this.selectedRows.includes(key)).length;
    return {
      checked: rowKeys.length > 0 && selectedCount === rowKeys.length,
      indeterminate: selectedCount > 0 && selectedCount < rowKeys.length,
    };
  }

  /**
   * Checkbox column: whole cell toggles selection; does not open folder / file.
   * Clicks on the native checkbox rely on `@change` only (avoid double toggle).
   * @param {MouseEvent} event
   * @param {string} fullPathKey
   */
  _onCheckboxCellClick(event, fullPathKey) {
    event.stopPropagation();
    const t = event.target;
    if (t instanceof HTMLInputElement && t.type === 'checkbox') return;
    this._toggleRowSelection(fullPathKey);
  }

  /**
   * Row body click: open folder or request edit (skip checkbox column / inputs).
   * @param {MouseEvent} event - Click on the row.
   * @param {object} item - List row model.
   * @param {string} fullPathKey - Row path key.
   */
  _onRowActivate(event, item, fullPathKey) {
    const rawTarget = event.target;
    const hitElement = rawTarget instanceof Element ? rawTarget : rawTarget?.parentElement;
    if (!hitElement?.closest) return;
    if (hitElement.closest('.sl-col-check')) return;
    if (hitElement.closest('input, button, a, [role="menuitem"]')) return;
    const isFolder = !item.ext;
    if (isFolder) {
      this._onOpenFolder(event, fullPathKey);
      return;
    }
    event.stopPropagation();
    this.dispatchEvent(
      new CustomEvent('sl-file-request-edit', {
        detail: { pathKey: fullPathKey },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /**
   * Select-all checkbox: selects every row or clears selection.
   * @param {Event} event - Native change event from the header checkbox.
   */
  _onSelectAllChange(event) {
    const { checked } = /** @type {HTMLInputElement} */ (event.target);
    if (checked) this.emitSelectionChangeEvent(this._rowKeys());
    else this.emitSelectionChangeEvent([]);
  }

  /**
   * Opens a folder row (host updates path).
   * @param {MouseEvent} event - Activating event.
   * @param {string} pathKey - Destination folder path key.
   */
  _onOpenFolder(event, pathKey) {
    event.stopPropagation();
    if (!pathKey) return;
    this.dispatchEvent(
      new CustomEvent('sl-open-folder', {
        detail: { pathKey },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /** Table body and optional skeleton rows. */
  render() {
    const folderPathKey = this.currentPathKey;
    const items = this.items || [];
    const showSkeleton = this.initialLoading && items.length === 0;
    const bodyRowCount = showSkeleton ? SKELETON_ROW_COUNT : items.length;
    const selectAllBinding = this._selectAllCheckboxBinding();

    return html`
      <div class="sl-browse-files-panel">
        <div class="sl-table-card ${showSkeleton ? 'sl-table-card-initial-loading' : ''}">
          <div class="sl-table-scroll">
            <table
              class="sl-data-table ${this.showRelativePath ? 'sl-data-table-search-paths' : ''}"
              role="grid"
              aria-busy="${showSkeleton}"
              aria-rowcount="${bodyRowCount + 1}"
            >
              <thead>
                <tr>
                  <th class="sl-col-check" scope="col">
                    <input
                      type="checkbox"
                      class="sl-table-select-all sl-checkbox"
                      aria-label="Select all"
                      .checked="${selectAllBinding.checked}"
                      .indeterminate="${selectAllBinding.indeterminate}"
                      ?disabled="${showSkeleton}"
                      @change="${this._onSelectAllChange}"
                    />
                  </th>
                  <th class="sl-col-icon" scope="col"><span class="sl-sr-only">Kind</span></th>
                  <th class="sl-col-name" scope="col">Name</th>
                  <th scope="col">Last modified</th>
                  <th scope="col">Modified by</th>
                  <th class="sl-col-aem-status" scope="col">Previewed</th>
                  <th class="sl-col-aem-status" scope="col">Published</th>
                </tr>
              </thead>
              <tbody>
                ${showSkeleton
        ? skeletonRowsTemplate()
        : items.map((item, rowIndex) => {
          const fullPathKey = itemRowKey(item, folderPathKey);
          const isFolder = !item.ext;
          const modified = lastModifiedRelativeCell(itemLastModifiedRaw(item));
          const modifiedBy = lastModifiedByCell(item);
          const previewed = aemEnvDeployRelativeCell(
            item.aemPreviewOk,
            item.aemPreviewLastModified,
            isFolder,
            'preview',
          );
          const published = aemEnvDeployRelativeCell(
            item.aemLiveOk,
            item.aemLiveLastModified,
            isFolder,
            'live',
          );
          const rowSelected = this.selectedRows.includes(fullPathKey);
          const relPath = relativePathKeyFromFolder(fullPathKey, folderPathKey);
          const nameStr = item.name || '';
          const rawDisplayName = this.showRelativePath && relPath ? relPath : nameStr;
          const displayName = displayNameWithoutExtension(rawDisplayName, item);
          return html`
                        <tr
                          class="sl-data-row ${rowSelected ? 'sl-data-row-selected' : ''}"
                          role="row"
                          aria-rowindex="${rowIndex + 2}"
                          aria-selected="${rowSelected}"
                          @click="${(clickEvent) => this._onRowActivate(clickEvent, item, fullPathKey)}"
                        >
                          <td
                            class="sl-col-check"
                            @click="${(e) => this._onCheckboxCellClick(e, fullPathKey)}"
                          >
                            <input
                              type="checkbox"
                              class="sl-checkbox"
                              aria-label="Select ${displayName}"
                              .checked="${rowSelected}"
                              @change="${() => this._toggleRowSelection(fullPathKey)}"
                            />
                          </td>
                          <td class="sl-col-icon">${rowKindIcon(item)}</td>
                          <td class="sl-col-name">
                            <span class="sl-name-text" title="${rawDisplayName}">${displayName}</span>
                          </td>
                          <td class="sl-col-modified" title=${modified.title ?? undefined}>
                            ${modified.label}
                          </td>
                          <td class="sl-col-modified-by" title=${modifiedBy.title ?? undefined}>
                            ${modifiedBy.label}
                          </td>
                          <td class="sl-col-aem-status" title=${previewed.title || undefined}>
                            ${previewed.label}
                          </td>
                          <td class="sl-col-aem-status" title=${published.title || undefined}>
                            ${published.label}
                          </td>
                        </tr>
                      `;
        })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }
}

if (!customElements.get('sl-browse-body')) {
  customElements.define('sl-browse-body', SlBrowseBody);
}
