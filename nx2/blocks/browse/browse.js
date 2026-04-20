import { LitElement, html, nothing } from 'da-lit';
import { loadStyle, hashChange } from '../../utils/utils.js';
import { listFolder, fetchResourceStatus } from './browse-api.js';
import {
  contextToPathContext,
  entryTypeFromExtension,
  isFolder,
  RESOURCE_TYPE,
} from './utils.js';
import '../shared/breadcrumb/breadcrumb.js';
import './list/list.js';

const styles = await loadStyle(import.meta.url);

/*
 * Layout: the browse shell and table need a definite height chain (main fills the viewport
 * column, `.browse` fills main, list scrolls inside). Default page CSS often leaves `main`
 * auto-sized, so the list would grow with content instead of scrolling.
 *
 * We inject these rules only while `nx-browse` is connected (see `applyStyleOverride` /
 * `revertStyleOverride` on `document.adoptedStyleSheets`) so browse stays self-contained
 * and we avoid editing global / app-frame styles for one block.
 */
const styleOverrideCss = `
/* Fixed boundary in the main content area */
main:has(nx-browse) {
  position: relative;
  height: 100%;
  overflow: hidden;
  display: grid;
  grid-template-rows: 1fr;
}
/* Pin the browse block wrapper to main’s box */
main:has(nx-browse) .browse {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}
`.trim();

/** @type {CSSStyleSheet | undefined} */
let styleOverrideSheet;

const applyStyleOverride = () => {
  if (!styleOverrideSheet) {
    styleOverrideSheet = new CSSStyleSheet();
    styleOverrideSheet.replaceSync(styleOverrideCss);
  }
  const sheets = [...document.adoptedStyleSheets];
  if (!sheets.includes(styleOverrideSheet)) {
    document.adoptedStyleSheets = [...sheets, styleOverrideSheet];
  }
};

const revertStyleOverride = () => {
  if (!styleOverrideSheet) {
    return;
  }
  document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
    (sheet) => sheet !== styleOverrideSheet,
  );
};

class NxBrowse extends LitElement {
  static properties = {
    _items: { state: true },
    _listError: { state: true },
  };

  set context(value) {
    this._explicitContext = true;
    this._context = value;
    this.requestUpdate();
    if (this.isConnected) {
      this._syncList();
    }
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    applyStyleOverride();
    this._unsubscribeHash = hashChange.subscribe((hashState) => {
      if (!this._explicitContext) {
        this._context = hashState;
        this._syncList();
      }
    });
    if (this._explicitContext && this._context) {
      this._syncList();
    }
  }

  disconnectedCallback() {
    this._unsubscribeHash?.();
    revertStyleOverride();
    super.disconnectedCallback();
  }

  get _pathContext() {
    return contextToPathContext(this._context);
  }

  _scheduleResourceStatusFetch(items) {
    Promise.all(
      items.map(async (row) => {
        if (isFolder(row)) return row;
        try {
          const json = await fetchResourceStatus(row.path);
          return { ...row, resourceStatus: json ?? null };
        } catch {
          return { ...row, resourceStatus: null };
        }
      }),
    )
      .then((nextItems) => {
        this._items = nextItems;
        this.requestUpdate();
      })
      .catch(() => {
        this.requestUpdate();
      });
  }

  async _syncList() {
    const ctx = this._pathContext;
    if (!ctx) {
      this._items = undefined;
      this._listError = undefined;
      this.requestUpdate();
      return;
    }

    const { fullpath } = ctx;

    const result = await listFolder(fullpath);

    if ('error' in result) {
      this._items = undefined;
      this._listError = result.error;
    } else {
      this._listError = undefined;
      const items = result;
      this._items = items;
      this._scheduleResourceStatusFetch(items);
    }
    this.requestUpdate();
  }

  _onBrowseActivate(event) {
    const { pathKey, item } = event.detail || {};
    if (entryTypeFromExtension(item.ext) === RESOURCE_TYPE.document) {
      const url = new URL(window.location.href);
      url.pathname = '/canvas';
      url.hash = `#/${item.path.slice(1, -(item.ext.length + 1))}`;
      window.location.assign(url.href);
      return;
    }
    if (entryTypeFromExtension(item.ext) === RESOURCE_TYPE.sheet) {
      const url = new URL(window.location.href);
      url.pathname = '/sheet';
      url.search = '';
      url.hash = `#/${item.path.slice(1, -(item.ext.length + 1))}`;
      window.open(url.href, '_blank', 'noopener,noreferrer');
      return;
    }
    if (item && isFolder(item)) {
      window.location.hash = `#/${pathKey}`;
    }
  }

  render() {
    const ctx = this._pathContext;

    if (!ctx) {
      return html`
        <div class="browse-hint" role="status">
          <p class="browse-hint-title">Nothing to show here yet</p>
          <p class="browse-hint-detail">
            Choose a site or folder from your workspace to see files in this list.
          </p>
        </div>
      `;
    }

    const title = ctx.pathSegments.at(-1) ?? '';

    if (!this._listError && this._items === undefined) {
      return nothing;
    }

    const header = html`
      <div class="browse-header">
        <div class="browse-title-bar">
          <h1 class="browse-title">${title}</h1>
        </div>
        <nx-breadcrumb .pathSegments=${ctx.pathSegments}></nx-breadcrumb>
      </div>
    `;

    if (this._listError) {
      return html`
        ${header}
        <div class="browse-hint browse-hint-error" role="alert">
          <p class="browse-hint-title">Could not load this folder</p>
          <p class="browse-hint-detail">${this._listError}</p>
        </div>
      `;
    }

    const currentPathKey = ctx.pathSegments.join('/');

    return html`
      ${header}
      <nx-browse-list
        .items=${this._items}
        .currentPathKey=${currentPathKey}
        @nx-browse-activate=${this._onBrowseActivate}
      ></nx-browse-list>
    `;
  }
}

if (!customElements.get('nx-browse')) {
  customElements.define('nx-browse', NxBrowse);
}

export default function decorate(block) {
  block.textContent = '';
  block.append(document.createElement('nx-browse'));
}
