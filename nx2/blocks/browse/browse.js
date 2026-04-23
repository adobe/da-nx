import { LitElement, html, nothing } from 'da-lit';
import { loadStyle, hashChange } from '../../utils/utils.js';
import { listFolder } from './browse-api.js';
import {
  contextToPathContext,
  entryTypeFromExtension,
  isFolder,
  RESOURCE_TYPE,
} from './utils.js';
import '../shared/breadcrumb/breadcrumb.js';
import './list/list.js';

const styles = await loadStyle(import.meta.url);

const documentLayoutStyles = await loadStyle(
  new URL('overrides.css', import.meta.url).href,
);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, documentLayoutStyles];

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
    super.disconnectedCallback();
  }

  get _pathContext() {
    return contextToPathContext(this._context);
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
      this._items = result;
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
