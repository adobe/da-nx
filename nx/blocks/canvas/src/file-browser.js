// eslint-disable-next-line import/no-unresolved
import getStyle from 'https://da.live/nx/utils/styles.js';
// eslint-disable-next-line import/no-unresolved
import { LitElement, html } from 'da-lit';
import { daFetch } from '../../../utils/daFetch.js';

const style = await getStyle(import.meta.url);

const DA_ORIGIN = 'https://admin.da.live';

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
      console.error('[da-file-browser] fetchList failed', { url, status: resp.status, statusText: resp.statusText });
      throw new Error(`List failed: ${resp.status}`);
    }
    const json = await resp.json();
    return Array.isArray(json) ? json : json?.items || [];
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[da-file-browser] fetchList error', { url, message: e?.message, cause: e?.cause });
    throw e;
  }
}

/**
 * Map API list item to tree node. Folders get children from cache when available.
 */
function listItemToNode(item, cache) {
  const path = (item.path || '').replace(/^\//, '');
  const fullpath = `/${path}`;
  const isDir = !item.ext;
  const children = isDir && cache[fullpath]
    ? cache[fullpath].map((child) => listItemToNode(child, cache))
    : [];
  return {
    name: item.name,
    type: item.ext ? 'file' : 'directory',
    path: fullpath,
    pathKey: path,
    ext: item.ext,
    lastModified: item.lastModified,
    children,
  };
}

/**
 * Build tree from cache: single root (org/site), children from cache;
 * folders get nested from cache.
 */
function buildTreeFromCache(cache, rootFullpath) {
  const rootPathKey = rootFullpath.replace(/^\//, '');
  const listItems = cache[rootFullpath];
  if (!listItems || listItems.length === 0) {
    return [{
      name: rootPathKey.split('/').pop(),
      type: 'directory',
      pathKey: rootPathKey,
      path: rootFullpath,
      children: [],
    }];
  }
  const root = [{
    name: rootPathKey.split('/').pop(),
    type: 'directory',
    pathKey: rootPathKey,
    path: rootFullpath,
    children: listItems.map((item) => listItemToNode(item, cache)),
  }];
  return root;
}

/**
 * File browser component: tree of files and directories driven by hash URL (org/site/path)
 * and DA list API. Use from any host (e.g. space) by placing <da-file-browser></da-file-browser>.
 * @fires da-file-browser-select - when user selects a file
 * (detail: { item: { name, type, path? } })
 */
class FileBrowser extends LitElement {
  static properties = {
    header: { type: String },
    selectedPath: { type: String },
    _hashPath: { state: true },
    _cache: { state: true },
    _loading: { state: true },
    _error: { state: true },
    _expanded: { state: true },
  };

  constructor() {
    super();
    this.header = 'Files';
    this.selectedPath = '';
    this._hashPath = null;
    this._cache = {};
    this._loading = false;
    this._error = null;
    this._expanded = new Set();
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

  async _syncFromHash() {
    const pathInfo = getHashPath();
    if (!pathInfo) {
      this._hashPath = null;
      this._expanded = new Set();
      this.selectedPath = '';
      this._error = null;
      return;
    }
    const { pathSegments } = pathInfo;
    this._hashPath = pathInfo;
    this.selectedPath = pathSegments.length > 2
      ? pathInfo.fullpath.replace(/^\//, '')
      : '';
    const rootFullpath = `/${pathSegments.slice(0, 2).join('/')}`;
    const ancestorPaths = [];
    for (let i = 2; i <= pathSegments.length; i += 1) {
      ancestorPaths.push(`/${pathSegments.slice(0, i).join('/')}`);
    }
    this._expanded = new Set(
      [rootFullpath.replace(/^\//, ''), ...ancestorPaths.map((p) => p.replace(/^\//, ''))],
    );
    this._error = null;
    this._loading = true;
    const cache = { ...this._cache };
    try {
      const toFetch = [rootFullpath, ...ancestorPaths].filter((p) => !cache[p]);
      await Promise.all(
        toFetch.map(async (p) => {
          const items = await fetchList(p);
          cache[p] = items;
        }),
      );
      this._cache = cache;
    } catch (e) {
      this._error = e.message || 'Failed to load';
    } finally {
      this._loading = false;
    }
  }

  /* eslint-disable-next-line class-methods-use-this */
  _path(parentPath, name) {
    return parentPath ? `${parentPath}/${name}` : name;
  }

  /* eslint-disable-next-line class-methods-use-this */
  _navigateToPath(pathKeyOrPath) {
    const normalized = pathKeyOrPath.startsWith('/') ? pathKeyOrPath.slice(1) : pathKeyOrPath;
    window.location.hash = `/${normalized}`;
  }

  _toggle(path) {
    const next = new Set(this._expanded);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    this._expanded = next;
  }

  /**
   * Load a folder's contents and expand it without updating the hash.
   * @param {string} pathKeyOrFullpath - e.g. org/site/folder or /org/site/folder
   */
  async _loadAndExpandFolder(pathKeyOrFullpath) {
    const pathKey = pathKeyOrFullpath.startsWith('/') ? pathKeyOrFullpath.slice(1) : pathKeyOrFullpath;
    const fullpath = `/${pathKey}`;
    if (this._cache[fullpath]) {
      this._toggle(pathKey);
      return;
    }
    this._loading = true;
    try {
      const items = await fetchList(fullpath);
      this._cache = { ...this._cache, [fullpath]: items };
      this._expanded = new Set(this._expanded);
      this._expanded.add(pathKey);
      this._error = null;
    } catch (e) {
      this._error = e.message || 'Failed to load';
    } finally {
      this._loading = false;
    }
  }

  _select(item, path) {
    this.selectedPath = path;
    this._navigateToPath(path);
    const detail = { item: { ...item, path } };
    this.dispatchEvent(
      new CustomEvent('da-file-browser-select', {
        detail,
        bubbles: true,
        composed: true,
      }),
    );
  }

  _renderItem(item, depth, parentPath) {
    const path = item.pathKey != null ? item.pathKey : this._path(parentPath, item.name);
    const isDir = item.type === 'directory';
    const expanded = this._expanded.has(path);
    const hasChildren = isDir && item.children?.length;
    const selected = this.selectedPath === path;

    if (isDir) {
      const onFolderClick = () => {
        if (hasChildren) {
          this._toggle(path);
        } else {
          this._loadAndExpandFolder(item.path || item.pathKey);
        }
      };
      return html`
        <div class="file-browser-node file-browser-dir" data-path="${path}">
          <button
            type="button"
            class="file-browser-row ${selected ? 'file-browser-row-selected' : ''}"
            style="padding-left: ${0.5 + depth * 1}rem"
            @click="${onFolderClick}"
            aria-expanded="${hasChildren ? expanded : undefined}"
            aria-label="${expanded ? 'Collapse' : 'Expand'} ${item.name}"
          >
            <span class="file-browser-chevron ${hasChildren && expanded ? 'file-browser-chevron-expanded' : ''}" aria-hidden="true">
              ${hasChildren
    ? html`<sp-icon-chevron200 size="s"></sp-icon-chevron200>`
    : html`<span class="file-browser-chevron-placeholder"></span>`}
            </span>
            <sp-icon-folder size="s" class="file-browser-icon"></sp-icon-folder>
            <span class="file-browser-label">${item.name}</span>
          </button>
          ${hasChildren && expanded
    ? html`
                <div class="file-browser-children">
                  ${item.children.map((child) => this._renderItem(child, depth + 1, path))}
                </div>
              `
    : ''}
        </div>
      `;
    }

    return html`
      <div class="file-browser-node file-browser-file" data-path="${path}">
        <button
          type="button"
          class="file-browser-row ${selected ? 'file-browser-row-selected' : ''}"
          style="padding-left: ${0.5 + depth * 1}rem"
          @click="${() => { this._select(item, path); }}"
          aria-label="Open ${item.name}"
        >
          <span class="file-browser-chevron" aria-hidden="true">
            <span class="file-browser-chevron-placeholder"></span>
          </span>
          <sp-icon-file size="s" class="file-browser-icon"></sp-icon-file>
          <span class="file-browser-label">${item.name}</span>
        </button>
      </div>
    `;
  }

  render() {
    const rootFullpath = this._hashPath
      ? `/${this._hashPath.pathSegments.slice(0, 2).join('/')}`
      : '';
    const items = this._hashPath && rootFullpath
      ? buildTreeFromCache(this._cache, rootFullpath)
      : [];
    return html`
      <div class="file-browser">
        <div class="file-browser-header">${this.header}</div>
        ${this._error
    ? html`<div class="file-browser-error" role="alert">${this._error}</div>`
    : ''}
        ${this._loading && items.length === 0
    ? html`<div class="file-browser-loading">Loading…</div>`
    : ''}
        <div class="file-browser-tree" role="tree" aria-label="${this.header}">
          ${items.map((item) => this._renderItem(item, 0, ''))}
        </div>
        ${!this._hashPath
    ? html`
              <div class="file-browser-hint">
                Set URL hash to <code>#/org/site</code> or <code>#/org/site/path</code> to browse.
              </div>
            `
    : ''}
      </div>
    `;
  }
}

customElements.define('da-file-browser', FileBrowser);
