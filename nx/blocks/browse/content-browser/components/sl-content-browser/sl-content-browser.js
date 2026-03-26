// eslint-disable-next-line import/no-unresolved
import getStyle from 'https://da.live/nx/utils/styles.js';
// eslint-disable-next-line import/no-unresolved
import { LitElement, html, createRef, ref } from 'da-lit';
import { parseHashToPathContext } from '../../api/da-browse-api.js';
import { daFetch } from '../../../../../utils/daFetch.js';
import { DA_ORIGIN } from '../../../../../public/utils/constants.js';
import { crawl } from '../../../../../public/utils/tree.js';
import {
  SL_CONTENT_BROWSER_CHAT_CONTEXT,
  SL_CONTENT_BROWSER_LIST_PERMISSIONS,
  buildBrowseChatContextItems,
  mergeBrowseChatContextItems,
  buildCanvasEditHref,
  buildDeleteDialogContent,
  createBrowseActions,
  dispatchBulkAemOpen,
  resolveBulkAemPathsExpandingFolders,
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
  findItemByRowKey,
  parentFolderPathKey,
} from '../../lib/content-browser-utils.js';
import '../sl-browse-body/sl-browse-body.js';
import '../sl-browse-delete-dialog/sl-browse-delete-dialog.js';
import '../sl-browse-folder/sl-browse-folder.js';
import '../sl-browse-rename-dialog/sl-browse-rename-dialog.js';
import '../sl-browse-search/sl-browse-search.js';
import '../sl-browse-selection-toolbar/sl-browse-selection-toolbar.js';
import '../sl-browse-toast-host/sl-browse-toast-host.js';

const style = await getStyle(import.meta.url);

const FORMAT_FILTER_VALUES = new Set(['all', 'document', 'sheet', 'media']);

/** Match inside file body via GET /source (same subset as legacy `da-search`). */
const CONTENT_SEARCH_SOURCE_SUFFIXES = ['.html', '.json', '.svg'];
const CONTENT_SEARCH_CRAWL_CONCURRENT = 20;

/**
 * @param {{ path?: string, name?: string }} entry
 * @param {string} currentPathKey
 */
