import '../../deps/swc/dist/index.js';
import '../canvas/src/bootstrap-nx.js';
// eslint-disable-next-line import/no-unresolved
import getStyle from 'https://da.live/nx/utils/styles.js';
// eslint-disable-next-line import/no-unresolved
import { LitElement, html } from 'da-lit';
// eslint-disable-next-line import/no-unresolved
import { getNx } from 'https://da.live/scripts/utils.js';
import { initIms, daFetch } from '../../utils/daFetch.js';
// eslint-disable-next-line import/no-unresolved
import '../canvas/src/chat.js';

const style = await getStyle(import.meta.url);
const nxBase = getNx();

const DA_ORIGIN = 'https://admin.da.live';
const AEM_ORIGIN = 'https://admin.hlx.page';

/**
 * POST to AEM admin to preview or publish. Same contract as in space.js.
 * @param {string} path - Full pathname e.g. /org/site/path/to/page
 * @param {'preview'|'live'} action
 * @returns {Promise<{ preview?: { url: string }, live?: { url: string }, error?: object }>}
 */
async function saveToAem(path, action) {
  const [owner, repo, ...parts] = path.slice(1).toLowerCase().split('/');
  const aemPath = parts.join('/');
  const url = `${AEM_ORIGIN}/${action}/${owner}/${repo}/main/${aemPath}`;
  const ims = await initIms();
  const bearer = ims?.accessToken?.token ? `Bearer ${ims.accessToken.token}` : '';
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      ...(bearer ? { Authorization: bearer, 'x-content-source-authorization': bearer } : {}),
    },
  });
  if (!resp.ok) {
    const xError = resp.headers.get('x-error');
    return { error: { status: resp.status, message: xError || resp.statusText } };
  }
  return resp.json();
}

/**
 * Parse hash to path segments and fullpath for DA API.
 * Hash format: #/org/site or #/org/site/path/to/folder
 * @returns {{ pathSegments: string[], fullpath: string } | null}
 */
