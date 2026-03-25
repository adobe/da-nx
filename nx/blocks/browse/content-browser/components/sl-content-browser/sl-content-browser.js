// eslint-disable-next-line import/no-unresolved
import getStyle from 'https://da.live/nx/utils/styles.js';
// eslint-disable-next-line import/no-unresolved
import { LitElement, html, createRef, ref } from 'da-lit';
import { parseHashToPathContext } from '../../api/da-browse-api.js';
import {
  buildCanvasEditHref,
  buildDeleteDialogContent,
  createBrowseActions,
  getAemPathsForSelection,
  resolveCanvasEditPathKey,
  resolveDeleteTargets,
} from '../../lib/content-browser-actions.js';
import {
  daRenameDestinationBasename,
  daRenameDestinationPath,
  daSourcePathForItem,
  FILE_KIND_LABEL,
  fileKindFromExtension,
  filterItemsByFormatKind,
  filterItemsByKind,
  filterItemsByQuery,
  findItemByRowKey,
} from '../../lib/content-browser-utils.js';
import '../sl-browse-breadcrumbs/sl-browse-breadcrumbs.js';
import '../sl-browse-body/sl-browse-body.js';
import '../sl-browse-delete-dialog/sl-browse-delete-dialog.js';
import '../sl-browse-folder/sl-browse-folder.js';
import '../sl-browse-new/sl-browse-new.js';
import '../sl-browse-rename-dialog/sl-browse-rename-dialog.js';
import '../sl-browse-search/sl-browse-search.js';
import '../sl-browse-selection-toolbar/sl-browse-selection-toolbar.js';
import '../sl-browse-toast-host/sl-browse-toast-host.js';
import '../sl-filter-chip/sl-filter-chip.js';

const style = await getStyle(import.meta.url);

/** Options for type filter `<sl-filter-chip>` (folders vs files). */
const TYPE_FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'folder', label: 'Folder' },
  { value: 'file', label: 'File' },
];

const FORMAT_FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'document', label: FILE_KIND_LABEL.document },
  { value: 'sheet', label: FILE_KIND_LABEL.sheet },
  { value: 'media', label: FILE_KIND_LABEL.media },
];

const FORMAT_FILTER_VALUES = new Set(FORMAT_FILTER_OPTIONS.map((o) => o.value));

/**
 * Search-first folder browser: composes header, `sl-browse-folder` sync, table, dialogs.
 *
 * @fires sl-content-browser-navigate - detail: { pathKey: string }
 * @customElement sl-content-browser
 */
class SlContentBrowser extends LitElement {
  /* eslint-disable max-len */
  static properties = {
    navigateWithHash: { type: Boolean, attribute: 'navigate-with-hash' },
    initialQuery: { type: String, attribute: 'initial-query' },
    canvasEditBase: { type: String, attribute: 'canvas-edit-base' },
    /** Base for new sheet navigation (hash path appended). */
    sheetEditBase: { type: String, attribute: 'sheet-edit-base' },
    /**
     * @type {{ pathSegments: string[], fullpath: string } | null | undefined}
     */
    pathContext: { type: Object, attribute: false },
    /**
     * Return rows or `{ items, permissions? }` (see `createListFetcher`).
     * @type {((fullpath: string) => Promise<object[] | { items: object[], permissions?: string[] }>) | undefined}
     */
    listFolder: { attribute: false },
    /** @type {((items: object[], fullpath: string) => Promise<object[]>) | undefined} */
    aemEnrichListItems: { attribute: false },
    /** @type {((path: string, action: 'preview'|'live') => Promise<object>) | undefined} */
    saveToAem: { attribute: false },
    /** @type {((daPath: string) => Promise<{ ok: boolean, error?: string }>) | undefined} */
    deleteItem: { attribute: false },
    /** @type {((sourceDaPath: string, destinationDaPath: string) => Promise<{ ok: boolean, error?: string }>) | undefined} */
    renameItem: { attribute: false },
    /**
     * PUT `/source{path}` for create/upload/link/folder (see `createSaveToSource`).
     * @type {((daPath: string, formData?: FormData) => Promise<{ ok: boolean, error?: string }>) | undefined}
     */
    saveToSource: { attribute: false },
    moveEnabled: { type: Boolean, attribute: 'move-enabled' },
    _rawItems: { state: true },
    _loading: { state: true },
    _error: { state: true },
    _searchQuery: { state: true },
    _typeFilter: { state: true },
    _formatFilter: { state: true },
    _selectedRows: { state: true },
    _publishLoading: { state: true },
    _deleteLoading: { state: true },
    _renameLoading: { state: true },
    _renameSourceDaPath: { state: true },
    _renameDraft: { state: true },
    _renameError: { state: true },
    _renameSourceFileExt: { state: true },
    _renameOpen: { state: true },
    _initialQueryApplied: { state: true },
    _locationHash: { state: true },
    _deleteDialogOpen: { state: true },
    _deleteDialogIntro: { state: true },
    _deleteDialogPaths: { state: true },
    _toastOpen: { state: true },
    _toastText: { state: true },
    /** @type {'info' | 'positive' | 'negative'} */
    _toastVariant: { state: true },
    /** @type {string[] | undefined} */
    _listPermissions: { state: true },
  };
  /* eslint-enable max-len */

