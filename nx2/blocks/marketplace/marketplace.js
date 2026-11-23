import { LitElement, html, nothing } from 'da-lit';

import { getConfig } from '../../scripts/nx.js';
import { loadStyle } from '../../utils/utils.js';
import {
  SORT_OPTIONS,
  fetchMarketplace,
  getActions,
  getCategoryFilters,
  getVisibleItems,
} from './marketplace-utils.js';

const { codeBase } = getConfig();

const [buttonStyle, style] = await Promise.all([
  loadStyle(new URL('../../styles/buttons.css', import.meta.url).href),
  loadStyle(import.meta.url),
]);

const SORT_ICON_HREF = `${codeBase}/img/icons/s2-icon-sortdown-20-n.svg#icon`;

const VIEW_ITEMS = [
  {
    value: 'list', label: 'List view', icon: `${codeBase}/img/icons/s2-icon-viewlist-20-n.svg`, iconOnly: true,
  },
  {
    value: 'grid', label: 'Grid view', icon: `${codeBase}/img/icons/s2-icon-viewgrid-20-n.svg`, iconOnly: true,
  },
];

class NxMarketplace extends LitElement {
  static properties = {
    _items: { state: true },
    _error: { state: true },
    _filters: { state: true },
    _filter: { state: true },
    _query: { state: true },
    _sort: { state: true },
    _view: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [buttonStyle, style];
    this._failedIconHrefs ??= new Set();
    this._filter ??= 'all';
    this._query ??= '';
    this._sort ??= 'name';
    this._view ??= 'list';
    if (this._items === undefined && !this._error) {
      this._load().catch(() => { this._error = 'Could not load marketplace.'; });
    }
  }

  async _load() {
    const result = await fetchMarketplace({ origin: window.location.origin });
    if (result.error) {
      this._error = result.error;
      return;
    }
    // Load controls before the first render so they don't shift the layout once they appear.
    await Promise.all([
      import('../shared/search/search.js'),
      import('../shared/menu/menu.js'),
      import('../shared/segmented-btn/segmented.js'),
    ]).catch(() => {});
    // A Type rail needs at least two categories besides "All".
    const filters = getCategoryFilters(result.items);
    if (filters.length > 2) this._filters = filters;
    this._items = result.items;
  }

  _onIconError(iconHref) {
    this._failedIconHrefs.add(iconHref);
    this.requestUpdate();
  }

  _renderIcon({ iconHref }) {
    if (iconHref && !this._failedIconHrefs.has(iconHref)) {
      return html`<img
        class="item-icon"
        src=${iconHref}
        alt=""
        loading="lazy"
        @error=${() => this._onIconError(iconHref)}
      />`;
    }
    return html`<span class="item-icon placeholder" aria-hidden="true"></span>`;
  }

  _renderActions(item) {
    return html`
      <div class="item-actions">
        ${getActions({ ...item, view: this._view }).map(({ label, href }) => html`
          <a
            class="item-action"
            href=${href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="${label}: ${item.title} (opens in a new tab)"
          >${label}</a>
        `)}
      </div>
    `;
  }

  _renderItem(item) {
    return html`
      <li class="item">
        ${this._renderIcon(item)}
        <div class="content">
          <h3>${item.title}</h3>
          ${item.description ? html`<p>${item.description}</p>` : nothing}
        </div>
        ${this._renderActions(item)}
      </li>
    `;
  }

  _renderToolbar() {
    const sortLabel = SORT_OPTIONS.find(({ id }) => id === this._sort)?.label;
    const label = `Search ${this._items.length} Capabilities`;
    return html`
      <div class="toolbar">
        <div class="controls">
          <nx-segmented-btn
            .items=${VIEW_ITEMS}
            .value=${this._view}
            label="View"
            size="m"
            @change=${({ detail: { value } }) => { this._view = value; }}
          ></nx-segmented-btn>
          <nx-menu
            .items=${SORT_OPTIONS}
            size="m"
            placement="below-end"
            @select=${({ detail: { id } }) => { this._sort = id; }}
          >
            <button type="button" slot="trigger" class="nx-action-btn-quiet">
              <svg viewBox="0 0 20 20" aria-hidden="true"><use href=${SORT_ICON_HREF}></use></svg>
              Sort by: ${sortLabel}
            </button>
          </nx-menu>
          <nx-search
            variant="field"
            size="m"
            .label=${label}
            .placeholder=${label}
            .value=${this._query}
            @input=${(e) => { this._query = e.target.value ?? ''; }}
          ></nx-search>
        </div>
      </div>
    `;
  }

  _renderRail() {
    return html`
      <nav class="rail" aria-label="Filter by type">
        <h3>Type</h3>
        ${this._filters.map(({ value, label }) => html`
          <button
            type="button"
            class="rail-item"
            aria-current=${this._filter === value ? 'true' : 'false'}
            @click=${() => { this._filter = value; }}
          >${label}</button>
        `)}
      </nav>
    `;
  }

  render() {
    if (this._error) return html`<p class="error">${this._error}</p>`;

    if (this._items === undefined) {
      return html`
        <div class="toolbar-skeleton" aria-hidden="true">
          <div class="controls">
            <span class="skeleton-block"></span>
            <span class="skeleton-block"></span>
            <span class="skeleton-block wide"></span>
          </div>
        </div>
        <div class="body has-rail">
          <div class="rail-skeleton" aria-hidden="true">
            ${[0, 1, 2, 3].map(() => html`<span class="skeleton-bar"></span>`)}
          </div>
          <ul class="items list loading" role="list" aria-busy="true">
            ${[0, 1, 2].map(() => html`
              <li class="item skeleton" aria-hidden="true">
                <span class="item-icon"></span>
                <div class="content">
                  <span class="skeleton-bar"></span>
                  <span class="skeleton-bar"></span>
                </div>
              </li>
            `)}
          </ul>
        </div>
      `;
    }

    if (!this._items.length) return html`<p class="empty">No extensions available.</p>`;

    const visible = getVisibleItems({
      items: this._items,
      filter: this._filters ? this._filter : 'all',
      query: this._query,
      sort: this._sort,
    });

    const count = `${visible.length} ${visible.length === 1 ? 'capability' : 'capabilities'}`;

    return html`
      ${this._renderToolbar()}
      <p class="status" aria-live="polite">${count}</p>
      <div class="body ${this._filters ? 'has-rail' : ''}">
        ${this._filters ? this._renderRail() : nothing}
        ${visible.length
    ? html`<ul class="items ${this._view}" role="list">${visible.map((item) => this._renderItem(item))}</ul>`
    : html`<p class="no-results">No capabilities match your search.</p>`}
      </div>
    `;
  }
}

customElements.define('nx-marketplace', NxMarketplace);

export default function init(el) {
  el.style.display = 'contents';
  el.replaceChildren(document.createElement('nx-marketplace'));
}