function crawlItemRowKey(entry, currentPathKey) {
  return ((entry.path || '').replace(/^\//, '') || `${currentPathKey}/${entry.name}`)
    .replace(/\/+/g, '/');
}

/** Single-picker model for kind + format (toolbar). */
const COMBINED_FILTER_OPTIONS = [
  { value: 'all', typeFilter: 'all', formatFilter: 'all', label: 'All', icon: 'all' },
  { value: 'folder', typeFilter: 'folder', formatFilter: 'all', label: 'Folders', icon: 'folder' },
  {
    value: 'file-document',
    typeFilter: 'file',
    formatFilter: 'document',
    label: FILE_KIND_LABEL.document,
    icon: 'document',
  },
  {
    value: 'file-sheet',
    typeFilter: 'file',
    formatFilter: 'sheet',
    label: FILE_KIND_LABEL.sheet,
    icon: 'sheet',
  },
  {
    value: 'file-media',
    typeFilter: 'file',
    formatFilter: 'media',
    label: FILE_KIND_LABEL.media,
    icon: 'media',
  },
];

/** @param {'all' | 'folder' | 'document' | 'sheet' | 'media'} iconKind */
function combinedFilterMenuItemIcon(iconKind) {
  switch (iconKind) {
    case 'folder':
      return html`<sp-icon-folder slot="icon" size="s"></sp-icon-folder>`;
    case 'document':
      return html`<sp-icon-file-text slot="icon" size="s"></sp-icon-file-text>`;
    case 'sheet':
      return html`<sp-icon-table slot="icon" size="s"></sp-icon-table>`;
    case 'media':
      return html`<sp-icon-image slot="icon" size="s"></sp-icon-image>`;
    default:
      return html`<sp-icon-table slot="icon" size="s"></sp-icon-table>`;
  }
}

/**
 * Search-first folder browser: composes header, `sl-browse-folder` sync, table, dialogs.
 *
 * @fires sl-content-browser-navigate - detail: { pathKey: string }
 * @fires sl-content-browser-chat-context - detail: { items: object[] } for `da-chat` context pills
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
    _rawItems: { state: true },
    _loading: { state: true },
    _error: { state: true },
    _searchQuery: { state: true },
    /** When true, search also loads `.html` / `.json` / `.svg` source and matches query in body. */
    _searchFileContents: { state: true },
    /** Files under the current folder matching {@link _searchQuery} (via {@link crawl}). */
    _searchCrawlItems: { state: true },
    _searchCrawlLoading: { state: true },
    _typeFilter: { state: true },
    _formatFilter: { state: true },
    _selectedRows: { state: true },
    /**
     * Folder path opened via row click (before sync clears selection). Fed into chat context on
     * `sl-browse-folder-sync-start` together with the pre-clear selection.
     */
    _pendingOpenedFolderPathKey: { state: true },
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
    this._rawItems = [];
    this._loading = false;
    this._error = null;
    this._searchQuery = '';
    this._searchFileContents = false;
    this._searchCrawlItems = [];
    this._searchCrawlLoading = false;
    this._typeFilter = 'all';
    this._formatFilter = 'all';
    this._selectedRows = [];
    this._pendingOpenedFolderPathKey = null;
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
    this._browseActions = createBrowseActions(this);
    this._folderRef = createRef();
    /** @type {(() => void) | null} */
    this._cancelSearchCrawl = null;
    /** @type {number} */
    this._searchCrawlGen = 0;
    /** @type {string | undefined} Last path key for clearing search on navigation. */
    this._browsePathKeyPrevious = undefined;
  }

  get _effectivePath() {
    if (this.navigateWithHash) {
      return parseHashToPathContext(this._locationHash);
    }
    return this.pathContext ?? null;
  }

  get _currentPathKey() {
    const p = this._effectivePath;
    if (!p) return '';
    return p.pathSegments.join('/');
  }

  /** Parent folder key, or empty at `org/site` (same rule as breadcrumbs root). */
  get _parentPathKey() {
    return parentFolderPathKey(this._currentPathKey);
  }

  /** Items used to resolve row keys (current folder list or subtree crawl matches). */
  get _itemsForRowLookup() {
    return (this._searchQuery || '').trim() ? this._searchCrawlItems : this._rawItems;
  }

  get _displayItems() {
    const q = (this._searchQuery || '').trim();
    const byName = q ? this._searchCrawlItems : this._rawItems;
    const byKind = filterItemsByKind(byName, this._typeFilter);
    return filterItemsByFormatKind(byKind, this._formatFilter);
  }

  /** `sp-picker` value derived from `_typeFilter` + `_formatFilter`. */
  get _combinedFilterValue() {
    const t = this._typeFilter;
    const f = this._formatFilter;
    if (t === 'folder') return 'folder';
    if (t === 'file') {
      if (f === 'document') return 'file-document';
      if (f === 'sheet') return 'file-sheet';
      if (f === 'media') return 'file-media';
    }
    if (t === 'all' && f === 'all') return 'all';
    if (f === 'document') return 'file-document';
    if (f === 'sheet') return 'file-sheet';
    if (f === 'media') return 'file-media';
    return 'all';
  }

  get _isSingleHtmlSelected() {
    if (this._selectedRows.length !== 1) return false;
    const pathKey = this._selectedRows[0];
    const item = findItemByRowKey(pathKey, this._itemsForRowLookup, this._currentPathKey);
    return item && (item.ext === 'html' || (item.name || '').toLowerCase().endsWith('.html'));
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
    this._cancelActiveSearchCrawl();
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
    if (this._typeFilter === 'file' && this._formatFilter === 'all') {
      this._typeFilter = 'all';
      this._formatFilter = 'all';
    }
    const pathAffected = changedProperties.has('pathContext')
      || changedProperties.has('navigateWithHash')
      || changedProperties.has('_locationHash');
    if (pathAffected) {
      const key = this._currentPathKey;
      const prev = this._browsePathKeyPrevious;
      if (prev !== undefined && prev !== '' && key !== prev) {
        if ((this._searchQuery || '').trim()) {
          this._typeFilter = 'all';
          this._formatFilter = 'all';
        }
        this._searchQuery = '';
      }
      this._browsePathKeyPrevious = key;
    }
    const searchAffected = changedProperties.has('_searchQuery')
      || changedProperties.has('_searchFileContents');
    if (pathAffected || searchAffected) {
      this._syncSubtreeSearchWithCrawl();
    }
  }

  _cancelActiveSearchCrawl() {
    if (this._cancelSearchCrawl) {
      this._cancelSearchCrawl();
      this._cancelSearchCrawl = null;
    }
  }

  /**
   * Fetches AEM preview/publish status for search hits (see `sl-browse-folder` for folder list).
   * @param {object[]} items
   * @param {string} fullpath
   * @param {number} crawlGen
   */
  _scheduleSearchAemEnrich(items, fullpath, crawlGen) {
    const enrich = this.aemEnrichListItems;
    if (!enrich || !fullpath || items.length === 0) return;
    Promise.resolve(enrich(items, fullpath))
      .then((enriched) => {
        if (crawlGen !== this._searchCrawlGen) return;
        if ((this._searchQuery || '').trim() === '') return;
        if (!Array.isArray(enriched)) return;
        this._searchCrawlItems = enriched;
        this.requestUpdate();
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[sl-content-browser] search aemEnrichListItems failed', err);
      });
  }

  /**
   * @param {number} crawlGen
   */
  _onSearchCrawlSettled(crawlGen) {
    if (crawlGen !== this._searchCrawlGen) return;
    this._searchCrawlLoading = false;
    this._cancelSearchCrawl = null;
    const items = this._searchCrawlItems;
    const fullpath = this._effectivePath?.fullpath;
    if (fullpath && items.length > 0) {
      this._scheduleSearchAemEnrich([...items], fullpath, crawlGen);
    }
    this.requestUpdate();
  }

  /**
   * Subtree file search using {@link crawl} (DA SDK recipe: stream list under a path).
   * @see https://docs.da.live/developers/reference/sdk-recipes#stream-list-of-pages-under-a-path
   */
  _syncSubtreeSearchWithCrawl() {
    const q = (this._searchQuery || '').trim();
    const pathInfo = this._effectivePath;
    if (!q || !pathInfo?.fullpath) {
      this._cancelActiveSearchCrawl();
      this._searchCrawlItems = [];
      this._searchCrawlLoading = false;
      this._searchCrawlGen += 1;
      return;
    }

    this._cancelActiveSearchCrawl();
    this._searchCrawlGen += 1;
    const gen = this._searchCrawlGen;
    this._searchCrawlItems = [];
    this._searchCrawlLoading = true;

    const qLower = q.toLowerCase();
    /** @type {Map<string, object>} */
    const matched = new Map();
    const rowPathKey = this._currentPathKey;

    const pushMatch = (entry) => {
      if (gen !== this._searchCrawlGen) return;
      const key = crawlItemRowKey(entry, rowPathKey);
      if (matched.has(key)) return;
      matched.set(key, entry);
      this._searchCrawlItems = [...matched.values()];
      this.requestUpdate();
    };

    const nameMatches = (entry) => (entry.name || '').toLowerCase().includes(qLower);

    /** @type {(entry: object) => void | Promise<void>} */
    let callback;

    if (!this._searchFileContents) {
      callback = (file) => {
        if (gen !== this._searchCrawlGen) return;
        if (nameMatches(file)) pushMatch(file);
      };
    } else {
      callback = async (entry) => {
        if (gen !== this._searchCrawlGen) return;
        const isFolder = !entry.ext;
        if (isFolder) {
          if (nameMatches(entry)) pushMatch(entry);
          return;
        }
        const pathStr = entry.path || '';
        const canScanBody = CONTENT_SEARCH_SOURCE_SUFFIXES.some((s) => pathStr.endsWith(s));
        if (!canScanBody) {
          if (nameMatches(entry)) pushMatch(entry);
          return;
        }
        if (nameMatches(entry)) {
          pushMatch(entry);
          return;
        }
        try {
          const resp = await daFetch(`${DA_ORIGIN}/source${pathStr}`);
          if (!resp.ok) return;
          const text = await resp.text();
          if (gen !== this._searchCrawlGen) return;
          if (text.toLowerCase().includes(qLower)) pushMatch(entry);
        } catch {
          /* skip failed reads */
        }
      };
    }

    /** @type {Parameters<typeof crawl>[0]} */
    const crawlOpts = {
      path: pathInfo.fullpath,
      callback,
      throttle: 10,
      includeFolders: true,
    };
    if (this._searchFileContents) {
      crawlOpts.concurrent = CONTENT_SEARCH_CRAWL_CONCURRENT;
    }

    const { results, cancelCrawl } = crawl(crawlOpts);
    this._cancelSearchCrawl = cancelCrawl;

    results
      .then(() => this._onSearchCrawlSettled(gen))
      .catch(() => this._onSearchCrawlSettled(gen));
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
    const prevSelected = [...this._selectedRows];
    const openedFolderKey = this._pendingOpenedFolderPathKey;
    this._pendingOpenedFolderPathKey = null;
    this._selectedRows = [];
    if (openedFolderKey) {
      this._emitBrowseChatContextFromRows(prevSelected, openedFolderKey);
    } else {
      this._emitChatContextFromSelection();
    }
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
    this._normalizeFormatFilter();
    this.dispatchEvent(
      new CustomEvent(SL_CONTENT_BROWSER_LIST_PERMISSIONS, {
        bubbles: true,
        composed: true,
        detail: { permissions: d.permissions },
      }),
    );
  }

  _normalizeFormatFilter() {
    if (!FORMAT_FILTER_VALUES.has(this._formatFilter)) {
      this._formatFilter = 'all';
      return;
    }
    if (this._formatFilter === 'all') return;
    const wantedKind = this._formatFilter;
    const pool = (this._searchQuery || '').trim() ? this._searchCrawlItems : this._rawItems;
    const hasMatch = pool.some(
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

  _onOpenFolder(event) {
    const pathKey = event.detail?.pathKey;
    if (!pathKey) return;
    const norm = String(pathKey).replace(/^\/+/, '').trim();
    const rowItem = findItemByRowKey(norm, this._itemsForRowLookup, this._currentPathKey);
    this._pendingOpenedFolderPathKey = rowItem && !rowItem.ext ? norm : null;
    this._emitNavigate(pathKey);
  }

  _onSearchChange(event) {
    const next = event.detail?.value ?? '';
    const prevTrim = (this._searchQuery || '').trim();
    const nextTrim = (next || '').trim();
    this._searchQuery = next;
    if (prevTrim !== nextTrim) {
      this._typeFilter = 'all';
      this._formatFilter = 'all';
    }
  }

  /**
   * @param {CustomEvent<{ value?: boolean }>} event
   */
  _onSearchFileContentsChange(event) {
    this._searchFileContents = !!event.detail?.value;
  }

  _onTableSelection(event) {
    this._selectedRows = event.detail?.selected ?? [];
    this._emitChatContextFromSelection();
  }

  _onActionBarClose() {
    this._selectedRows = [];
    this._emitChatContextFromSelection();
  }

  /**
   * Maps the current selection (files and folders) to `da-chat` footer pills (same contract as
   * canvas `onPageContextItems`). Dispatches `sl-content-browser-chat-context` upward.
   *
   * @param {string[]} selectedRows - Row keys before any sync-time reset.
   * @param {string | null} extraOpenedFolderPathKey - Normalized path key from folder row open.
   */
  _emitBrowseChatContextFromRows(selectedRows, extraOpenedFolderPathKey) {
    const folderPathKey = this._currentPathKey;
    const pool = this._itemsForRowLookup;
    let items = buildBrowseChatContextItems(selectedRows, pool, folderPathKey);
    if (extraOpenedFolderPathKey) {
      const extra = buildBrowseChatContextItems([extraOpenedFolderPathKey], pool, folderPathKey);
      items = mergeBrowseChatContextItems(items, extra);
    }
    this.dispatchEvent(
      new CustomEvent(SL_CONTENT_BROWSER_CHAT_CONTEXT, {
        bubbles: true,
        composed: true,
        detail: { items },
      }),
    );
  }

  _emitChatContextFromSelection() {
    this._emitBrowseChatContextFromRows(this._selectedRows, null);
  }

  /**
   * Removes one row key from the table selection (e.g. user removed a chat context pill).
   * @param {string} pathKey - Repo path key (`org/site/...`), with or without leading `/`.
   */
  removeSelectionPathKey(pathKey) {
    const norm = String(pathKey || '').replace(/^\/+/, '').trim();
    if (!norm) return;
    this._selectedRows = this._selectedRows.filter(
      (k) => String(k).replace(/^\/+/, '').trim() !== norm,
    );
    this._emitChatContextFromSelection();
  }

  /**
   * Rebuilds browse → chat context from the current selection (after a message is sent).
   */
  resyncChatContextAfterMessage() {
    this._emitChatContextFromSelection();
  }

  _renderSelectionToolbar() {
    return html`
      <sl-browse-selection-toolbar
        .selectedCount="${this._selectedRows.length}"
        ?show-publish-actions="${!!this.saveToAem}"
        ?publish-loading="${this._publishLoading}"
        ?rename-enabled="${!!this.renameItem}"
        ?rename-loading="${this._renameLoading}"
        ?delete-enabled="${!!this.deleteItem}"
        ?delete-loading="${this._deleteLoading}"
        ?show-edit-action="${this._isSingleHtmlSelected}"
        @sl-action-bar-close="${this._onActionBarClose}"
        @sl-file-request-preview="${this._onPreview}"
        @sl-file-request-publish="${this._onPublish}"
        @sl-file-request-rename="${this._onRename}"
        @sl-file-request-delete="${this._onDelete}"
        @sl-file-request-edit="${this._onEdit}"
      ></sl-browse-selection-toolbar>
    `;
  }

  _onCombinedKindFilterChange(event) {
    const v = /** @type {HTMLElement & { value?: string }} */ (event.target)?.value;
    const opt = COMBINED_FILTER_OPTIONS.find((o) => o.value === v);
    if (!opt) return;
    this._typeFilter = opt.typeFilter;
    this._formatFilter = opt.formatFilter;
  }

  _renderKindFilterPicker() {
    return html`
      <sp-field-label for="sl-cb-combined-filter" side-aligned="start">Kind</sp-field-label>
      <sp-picker
        id="sl-cb-combined-filter"
        class="sl-content-browser-kind-filter-picker"
        quiet
        size="m"
        .value="${this._combinedFilterValue}"
        @change="${this._onCombinedKindFilterChange}"
      >
        ${COMBINED_FILTER_OPTIONS.map(
      (o) => html`
            <sp-menu-item value="${o.value}">
              ${combinedFilterMenuItemIcon(o.icon)}
              ${o.label}
            </sp-menu-item>
          `,
    )}
      </sp-picker>
    `;
  }

  /**
   * @param {CustomEvent} event
   * @param {'preview'|'publish'} mode
   */
  async _onBulkAemPreviewOrPublish(event, mode) {
    if (!this.saveToAem) return;
    const pathKeyFromEvent = event.detail?.pathKey;
    const ctx = {
      selectedRows: this._selectedRows,
      items: this._itemsForRowLookup,
      folderPathKey: this._currentPathKey,
    };
    if (!pathKeyFromEvent && ctx.selectedRows.length === 0) return;

    this._publishLoading = true;
    try {
      const paths = await resolveBulkAemPathsExpandingFolders(pathKeyFromEvent, ctx);
      if (paths.length === 0) {
        const msg = mode === 'publish'
          ? 'No files found to publish.'
          : 'No files found to preview.';
        this._showToast(msg, 'info');
        return;
      }
      dispatchBulkAemOpen(paths, mode);
    } finally {
      this._publishLoading = false;
    }
  }

  _onPreview(event) {
    return this._onBulkAemPreviewOrPublish(event, 'preview');
  }

  _onPublish(event) {
    return this._onBulkAemPreviewOrPublish(event, 'publish');
  }

  _onEdit(event) {
    const targetPathKey = resolveCanvasEditPathKey(event.detail?.pathKey, {
      selectedRows: this._selectedRows,
      items: this._itemsForRowLookup,
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
      this._renameError = 'Enter a file name.';
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
      this._emitChatContextFromSelection();
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
    const item = findItemByRowKey(rowKey, this._itemsForRowLookup, folderPathKey);
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
    const resolved = resolveDeleteTargets(rowKeys, this._itemsForRowLookup, folderPathKey);
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
      this._emitChatContextFromSelection();
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

  /** @public — e.g. browse toolbar `sl-browse-new` errors. */
  showToast(text, variant = 'info') {
    this._showToast(text, variant);
  }

  /** @public — after create from toolbar `sl-browse-new`. */
  refreshFolder() {
    return this._refreshFolder();
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

    const hasQuery = (this._searchQuery || '').trim().length > 0;
    const initialLoading = (!hasQuery && this._loading && this._rawItems.length === 0)
      || (hasQuery && this._searchCrawlLoading && items.length === 0);

    return html`
      <sl-browse-body
        class="sl-content-browser-body-host"
        .items="${items}"
        ?initial-loading="${initialLoading}"
        ?show-relative-path="${hasQuery}"
        current-path-key="${this._currentPathKey}"
        parent-path-key="${this._parentPathKey}"
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
              <div class="sl-content-browser-control-row">
                <div class="sl-content-browser-search-filter-stack">
                  ${this._selectedRows.length > 0
        ? html`
                        <div class="sl-content-browser-action-row">
                          <div class="sl-content-browser-action-slot">
                            ${this._renderSelectionToolbar()}
                          </div>
                        </div>
                      `
        : html`
                        <div class="sl-content-browser-search-row">
                          <sl-browse-search
                            class="sl-content-browser-search sl-content-browser-header-search"
                            .value="${this._searchQuery}"
                            .searchFileContents="${this._searchFileContents}"
                            .debounceMs="${this._searchFileContents ? 480 : 200}"
                            placeholder="${this._searchFileContents
            ? 'Search in this folder and below, including file contents'
            : 'Search in this folder and below'}"
                            label="Search"
                            @sl-search-change="${this._onSearchChange}"
                            @sl-search-file-contents-change="${this._onSearchFileContentsChange}"
                          ></sl-browse-search>
                        </div>
                      `}
                  <div class="sl-content-browser-kind-filter-slot">
                    ${this._renderKindFilterPicker()}
                  </div>
                </div>
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