  constructor() {
    super();
    this.navigateWithHash = false;
    this.initialQuery = '';
    this.canvasEditBase = 'https://da.live/canvas';
    this.sheetEditBase = 'https://da.live/sheet';
    this.pathContext = undefined;
    this.listFolder = undefined;
    this.aemEnrichListItems = undefined;
    this.saveToAem = undefined;
    this.deleteItem = undefined;
    this.renameItem = undefined;
    this.saveToSource = undefined;
    this.moveEnabled = false;
    this._rawItems = [];
    this._loading = false;
    this._error = null;
    this._searchQuery = '';
    this._typeFilter = 'all';
    this._formatFilter = 'all';
    this._selectedRows = [];
    this._publishLoading = false;
    this._deleteLoading = false;
    this._renameLoading = false;
    this._renameSourceDaPath = '';
    this._renameDraft = '';
    this._renameError = '';
    this._renameSourceFileExt = '';
    this._renameOpen = false;
    this._initialQueryApplied = false;
    this._locationHash = '';
    this._deleteDialogOpen = false;
    this._deleteDialogIntro = '';
    this._deleteDialogPaths = [];
    /** @type {string[]} */
    this._pendingDeleteDaPaths = [];
    this._toastOpen = false;
    this._toastText = '';
    this._toastVariant = 'info';
    this._listPermissions = undefined;
    this._browseActions = createBrowseActions(this);
    this._folderRef = createRef();
  }

  get _effectivePath() {
    if (this.navigateWithHash) {
      return parseHashToPathContext(this._locationHash);
    }
    return this.pathContext ?? null;
  }

  get _breadcrumbSegments() {
    const p = this._effectivePath;
    return p?.pathSegments ?? [];
  }

  get _currentPathKey() {
    const p = this._effectivePath;
    if (!p) return '';
    return p.pathSegments.join('/');
  }

  get _displayItems() {
    const q = this._searchQuery;
    const byName = filterItemsByQuery(this._rawItems, q);
    const byKind = filterItemsByKind(byName, this._typeFilter);
    return filterItemsByFormatKind(byKind, this._formatFilter);
  }

  get _activeFilterChipCount() {
    let count = 0;
    if (this._typeFilter !== 'all') count += 1;
    if (this._formatFilter !== 'all') count += 1;
    return count;
  }

  get _isSingleHtmlSelected() {
    if (this._selectedRows.length !== 1) return false;
    const pathKey = this._selectedRows[0];
    const item = findItemByRowKey(pathKey, this._rawItems, this._currentPathKey);
    return item && (item.ext === 'html' || (item.name || '').toLowerCase().endsWith('.html'));
  }

  get _hasFolderSelected() {
    const pathKey = this._currentPathKey;
    return this._selectedRows.some((pathValue) => {
      const item = findItemByRowKey(pathValue, this._rawItems, pathKey);
      return item && !item.ext;
    });
  }

  _boundHash = () => {
    this._locationHash = window.location.hash;
  };

  _updateHashNavigationSubscription() {
    window.removeEventListener('hashchange', this._boundHash);
    if (!this.navigateWithHash) return;
    this._locationHash = window.location.hash;
    window.addEventListener('hashchange', this._boundHash);
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._updateHashNavigationSubscription();
  }