function getHashPath() {
  const hash = window.location.hash || '';
  const path = hash.replace(/^#\/?/, '').trim();
  if (!path) return null;
  const pathSegments = path.split('/').filter(Boolean);
  if (pathSegments.length < 2) return null;
  const fullpath = `/${pathSegments.join('/')}`;
  return { pathSegments, fullpath };
}

/**
 * Fetch list from DA API for the given fullpath.
 * @param {string} fullpath - e.g. /org/site or /org/site/folder
 * @returns {Promise<Array<{ name: string, path: string, ext?: string, lastModified?: string }>>}
 */
async function fetchList(fullpath) {
  const url = `${DA_ORIGIN}/list${fullpath}`;
  try {
    const resp = await daFetch(url);
    if (!resp.ok) {
      // eslint-disable-next-line no-console
      console.error('[da-browse-view] fetchList failed', { url, status: resp.status, statusText: resp.statusText });
      throw new Error(`List failed: ${resp.status}`);
    }
    const json = await resp.json();
    return Array.isArray(json) ? json : json?.items || [];
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[da-browse-view] fetchList error', { url, message: e?.message, cause: e?.cause });
    throw e;
  }
}

/**
 * Browse view: split view with chat on the left and files (breadcrumbs + table) on the right.
 * Table shows current folder; clicking a folder navigates in.
 * @customElement da-browse-view
 */
class BrowseView extends LitElement {
  static properties = {
    _chatOpen: { state: true },
    _hashPath: { state: true },
    _items: { state: true },
    _loading: { state: true },
    _error: { state: true },
    _selectedRows: { state: true },
    _tableSelects: { state: true },
    _publishLoading: { state: true },
  };

  constructor() {
    super();
    this._chatOpen = true;
    this._hashPath = null;
    this._items = [];
    this._loading = false;
    this._error = null;
    this._selectedRows = [];
    this._tableSelects = 'multiple';
    this._publishLoading = false;
  }

  _boundSyncFromHash = () => this._syncFromHash();

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._syncFromHash();
    window.addEventListener('hashchange', this._boundSyncFromHash);
  }

  disconnectedCallback() {
    window.removeEventListener('hashchange', this._boundSyncFromHash);
    super.disconnectedCallback();
  }

  updated(changed) {
    super.updated?.(changed);
    if ((changed.has('_items') || changed.has('_hashPath')) && this._items?.length > 0 && this._tableSelects === 'multiple') {
      requestAnimationFrame(() => {
        this._tableSelects = '';
        this.requestUpdate();
        requestAnimationFrame(() => {
          this._tableSelects = 'multiple';
          this.requestUpdate();
        });
      });
    }
  }

  async _syncFromHash() {
    const pathInfo = getHashPath();
    this._hashPath = pathInfo;
    this._error = null;
    this._selectedRows = [];
    if (!pathInfo) {
      this._items = [];
      return;
    }
    this._loading = true;
    try {
      const items = await fetchList(pathInfo.fullpath);
      this._items = items;
    } catch (e) {
      this._error = e?.message || 'Failed to load';
      this._items = [];
    } finally {
      this._loading = false;
    }
  }

  /* eslint-disable-next-line class-methods-use-this */
  _onBreadcrumbChange(e) {
    const { value } = e.detail || {};
    if (value != null && typeof value === 'string') {
      window.location.hash = `#/${value}`;
    }
  }

  _onTableChange(e) {
    const table = e.target;
    this._selectedRows = Array.isArray(table.selected) ? [...table.selected] : [];
  }

  /* eslint-disable-next-line class-methods-use-this */
  _onOpenFolder(e, pathKey) {
    e.stopPropagation();
    if (pathKey) window.location.hash = `#/${pathKey}`;
  }

  get _breadcrumbSegments() {
    if (!this._hashPath) return [];
    return this._hashPath.pathSegments;
  }

  get _currentPathKey() {
    if (!this._hashPath) return '';
    return this._hashPath.pathSegments.join('/');
  }

  /** True when exactly one row is selected and it is an HTML file */
  get _isSingleHtmlSelected() {
    if (this._selectedRows.length !== 1) return false;
    const pathKey = this._selectedRows[0];
    const item = this._items.find((i) => {
      const p = (i.path || '').replace(/^\//, '') || `${this._currentPathKey}/${i.name}`.replace(/\/+/g, '/');
      return p === pathKey;
    });
    return item && (item.ext === 'html' || (item.name || '').toLowerCase().endsWith('.html'));
  }

  /** Path key of the single selected item when _isSingleHtmlSelected */
  get _singleSelectedPathKey() {
    return this._isSingleHtmlSelected ? this._selectedRows[0] : null;
  }

  _onEdit() {
    const pathKey = this._singleSelectedPathKey;
    if (!pathKey) return;
    const search = window.location.search || '';
    const href = `https://da.live/canvas${search}#/${pathKey}`;
    window.location.assign(href);
  }

  _onActionBarClose() {
    this._selectedRows = [];
  }

  /** True if any selected row is a folder */
  get _hasFolderSelected() {
    const pathKey = this._currentPathKey;
    return this._selectedRows.some((pathValue) => {
      const item = this._items.find((i) => {
        const p = (i.path || '').replace(/^\//, '') || `${pathKey}/${i.name}`.replace(/\/+/g, '/');
        return p === pathValue;
      });
      return item && !item.ext;
    });
  }

  _getPathForAem() {
    if (this._selectedRows.length !== 1) return null;
    const raw = this._selectedRows[0];
    if (!raw || typeof raw !== 'string') return null;
    const path = `/${raw.replace(/^\//, '')}`;
    const segments = path.slice(1).split('/').filter(Boolean);
    return segments.length >= 2 ? path : null;
  }

  async _onPreview() {
    if (this._selectedRows.length > 1) return;
    const path = this._getPathForAem();
    if (!path) return;
    this._publishLoading = true;
    try {
      const json = await saveToAem(path, 'preview');
      if (json.error) {
        // eslint-disable-next-line no-console
        console.error('[da-browse-view] Preview failed', json.error);
        return;
      }
      const href = json.preview?.url;
      if (href) window.open(`${href}?nocache=${Date.now()}`, href);
    } finally {
      this._publishLoading = false;
    }
  }

  async _onPublish() {
    if (this._selectedRows.length > 1) return;
    const path = this._getPathForAem();
    if (!path) return;
    this._publishLoading = true;
    try {
      let json = await saveToAem(path, 'preview');
      if (json.error) {
        // eslint-disable-next-line no-console
        console.error('[da-browse-view] Preview (before publish) failed', json.error);
        return;
      }
      json = await saveToAem(path, 'live');
      if (json.error) {
        // eslint-disable-next-line no-console
        console.error('[da-browse-view] Publish failed', json.error);
        return;
      }
      const href = json.live?.url;
      if (href) window.open(`${href}?nocache=${Date.now()}`, href);
    } finally {
      this._publishLoading = false;
    }
  }

  /* eslint-disable-next-line class-methods-use-this */
  _renderPlayIcon() {
    return html`
      <svg class="browse-view-publish-icon" slot="icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M8 5v14l11-7z"/>
      </svg>
    `;
  }

  _renderBreadcrumbs() {
    const segments = this._breadcrumbSegments;
    if (segments.length === 0) {
      return html`
        <sp-breadcrumbs class="browse-view-breadcrumbs" label="Path">
          <sp-breadcrumb-item value="">Browse</sp-breadcrumb-item>
        </sp-breadcrumbs>
      `;
    }
    return html`
      <sp-breadcrumbs
        class="browse-view-breadcrumbs"
        label="Path"
        @change="${this._onBreadcrumbChange}"
      >
        ${segments.map((name, i) => {
    const pathKey = segments.slice(0, i + 1).join('/');
    return html`
            <sp-breadcrumb-item value="${pathKey}">${name}</sp-breadcrumb-item>
          `;
  })}
      </sp-breadcrumbs>
    `;
  }

  _renderFilesPanel() {
    const pathInfo = this._hashPath;
    const items = this._items;
    const pathKey = this._currentPathKey;

    if (!pathInfo) {
      return html`
        <div class="browse-view-files-hint">
          Set URL hash to <code>#/org/site</code> or <code>#/org/site/path</code> to browse.
        </div>
      `;
    }

    if (this._error) {
      return html`
        <div class="browse-view-error" role="alert">${this._error}</div>
      `;
    }

    if (this._loading && items.length === 0) {
      return html`<div class="browse-view-loading">Loading…</div>`;
    }

    return html`
      <div class="browse-view-files-panel">
        <sp-table
          class="browse-view-table"
          selects="${this._tableSelects}"
          .selected="${this._selectedRows}"
          select-all-label="Select all"
          @change="${this._onTableChange}"
        >
          <sp-table-head>
            <sp-table-head-cell class="browse-view-table-icon"></sp-table-head-cell>
            <sp-table-head-cell>Name</sp-table-head-cell>
            <sp-table-head-cell>Last modified</sp-table-head-cell>
            <sp-table-head-cell class="browse-view-table-actions"></sp-table-head-cell>
          </sp-table-head>
          <sp-table-body>
            ${items.map((item) => {
    const fullpath = (item.path || `${pathKey}/${item.name}`).replace(/^\//, '').replace(/\/+/g, '/');
    const isDir = !item.ext;
    const modified = item.lastModified || '—';
    return html`
                <sp-table-row value="${fullpath}">
                  <sp-table-cell class="browse-view-table-icon">
                    ${isDir ? html`<sp-icon-folder size="s"></sp-icon-folder>` : html`<sp-icon-file size="s"></sp-icon-file>`}
                  </sp-table-cell>
                  <sp-table-cell>${item.name}</sp-table-cell>
                  <sp-table-cell>${modified}</sp-table-cell>
                  <sp-table-cell class="browse-view-table-actions">
                    ${isDir ? html`
                      <sp-action-button
                        quiet
                        label="Open folder"
                        @click="${(ev) => this._onOpenFolder(ev, fullpath)}"
                      >
                        <sp-icon-chevron75 slot="icon" size="xs"></sp-icon-chevron75>
                      </sp-action-button>
                    ` : ''}
                  </sp-table-cell>
                </sp-table-row>
              `;
  })}
          </sp-table-body>
        </sp-table>
        ${this._selectedRows.length > 0 ? this._renderActionBar() : ''}
      </div>
    `;
  }

  _renderActionBar() {
    const n = this._selectedRows.length;
    const singleHtml = this._isSingleHtmlSelected;
    const showPublishMenu = !this._hasFolderSelected;
    return html`
      <sp-action-bar
        class="browse-view-action-bar"
        variant="fixed"
        ?open="${true}"
        @close="${this._onActionBarClose}"
      >
        ${n} selected
        ${showPublishMenu ? html`
        <sp-action-menu label="${n > 1 ? 'Bulk preview & Publish' : 'Preview & Publish'}" class="browse-view-publish-menu-trigger" slot="buttons">
          <span class="browse-view-publish-menu-content" slot="icon">
            ${this._publishLoading ? html`<sp-progress-circle class="browse-view-publish-spinner" indeterminate size="s" aria-label="Loading"></sp-progress-circle>` : ''}
            ${this._renderPlayIcon()}
          </span>
          <sp-menu-item @click="${this._onPreview}">${n > 1 ? 'Bulk preview' : 'Preview'}</sp-menu-item>
          <sp-menu-item @click="${this._onPublish}">${n > 1 ? 'Bulk publish' : 'Publish'}</sp-menu-item>
        </sp-action-menu>
        ` : ''}
        <sp-action-button slot="buttons" label="Rename" @click="${() => {}}">Rename</sp-action-button>
        <sp-action-button slot="buttons" label="Move" @click="${() => {}}">Move</sp-action-button>
        ${singleHtml ? html`
          <sp-action-button slot="buttons" label="Edit" @click="${this._onEdit}">
            <sp-icon-edit slot="icon"></sp-icon-edit>
            Edit
          </sp-action-button>
        ` : ''}
      </sp-action-bar>
    `;
  }

  _renderMainPane() {
    return html`
      <div class="browse-view-main">
        <div class="browse-view-toolbar">
          <sp-action-button
            class="browse-view-chat-toggle"
            label="Toggle chat panel"
            ?selected="${this._chatOpen}"
            @click="${() => { this._chatOpen = !this._chatOpen; }}"
          >
            <img src="${nxBase}/img/icons/aichat.svg" slot="icon" alt="" class="browse-view-nav-icon" />
          </sp-action-button>
          <div class="browse-view-toolbar-breadcrumbs">${this._renderBreadcrumbs()}</div>
        </div>
        <div class="browse-view-content">
          ${this._renderFilesPanel()}
        </div>
      </div>
    `;
  }

  render() {
    return html`
      <div class="browse-view">
        <div class="browse-view-body">
          ${this._chatOpen ? html`
          <sp-split-view
            class="browse-view-split split-view-outer"
            resizable
            primary-size="25%"
            primary-min="280"
            secondary-min="400"
            label="Resize chat panel"
          >
            <da-chat class="browse-view-chat-panel"></da-chat>
            ${this._renderMainPane()}
          </sp-split-view>
          ` : this._renderMainPane()}
        </div>
      </div>
    `;
  }
}

customElements.define('da-browse-view', BrowseView);

export default function decorate(block) {
  block.innerHTML = `
    <sp-theme system="spectrum-two" scale="medium" color="light">
      <da-browse-view></da-browse-view>
    </sp-theme>
  `;
}
