import { LitElement, html, nothing } from 'da-lit';
import { loadStyle, hashChange } from '../../utils/utils.js';
import { listFolder } from './browse-api.js';
import { contextToPathContext } from './utils.js';
import './list/list.js';

const styles = await loadStyle(import.meta.url);

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

    const result = await listFolder(ctx.fullpath);
    if ('error' in result) {
      this._items = undefined;
      this._listError = result.error;
    } else {
      this._listError = undefined;
      this._items = result.items;
    }
    this.requestUpdate();
  }

  _onBrowseOpenFolder(event) {
    const { pathKey } = event.detail;
    if (!pathKey) {
      return;
    }
    window.location.hash = `#/${pathKey}`;
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

    if (this._listError) {
      return html`
        <div class="browse-hint browse-hint-error" role="alert">
          <p class="browse-hint-title">Could not load this folder</p>
          <p class="browse-hint-detail">${this._listError}</p>
        </div>
      `;
    }

    if (this._items === undefined) {
      return nothing;
    }

    const currentPathKey = ctx.pathSegments.join('/');

    return html`
      <nx-browse-list
        .items=${this._items}
        .currentPathKey=${currentPathKey}
        @nx-browse-open-folder=${this._onBrowseOpenFolder}
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