  disconnectedCallback() {
    window.removeEventListener('hashchange', this._boundHash);
    super.disconnectedCallback();
  }

  willUpdate(changedProperties) {
    super.willUpdate(changedProperties);
    if (this._initialQueryApplied) return;
    if (!changedProperties.has('initialQuery')) return;
    const seedQuery = this.initialQuery;
    if (seedQuery) {
      this._searchQuery = seedQuery;
      this._initialQueryApplied = true;
    }
  }

  updated(changedProperties) {
    super.updated(changedProperties);
    if (changedProperties.has('navigateWithHash')) {
      this._updateHashNavigationSubscription();
    }
  }

  _closeRenameDialogIfOpen() {
    if (!this._renameOpen) return;
    this._resetRenameDialog();
  }

  _resetRenameDialog() {
    this._renameOpen = false;
    this._renameSourceDaPath = '';
    this._renameDraft = '';
    this._renameError = '';
    this._renameSourceFileExt = '';
  }

  _resetDeleteDialog() {
    this._deleteDialogOpen = false;
    this._deleteDialogIntro = '';
    this._deleteDialogPaths = [];
    this._pendingDeleteDaPaths = [];
  }

  _closeDeleteDialogIfOpen() {
    if (!this._deleteDialogOpen) return;
    this._resetDeleteDialog();
  }

  _onFolderSyncStart() {
    this._closeRenameDialogIfOpen();
    this._closeDeleteDialogIfOpen();
    this._selectedRows = [];
  }

  /**
   * @param {CustomEvent<{ rawItems: object[], loading: boolean,
   *   error: string | null, currentPathKey: string, permissions?: string[] }>} event
   */
  _onFolderState(event) {
    const d = event.detail;
    if (!d) return;
    this._rawItems = d.rawItems ?? [];
    this._loading = !!d.loading;
    this._error = d.error ?? null;
    this._listPermissions = d.permissions;
    this._normalizeFormatFilter();
  }

  async _onBrowseNewItem() {
    await this._refreshFolder();
  }

  _onBrowseNewError(event) {
    const msg = event.detail?.message || 'Create failed';
    this._showToast(msg, 'negative');
  }

  _normalizeFormatFilter() {
    if (!FORMAT_FILTER_VALUES.has(this._formatFilter)) {
      this._formatFilter = 'all';
      return;
    }
    if (this._formatFilter === 'all') return;
    const wantedKind = this._formatFilter;
    const hasMatch = this._rawItems.some(
      (row) => row.ext && fileKindFromExtension(row.ext) === wantedKind,
    );
    if (!hasMatch) this._formatFilter = 'all';
  }

  async _refreshFolder() {
    await this._folderRef.value?.syncFromPath?.();
  }

  _emitNavigate(pathKey) {
    this.dispatchEvent(
      new CustomEvent('sl-content-browser-navigate', {
        detail: { pathKey },
        bubbles: true,
        composed: true,
      }),
    );
    if (this.navigateWithHash && pathKey) {
      window.location.hash = `#/${pathKey}`;
      this._locationHash = window.location.hash;
    }
  }

  _onBreadcrumbNavigate(event) {
    const pathKey = event.detail?.pathKey;
    if (pathKey) this._emitNavigate(pathKey);
  }

  _onOpenFolder(event) {
    const pathKey = event.detail?.pathKey;
    if (pathKey) this._emitNavigate(pathKey);
  }

  _onSearchChange(event) {
    this._searchQuery = event.detail?.value ?? '';
  }

  _onTableSelection(event) {
    this._selectedRows = event.detail?.selected ?? [];
  }

  _onActionBarClose() {
    this._selectedRows = [];
  }

  _emitBulkFileAction(eventName) {
    this.dispatchEvent(new CustomEvent(eventName, { bubbles: true, composed: true }));
  }

  _onBulkMoveRequest() {
    this._emitBulkFileAction('sl-file-request-move');
  }

