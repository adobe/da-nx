import { LitElement, html, nothing } from 'da-lit';

import { getConfig } from '../../scripts/nx.js';
import { loadStyle } from '../../utils/utils.js';
import {
  fetchMarketplace,
  filterByCategory,
  getActions,
  getCategoryFilters,
} from './marketplace-utils.js';

const { codeBase } = getConfig();

const [buttonStyle, style] = await Promise.all([
  loadStyle(new URL('../../styles/buttons.css', import.meta.url).href),
  loadStyle(import.meta.url),
]);

const MORE_ICON_HREF = `${codeBase}/img/icons/s2-icon-more-20-n.svg#icon`;

class NxMarketplace extends LitElement {
  static properties = {
    _items: { state: true },
    _error: { state: true },
    _filters: { state: true },
    _filter: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [buttonStyle, style];
    this._failedIconHrefs ??= new Set();
    this._filter ??= 'all';
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
    // A filter needs at least two categories besides "All".
    const filters = getCategoryFilters(result.items);
    if (filters.length > 2) {
      // Load the filter before the first render so it doesn't push the cards down once it appears.
      await import('../shared/segmented-btn/segmented.js').catch(() => {});
      this._filters = filters;
    }
    this._items = result.items;
    if (result.items.length) import('../shared/menu/menu.js');
  }

  _onIconError(iconHref) {
    this._failedIconHrefs.add(iconHref);
    this.requestUpdate();
  }

  _onActionSelect({ detail: { id } }, actions) {
    const action = actions.find((a) => a.id === id);
    if (action) window.open(action.href, '_blank', 'noopener,noreferrer');
  }

  _renderIcon({ iconHref }) {
    if (iconHref && !this._failedIconHrefs.has(iconHref)) {
      return html`<img
        class="card-icon"
        src=${iconHref}
        alt=""
        loading="lazy"
        @error=${() => this._onIconError(iconHref)}
      />`;
    }
    return html`<span class="card-icon placeholder" aria-hidden="true"></span>`;
  }

  _renderActions(item) {
    const actions = getActions(item);
    return html`
      <nx-menu
        .items=${actions}
        placement="below-end"
        size="m"
        @select=${(e) => this._onActionSelect(e, actions)}
      >
        <button
          type="button"
          slot="trigger"
          class="nx-action-btn-icon nx-btn-sm"
          aria-label=${`More actions for ${item.title}`}
        >
          <svg class="more-icon" viewBox="0 0 20 20" aria-hidden="true"><use href=${MORE_ICON_HREF}></use></svg>
        </button>
      </nx-menu>
    `;
  }

  _renderCard(item) {
    return html`
      <li class="card">
        <div class="card-header">
          ${this._renderIcon(item)}
          ${this._renderActions(item)}
        </div>
        <div class="content">
          <h3>${item.title}</h3>
          ${item.description ? html`<p>${item.description}</p>` : nothing}
        </div>
      </li>
    `;
  }

  render() {
    if (this._error) return html`<p class="error">${this._error}</p>`;

    if (this._items === undefined) {
      return html`
        <div class="filter-skeleton" aria-hidden="true"></div>
        <ul class="grid loading" role="list" aria-busy="true">
          ${[0, 1, 2].map(() => html`<li class="card skeleton" aria-hidden="true"></li>`)}
        </ul>
      `;
    }

    if (!this._items.length) return html`<p class="empty">No extensions available.</p>`;

    const visible = this._filters
      ? filterByCategory({ items: this._items, filter: this._filter })
      : this._items;

    return html`
      ${this._filters ? html`<nx-segmented-btn
        size="m"
        label="Filter extensions"
        .items=${this._filters}
        .value=${this._filter}
        @change=${(e) => { this._filter = e.detail.value; }}
      ></nx-segmented-btn>` : nothing}
      <ul class="grid" role="list">${visible.map((item) => this._renderCard(item))}</ul>
    `;
  }
}

customElements.define('nx-marketplace', NxMarketplace);

export default function init(el) {
  el.style.display = 'contents';
  el.replaceChildren(document.createElement('nx-marketplace'));
}
