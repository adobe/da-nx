import { LitElement, html } from 'da-lit';
import { loadStyle, HashController } from '../../../utils/utils.js';
import { DA_ORIGIN, daFetch } from '../../../utils/daFetch.js';
import '../../shared/picker/picker.js';
import {
  fetchBlocks,
  fetchItems,
  insertBlock,
  insertText,
  insertTemplate,
} from './helpers.js';
import { getExtensionsBridge } from '../editor-utils/extensions-bridge.js';

const style = await loadStyle(import.meta.url);

const OOTB_PLUGINS = new Set(['blocks', 'templates', 'icons', 'placeholders']);

async function fetchExtensions(org, site) {
  const resp = await daFetch(`${DA_ORIGIN}/config/${org}/${site}/`);
  if (!resp.ok) return [];
  const json = await resp.json();
  const rows = json?.library?.data;
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const name = row.title.trim().toLowerCase().replaceAll(' ', '-');
    return {
      name,
      title: row.title.trim(),
      sources: row.path.split(',').map((p) => p.trim()),
      experience: row.experience || 'inline',
      format: row.format || '',
      ootb: OOTB_PLUGINS.has(name),
    };
  });
}

class NxPanelExtensions extends LitElement {
  static properties = {
    _extensions: { state: true },
    _selected: { state: true },
    _loading: { state: true },
    _ootbItems: { state: true },
    _blockVariants: { state: true },
    _expandedBlock: { state: true },
  };

  constructor() {
    super();
    this._hash = new HashController(this);
    this._extensions = [];
    this._selected = null;
    this._loading = false;
    this._loadedFor = null;
    this._loadedOotbFor = null;
    this._ootbItems = undefined;
    this._blockVariants = new Map();
    this._expandedBlock = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  updated() {
    super.updated();
    const { org, site } = this._hash.value || {};
    const key = org && site ? `${org}/${site}` : null;
    if (key && key !== this._loadedFor) {
      this._loadedFor = key;
      this._loadedOotbFor = null;
      this._loading = true;
      this._load(org, site);
    }
    const ext = this._selectedExtension;
    if (ext?.ootb && ext.name !== this._loadedOotbFor) {
      this._loadOotbItems(ext);
    }
  }

  async _load(org, site) {
    const key = `${org}/${site}`;
    const extensions = await fetchExtensions(org, site);
    if (this._loadedFor !== key) return;
    this._extensions = extensions;
    this._selected = extensions[0]?.name ?? null;
    this._loading = false;
  }

  async _loadOotbItems(ext) {
    this._loadedOotbFor = ext.name;
    this._ootbItems = undefined;
    this._blockVariants = new Map();
    this._expandedBlock = null;

    if (ext.name === 'blocks') {
      const items = await fetchBlocks(ext.sources);
      this._ootbItems = items;
    } else {
      let defaultFormat = '';
      if (ext.name === 'icons') defaultFormat = ':<content>:';
      else if (ext.name === 'placeholders') defaultFormat = '{{<content>}}';
      const format = ext.format || defaultFormat;
      const items = await fetchItems(ext.sources, format);
      this._ootbItems = items;
    }
  }

  _onPickerChange(e) {
    this._selected = e.detail.value;
  }

  get _extensionPickerItems() {
    return this._extensions.map((ex) => ({ value: ex.name, label: ex.title }));
  }

  get _selectedExtension() {
    return this._extensions.find((ext) => ext.name === this._selected);
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
    if (this._ootbItems === undefined) return html`<div class="ext-state">Loading…</div>`;
    if (!this._ootbItems.length) return html`<div class="ext-state">No blocks found.</div>`;
    return html`
      <ul class="ext-list">
        ${this._ootbItems.map((block) => html`
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
    if (this._ootbItems === undefined) return html`<div class="ext-state">Loading…</div>`;
    if (!this._ootbItems.length) return html`<div class="ext-state">No templates found.</div>`;
    return html`
      <ul class="ext-list">
        ${this._ootbItems.map((item) => html`
          <li class="ext-item" @click=${() => this._insertTemplate(item)}>
            <span class="ext-item-name">${item.name ?? item.key ?? item.title ?? item.value}</span>
          </li>
        `)}
      </ul>
    `;
  }

  _renderKeyValueItems(label) {
    if (this._ootbItems === undefined) return html`<div class="ext-state">Loading…</div>`;
    if (!this._ootbItems.length) return html`<div class="ext-state">No ${label} found.</div>`;
    return html`
      <ul class="ext-list">
        ${this._ootbItems.map((item) => html`
          <li class="ext-item" @click=${() => this._insertText(item)}>
            <span class="ext-item-name">${item.key || item.name || item.value}</span>
            ${item.value && item.value !== item.key ? html`<span class="ext-item-value">${item.value}</span>` : html``}
          </li>
        `)}
      </ul>
    `;
  }

  _renderOotbContent(ext) {
    if (ext.name === 'blocks') return this._renderBlocks();
    if (ext.name === 'templates') return this._renderTemplates();
    if (ext.name === 'icons') return this._renderKeyValueItems('icons');
    if (ext.name === 'placeholders') return this._renderKeyValueItems('placeholders');
    return html``;
  }

  _renderExtContent(ext) {
    if (!ext) return html``;
    if (ext.ootb) return this._renderOotbContent(ext);
    if (!ext.sources[0]) return html``;
    return html`<iframe
      class="ext-iframe"
      src=${ext.sources[0]}
      title=${ext.title}
      allow="clipboard-write *"
      @load=${this._handlePluginLoad}
    ></iframe>`;
  }

  render() {
    const { org, site } = this._hash.value || {};
    if (!org || !site) return html`<div class="ext-state">No document open.</div>`;
    if (this._loading) return html`<div class="ext-state">Loading extensions…</div>`;
    if (!this._extensions.length) return html`<div class="ext-state">No extensions configured.</div>`;

    const ext = this._selectedExtension;
    return html`
      <div class="ext-picker-row">
        <nx-picker
          class="ext-picker"
          placement="below"
          .items=${this._extensionPickerItems}
          .value=${this._selected}
          @change=${this._onPickerChange}
        ></nx-picker>
      </div>
      <div class="ext-content">
        ${this._renderExtContent(ext)}
      </div>
    `;
  }
}

customElements.define('nx-panel-extensions', NxPanelExtensions);