  _renderSelectionToolbar() {
    return html`
      <sl-browse-selection-toolbar
        .selectedCount="${this._selectedRows.length}"
        ?show-publish-actions="${!this._hasFolderSelected && !!this.saveToAem}"
        ?publish-loading="${this._publishLoading}"
        ?rename-enabled="${!!this.renameItem}"
        ?rename-loading="${this._renameLoading}"
        ?delete-enabled="${!!this.deleteItem}"
        ?delete-loading="${this._deleteLoading}"
        ?move-enabled="${this.moveEnabled}"
        ?show-edit-action="${this._isSingleHtmlSelected}"
        @sl-action-bar-close="${this._onActionBarClose}"
        @sl-file-request-preview="${this._onPreview}"
        @sl-file-request-publish="${this._onPublish}"
        @sl-file-request-rename="${this._onRename}"
        @sl-file-request-move="${this._onBulkMoveRequest}"
        @sl-file-request-delete="${this._onDelete}"
        @sl-file-request-edit="${this._onEdit}"
      ></sl-browse-selection-toolbar>
    `;
  }

  _onTypeFilterChipChange(event) {
    const value = event.detail?.value;
    if (value) this._typeFilter = value;
  }

  _onFormatFilterChipChange(event) {
    const value = event.detail?.value;
    if (value) this._formatFilter = value;
  }

  _onClearAllFilters() {
    this._typeFilter = 'all';
    this._formatFilter = 'all';
  }

  _renderFilterRow() {
    const showClearAll = this._activeFilterChipCount > 0;
    return html`
      <div class="sl-content-browser-type-filter-row">
        <sl-filter-chip
          placeholder="Kind"
          clear-value="all"
          accessible-name="Kind filter"
          clear-label="Clear kind filter"
          .value="${this._typeFilter}"
          .options="${TYPE_FILTER_OPTIONS}"
          @sl-filter-chip-change="${this._onTypeFilterChipChange}"
        ></sl-filter-chip>
        <sl-filter-chip
          placeholder="Format"
          clear-value="all"
          accessible-name="Format filter"
          clear-label="Clear format filter"
          .value="${this._formatFilter}"
          .options="${FORMAT_FILTER_OPTIONS}"
          @sl-filter-chip-change="${this._onFormatFilterChipChange}"
        ></sl-filter-chip>
        ${showClearAll
        ? html`
              <sp-action-button
                class="sl-content-browser-clear-filters"
                size="s"
                quiet
                label="Clear all filters"
                @click="${this._onClearAllFilters}"
              >
                Clear filters
              </sp-action-button>
            `
        : ''}
      </div>
    `;
  }

  async _onPreview(event) {
    if (!this.saveToAem) return;
    const paths = getAemPathsForSelection(event.detail?.pathKey, {
      selectedRows: this._selectedRows,
      items: this._rawItems,
      folderPathKey: this._currentPathKey,
    });
    if (paths.length === 0) return;
    this._publishLoading = true;
    try {
      await this._browseActions.preview(paths);
    } finally {
      this._publishLoading = false;
    }
  }

  async _onPublish(event) {
    if (!this.saveToAem) return;
    const paths = getAemPathsForSelection(event.detail?.pathKey, {
      selectedRows: this._selectedRows,
      items: this._rawItems,
      folderPathKey: this._currentPathKey,
    });
    if (paths.length === 0) return;
    this._publishLoading = true;
    try {
      await this._browseActions.publish(paths);
    } finally {
      this._publishLoading = false;
    }
  }

  _onEdit(event) {
    const targetPathKey = resolveCanvasEditPathKey(event.detail?.pathKey, {
      selectedRows: this._selectedRows,
      items: this._rawItems,
      folderPathKey: this._currentPathKey,
      isSingleHtmlSelected: this._isSingleHtmlSelected,
    });
    if (!targetPathKey) return;
    const href = buildCanvasEditHref(this.canvasEditBase, targetPathKey, window.location.search || '');
    window.location.assign(href);
  }

  _onRenameDialogClose() {
    this._resetRenameDialog();
  }

  _onRenameDialogCancel() {
    if (this._renameLoading) return;
    this._resetRenameDialog();
  }

