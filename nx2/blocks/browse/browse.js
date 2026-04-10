/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

/** Browse shell: list fetch + nx-browse-list; context matches nx-chat (hash or host `context`). */

import { LitElement, html, nothing } from 'da-lit';
import { loadStyle, hashChange } from '../../utils/utils.js';
import { listFolder } from './browse-api.js';
import { contextToPathContext } from './utils.js';
import './list/list.js';

const styles = await loadStyle(import.meta.url);

class NxBrowse extends LitElement {
  static properties = {
    _items: { state: true },
  };

  constructor() {
    super();
    this._items = [];
  }

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
      this._items = [];
      this.requestUpdate();
      return;
    }

    try {
      const { items } = await listFolder(ctx.fullpath);
      this._items = items;
    } catch {
      this._items = [];
    }
    this.requestUpdate();
  }

  _onBrowseOpenFolder(event) {
    const { pathKey } = event.detail;
    if (!pathKey) return;
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

    if (this._items.length === 0) {
      return nothing;
    }

    const currentPathKey = ctx.pathSegments.join('/');

    return html`
      <nx-browse-list
        .items=${this._items}
        .currentPathKey=${currentPathKey}
        .context=${this._context}
        @nx-browse-open-folder=${this._onBrowseOpenFolder}
      ></nx-browse-list>
    `;
  }
}

customElements.define('nx-browse', NxBrowse);

export default function decorate(block) {
  block.textContent = '';
  block.append(document.createElement('nx-browse'));
}
