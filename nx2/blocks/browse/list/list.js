import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';
import {
  formatColumnLastModified,
  formatColumnLastPreviewed,
  formatColumnLastPublished,
  formatColumnModifiedBy,
} from './format.js';
import { getIconByExtension, itemRowPathKey, loadIcons } from '../utils.js';

const styles = await loadStyle(import.meta.url);

/** `''` stays empty (e.g. folders); `null` / `undefined` → em dash for missing data. */
function browseCellText(label) {
  if (label === '') return '';
  return label ?? '—';
}

export class NxBrowseList extends LitElement {
  static properties = {
    items: { type: Array },
    currentPathKey: { type: String, attribute: 'current-path-key' },
    /** True while parent is still merging `/status` fields onto file rows. */
    resourceStatusPending: { type: Boolean, attribute: 'resource-status-pending' },
    _icons: { state: true },
    _selectedKeys: { state: true },
  };

  willUpdate(changedProperties) {
    if (changedProperties.has('currentPathKey')) {
      this._selectedKeys = [];
      this._emitSelectionChange();
    }
  }

  updated() {
    const input = this.shadowRoot?.getElementById('select-all');
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    if (this.items === undefined) {
      return;
    }
    const { items } = this;
    const selectedKeys = this._selectedKeys ?? [];
    const keys = items.map((item) => itemRowPathKey(this.currentPathKey, item));
    const selectedCount = keys.filter((rowKey) => selectedKeys.includes(rowKey)).length;
    input.indeterminate = selectedCount > 0 && selectedCount < keys.length;
    if (keys.length === 0) {
      input.checked = false;
      input.indeterminate = false;
    }
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  async firstUpdated() {
    this._icons = await loadIcons();
  }

  _renderIcon(iconKey) {
    const svg = this._icons?.[iconKey];
    return svg ? svg.cloneNode(true) : nothing;
  }

  _onRowActivate(event, item) {
    if (item.ext) {
      return;
    }
    const pathKey = itemRowPathKey(this.currentPathKey, item);
    event.stopPropagation();
    this.dispatchEvent(
      new CustomEvent('nx-browse-open-folder', {
        detail: { pathKey },
        bubbles: true,
        composed: true,
      }),
    );
  }

  _emitSelectionChange() {
    this.dispatchEvent(
      new CustomEvent('nx-browse-selection-change', {
        detail: { selectedKeys: [...(this._selectedKeys ?? [])] },
        bubbles: true,
        composed: true,
      }),
    );
  }

  _isRowSelected(key) {
    return (this._selectedKeys ?? []).includes(key);
  }

  _onSelectAllChange(event) {
    event.stopPropagation();
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    if (this.items === undefined) {
      return;
    }
    const { items } = this;
    const keys = items.map((item) => itemRowPathKey(this.currentPathKey, item));
    this._selectedKeys = input.checked ? [...keys] : [];
    this._emitSelectionChange();
  }

  _onCopyDeployUrl(event, url) {
    event.stopPropagation();
    const text = String(url || '').trim();
    if (!text) return;
    navigator.clipboard.writeText(text).catch(() => { });
  }

  _renderDeployBadge(opts) {
    const { showBadge, url, variant, copyLabel } = opts;
    if (!showBadge) {
      return nothing;
    }
    const icon = this._renderIcon('globeGrid');
    const classes = `deploy-badge deploy-badge-${variant}`;
    if (url) {
      return html`
        <button
          type="button"
          class=${classes}
          title=${copyLabel}
          aria-label=${copyLabel}
          @click=${(event) => this._onCopyDeployUrl(event, url)}
        >
          ${icon}
        </button>
      `;
    }
    return html`<span class=${classes} aria-hidden="true">${icon}</span>`;
  }

  _onRowCheckboxChange(event, item) {
    event.stopPropagation();
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    const key = itemRowPathKey(this.currentPathKey, item);
    const selectedKeys = this._selectedKeys ?? [];
    if (input.checked) {
      this._selectedKeys = selectedKeys.includes(key)
        ? selectedKeys
        : [...selectedKeys, key];
    } else {
      this._selectedKeys = selectedKeys.filter((selectedKey) => selectedKey !== key);
    }
    this._emitSelectionChange();
  }

  render() {
    if (this.items === undefined) {
      return nothing;
    }
    const { items } = this;
    const selectedKeys = this._selectedKeys ?? [];
    const rowKeys = items.map((item) => itemRowPathKey(this.currentPathKey, item));
    const selectedCount = rowKeys.filter((rowKey) => selectedKeys.includes(rowKey)).length;
    const allSelected = items.length > 0 && selectedCount === items.length;

    return html`
      <div class="scroll">
        <table class="sheet" role="table">
        <thead>
          <tr>
            <th class="column-selection" scope="col">
              <label class="check">
                <span class="sr-only">Select all</span>
                <input
                  id="select-all"
                  type="checkbox"
                  .checked=${allSelected}
                  @change=${this._onSelectAllChange}
                />
              </label>
            </th>
            <th class="column-entry-type" scope="col"><span class="sr-only">Type</span></th>
            <th class="column-file-name" scope="col">Name</th>
            <th class="column-modified" scope="col">Last modified</th>
            <th class="column-modified-by" scope="col">Modified by</th>
            <th class="column-last-previewed" scope="col">Last previewed</th>
            <th class="column-last-published" scope="col">Last published</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item) => {
      const key = itemRowPathKey(this.currentPathKey, item);
      const selected = this._isRowSelected(key);
      const isFolder = !item.ext;
      const statusPending = Boolean(this.resourceStatusPending);
      const modified = isFolder
        ? { label: '' }
        : formatColumnLastModified(item.lastModified);
      const modifiedBy = isFolder
        ? { label: '', initials: '' }
        : formatColumnModifiedBy(item, { statusPending });
      const lastPreviewed = formatColumnLastPreviewed(item, { isFolder, statusPending });
      const lastPublished = formatColumnLastPublished(item, { isFolder, statusPending });
      return html`
              <tr
                class="row ${item.ext ? 'row-file' : 'row-dir'}"
                aria-selected=${selected ? 'true' : 'false'}
                @click=${(event) => this._onRowActivate(event, item)}
              >
                <td class="column-selection" @click=${(event) => event.stopPropagation()}>
                  <label class="check">
                    <span class="sr-only">Select ${item.name || 'row'}</span>
                    <input
                      type="checkbox"
                      .checked=${selected}
                      @change=${(event) => this._onRowCheckboxChange(event, item)}
                    />
                  </label>
                </td>
                <td class="column-entry-type">${this._renderIcon(getIconByExtension(item?.ext))}</td>
                <td class="column-file-name">
                  <span class="filename" title=${item.name || ''}>${item.name}</span>
                </td>
                <td class="column-modified" title=${modified.title || nothing}>
                  ${browseCellText(modified.label)}
                </td>
                <td
                  class="column-modified-by ${modifiedBy.pending ? 'pending' : ''}"
                  title=${modifiedBy.title || nothing}
                >
                  ${isFolder || !modifiedBy.initials
          ? browseCellText(modifiedBy.label)
          : html`
                        <span class="who">
                          <span class="avatar" aria-hidden="true">${modifiedBy.initials}</span>
                          <span class="who-name">${browseCellText(modifiedBy.label)}</span>
                        </span>
                      `}
                </td>
                <td
                  class="column-last-previewed ${lastPreviewed.pending ? 'pending' : ''}"
                  title=${lastPreviewed.title || nothing}
                >
                  <div class="deploy">
                    <span class="deploy-label">${browseCellText(lastPreviewed.label)}</span>
                    ${this._renderDeployBadge({
            showBadge: lastPreviewed.showBadge,
            url: item.previewUrl,
            variant: 'preview',
            copyLabel: 'Copy preview URL',
          })}
                  </div>
                </td>
                <td
                  class="column-last-published ${lastPublished.pending ? 'pending' : ''}"
                  title=${lastPublished.title || nothing}
                >
                  <div class="deploy">
                    <span class="deploy-label">${browseCellText(lastPublished.label)}</span>
                    ${this._renderDeployBadge({
            showBadge: lastPublished.showBadge,
            url: item.liveUrl,
            variant: 'live',
            copyLabel: 'Copy publish URL',
          })}
                  </div>
                </td>
              </tr>
            `;
    })}
        </tbody>
      </table>
      </div>
    `;
  }
}

if (!customElements.get('nx-browse-list')) {
  customElements.define('nx-browse-list', NxBrowseList);
}