  async _onRenameDialogConfirm(event) {
    if (this._renameLoading) return;
    const sourceDaPath = this._renameSourceDaPath;
    if (!sourceDaPath || !this.renameItem) return;

    const trimmed = (event.detail?.value ?? this._renameDraft ?? '').trim();
    this._renameError = '';

    if (!trimmed) {
      this._renameError = 'Enter a name.';
      return;
    }
    if (trimmed.includes('/')) {
      this._renameError = 'Use a file name only (no slashes).';
      return;
    }
    const ext = this._renameSourceFileExt || '';
    const base = daRenameDestinationBasename(trimmed, ext || undefined);
    const destinationDaPath = daRenameDestinationPath(sourceDaPath, base);
    if (!destinationDaPath) {
      this._renameError = 'Could not build destination path.';
      return;
    }
    if (destinationDaPath === sourceDaPath) {
      this._resetRenameDialog();
      return;
    }

    this._renameLoading = true;
    try {
      const result = await this.renameItem(sourceDaPath, destinationDaPath);
      if (!result?.ok) {
        // eslint-disable-next-line no-console
        console.error('[sl-content-browser] Rename failed', sourceDaPath, destinationDaPath, result?.error);
        this._renameError = result?.error || 'Rename failed';
        return;
      }
      this._resetRenameDialog();
      this._selectedRows = [];
      await this._refreshFolder();
    } finally {
      this._renameLoading = false;
    }
  }

  _onRename(event) {
    if (!this.renameItem) return;
    const pathKeyFromDetail = event.detail?.pathKey;
    const rowKeys = pathKeyFromDetail ? [pathKeyFromDetail] : [...this._selectedRows];
    if (rowKeys.length !== 1) return;

    const folderPathKey = this._currentPathKey;
    const [rowKey] = rowKeys;
    const item = findItemByRowKey(rowKey, this._rawItems, folderPathKey);
    if (!item) return;

    const sourceDaPath = daSourcePathForItem(item, rowKey, folderPathKey);
    if (!sourceDaPath) return;

    const currentName = item.name || '';
    this._renameSourceDaPath = sourceDaPath;
    this._renameDraft = currentName;
    this._renameError = '';
    this._renameSourceFileExt = item.ext ? String(item.ext) : '';
    this._renameOpen = true;
  }

  _onDelete(event) {
    if (!this.deleteItem) return;
    const pathKeyFromDetail = event.detail?.pathKey;
    const rowKeys = pathKeyFromDetail ? [pathKeyFromDetail] : [...this._selectedRows];
    if (rowKeys.length === 0) return;

    const folderPathKey = this._currentPathKey;
    const resolved = resolveDeleteTargets(rowKeys, this._rawItems, folderPathKey);
    if (resolved.length === 0) return;

    const { intro, paths } = buildDeleteDialogContent(resolved);
    this._deleteDialogIntro = intro;
    this._deleteDialogPaths = paths;
    this._pendingDeleteDaPaths = resolved.map((r) => r.daPath);
    this._deleteDialogOpen = true;
  }

  _onDeleteDialogClose() {
    if (this._deleteLoading) return;
    this._resetDeleteDialog();
  }

  _onDeleteDialogCancel() {
    if (this._deleteLoading) return;
    this._resetDeleteDialog();
  }

  async _onDeleteDialogConfirm() {
    const daPaths = [...this._pendingDeleteDaPaths];
    if (daPaths.length === 0 || !this.deleteItem) {
      this._resetDeleteDialog();
      return;
    }
    if (this._deleteLoading) return;

    this._deleteLoading = true;
    try {
      const result = await this._browseActions.batchDelete(daPaths);
      this._resetDeleteDialog();
      this._selectedRows = [];
      await this._refreshFolder();
      if (result.ok) {
        const n = daPaths.length;
        this._showToast(n === 1 ? 'Item deleted.' : `${n} items deleted.`, 'positive');
      } else {
        this._showToast(result.error, 'negative');
      }
    } finally {
      this._deleteLoading = false;
    }
  }

  /**
   * @param {string} text
   * @param {'info' | 'positive' | 'negative'} variant
   */
  _showToast(text, variant) {
    this._toastText = text;
    this._toastVariant = variant;
    this._toastOpen = true;
  }

  _onToastClose() {
    this._toastOpen = false;
  }

