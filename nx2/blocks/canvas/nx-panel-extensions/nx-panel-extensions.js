import { LitElement, html } from 'da-lit';
import { loadStyle, HashController } from '../../../utils/utils.js';
import {
  fetchBlocks,
  fetchItems,
  insertBlock,
  insertText,
  insertTemplate,
} from './helpers.js';
import { getExtensionsBridge } from '../editor-utils/extensions-bridge.js';

const style = await loadStyle(import.meta.url);

class NxPanelExtension extends LitElement {
  static properties = {
    extension: { attribute: false },
    _items: { state: true },
    _blockVariants: { state: true },
    _expandedBlock: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._hash = new HashController(this);
  }

  willUpdate(changed) {
    if (changed.has('extension') && this.extension) {
      this._items = undefined;
      this._blockVariants = new Map();
      this._expandedBlock = null;
      this._loadItems();
    }
  }

  async _loadItems() {
    const ext = this.extension;
    if (!ext) return;

    if (!ext.ootb) return;

    if (ext.name === 'blocks') {
      this._items = await fetchBlocks(ext.sources);
      return;
    }

    let defaultFormat = '';
    if (ext.name === 'icons') defaultFormat = ':<content>:';
    else if (ext.name === 'placeholders') defaultFormat = '{{<content>}}';
    this._items = await fetchItems(ext.sources, ext.format || defaultFormat);
  }

  async _toggleBlock(block) {
    if (this._expandedBlock === block.path) {
      this._expandedBlock = null;
      return;
    }
    this._expandedBlock = block.path;
    if (!this._blockVariants.has(block.path)) {
      const variants = await block.loadVariants;
      const next = new Map(this._blockVariants);
      next.set(block.path, variants ?? []);
      this._blockVariants = next;
    }
  }

  _insertBlock(variant) {
    const { view } = getExtensionsBridge();
    if (!view) return;
    insertBlock(view, variant.dom);
  }

  _insertText(item) {
    const { view } = getExtensionsBridge();
    if (!view) return;
    insertText(view, item.text);
  }

  async _insertTemplate(item) {
    const { view } = getExtensionsBridge();
    if (!view) return;
    await insertTemplate(view, item.path);
  }

  async _handlePluginLoad({ target }) {
    const { org, site, path, view } = this._hash.value || {};
    if (!org || !site || !target.contentWindow) return;

    const channel = new MessageChannel();
    const project = { org, repo: site, ref: 'main', path: path ? `/${path}` : '/', view: view || 'edit' };

    let token;
    try {
      const { loadIms } = await import('../../../utils/ims.js');
      const ims = await loadIms();
      token = ims?.accessToken?.token;
    } catch { /* proceed without token */ }

    setTimeout(() => {
      if (!target.contentWindow) return;
      target.contentWindow.postMessage({ ready: true, project, context: project, token }, '*', [channel.port2]);
    }, 750);
  }

  _renderVariants(block) {
    if (this._expandedBlock !== block.path) return html``;
    const variants = this._blockVariants.get(block.path);
    if (variants === undefined) {
      return html`<div class="ext-variants-loading">Loading variants…</div>`;
    }
    if (!variants.length) {
      return html`<div class="ext-variants-loading">No variants found.</div>`;
    }
    return html`
      <ul class="ext-variant-list">
        ${variants.map((v) => html`
          <li class="ext-variant-item" @click=${() => this._insertBlock(v)}>
            <span class="ext-variant-name">${v.name}</span>
            ${v.dom ? html`<div class="ext-variant-preview">${v.dom}</div>` : html``}
          </li>
        `)}
      </ul>
    `;
  }

  _renderBlocks() {
    if (this._items === undefined) return html`<div class="ext-state">Loading…</div>`;
    if (!this._items.length) return html`<div class="ext-state">No blocks found.</div>`;
    return html`
      <ul class="ext-list">
        ${this._items.map((block) => html`
          <li class="ext-group">
            <button class="ext-group-header" @click=${() => this._toggleBlock(block)}>
              <span class="ext-item-name">${block.name}</span>
              <span class="ext-expand-icon">${this._expandedBlock === block.path ? '▾' : '▸'}</span>
            </button>
            ${this._renderVariants(block)}
          </li>
        `)}
      </ul>
    `;
  }

  _renderTemplates() {
    if (this._items === undefined) return html`<div class="ext-state">Loading…</div>`;
    if (!this._items.length) return html`<div class="ext-state">No templates found.</div>`;
    return html`
      <ul class="ext-list">
        ${this._items.map((item) => html`
          <li class="ext-item" @click=${() => this._insertTemplate(item)}>
            <span class="ext-item-name">${item.name ?? item.key ?? item.title ?? item.value}</span>
          </li>
        `)}
      </ul>
    `;
  }

  _renderKeyValueItems(label) {
    if (this._items === undefined) return html`<div class="ext-state">Loading…</div>`;
    if (!this._items.length) return html`<div class="ext-state">No ${label} found.</div>`;
    return html`
      <ul class="ext-list">
        ${this._items.map((item) => html`
          <li class="ext-item" @click=${() => this._insertText(item)}>
            <span class="ext-item-name">${item.key || item.name || item.value}</span>
            ${item.value && item.value !== item.key ? html`<span class="ext-item-value">${item.value}</span>` : html``}
          </li>
        `)}
      </ul>
    `;
  }

  render() {
    const ext = this.extension;
    if (!ext) return html`<div class="ext-state">No extension.</div>`;

    if (!ext.ootb) {
      if (!ext.sources[0]) return html``;
      return html`<iframe
        class="ext-iframe"
        src=${ext.sources[0]}
        title=${ext.title}
        allow="clipboard-write *"
        @load=${this._handlePluginLoad}
      ></iframe>`;
    }

    if (ext.name === 'blocks') return this._renderBlocks();
    if (ext.name === 'templates') return this._renderTemplates();
    return this._renderKeyValueItems(ext.name);
  }
}

customElements.define('nx-panel-extension', NxPanelExtension);