  _renderFilesPanel() {
    const pathInfo = this._effectivePath;
    const items = this._displayItems;

    if (!pathInfo) {
      return html`
        <div class="sl-content-browser-hint">
          Set URL hash to <code>#/org/site</code> or <code>#/org/site/path</code> to browse.
        </div>
      `;
    }

    if (this._error) {
      return html`<div class="sl-content-browser-error" role="alert">${this._error}</div>`;
    }

    const initialLoading = this._loading && this._rawItems.length === 0;

    return html`
      <sl-browse-body
        class="sl-content-browser-body-host"
        .items="${items}"
        ?initial-loading="${initialLoading}"
        current-path-key="${this._currentPathKey}"
        .selectedRows="${this._selectedRows}"
        @sl-table-selection-change="${this._onTableSelection}"
        @sl-open-folder="${this._onOpenFolder}"
        @sl-file-request-edit="${this._onEdit}"
      ></sl-browse-body>
    `;
  }

  render() {
    return html`
      <div class="sl-content-browser-host">
        <sl-browse-folder
          ${ref(this._folderRef)}
          .pathInfo="${this._effectivePath}"
          .listFolder="${this.listFolder}"
          .aemEnrichListItems="${this.aemEnrichListItems}"
          @sl-browse-folder-sync-start="${this._onFolderSyncStart}"
          @sl-browse-folder-state="${this._onFolderState}"
        ></sl-browse-folder>
        <div class="sl-content-browser">
          <div class="sl-content-browser-column">
            <div class="sl-content-browser-header">
              <div class="sl-content-browser-search-row">
                <sl-browse-search
                  class="sl-content-browser-search"
                  .value="${this._searchQuery}"
                  placeholder="Search in folder"
                  label="Search"
                  @sl-search-change="${this._onSearchChange}"
                ></sl-browse-search>
              </div>
              <div class="sl-content-browser-breadcrumb-row">
                <sl-browse-breadcrumbs
                  class="sl-content-browser-breadcrumbs"
                  .segments="${this._breadcrumbSegments}"
                  @sl-browse-navigate="${this._onBreadcrumbNavigate}"
                ></sl-browse-breadcrumbs>
                <sl-browse-new
                  class="sl-content-browser-new"
                  folder-fullpath="${this._effectivePath?.fullpath ?? ''}"
                  canvas-edit-base="${this.canvasEditBase}"
                  sheet-edit-base="${this.sheetEditBase}"
                  .permissions="${this._listPermissions}"
                  .saveToSource="${this.saveToSource}"
                  @sl-browse-new-item="${this._onBrowseNewItem}"
                  @sl-browse-new-error="${this._onBrowseNewError}"
                ></sl-browse-new>
              </div>
              <div class="sl-content-browser-toolbar-slot">
                ${this._selectedRows.length > 0 ? this._renderSelectionToolbar() : this._renderFilterRow()}
              </div>
            </div>
            <div class="sl-content-browser-body">${this._renderFilesPanel()}</div>
          </div>
        </div>
        <sl-browse-rename-dialog
          .open="${this._renameOpen}"
          .loading="${this._renameLoading}"
          .error="${this._renameError}"
          .value="${this._renameDraft}"
          @sl-browse-rename-dialog-close="${this._onRenameDialogClose}"
          @sl-browse-rename-dialog-cancel="${this._onRenameDialogCancel}"
          @sl-browse-rename-dialog-confirm="${this._onRenameDialogConfirm}"
        ></sl-browse-rename-dialog>
        <sl-browse-delete-dialog
          .open="${this._deleteDialogOpen}"
          .loading="${this._deleteLoading}"
          .intro="${this._deleteDialogIntro}"
          .paths="${this._deleteDialogPaths}"
          @sl-browse-delete-dialog-close="${this._onDeleteDialogClose}"
          @sl-browse-delete-dialog-cancel="${this._onDeleteDialogCancel}"
          @sl-browse-delete-dialog-confirm="${this._onDeleteDialogConfirm}"
        ></sl-browse-delete-dialog>
        <sl-browse-toast-host
          .open="${this._toastOpen}"
          .text="${this._toastText}"
          .variant="${this._toastVariant}"
          @sl-browse-toast-close="${this._onToastClose}"
        ></sl-browse-toast-host>
      </div>
    `;
  }
}

customElements.define('sl-content-browser', SlContentBrowser);
