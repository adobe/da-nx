import { LitElement, html, nothing } from 'da-lit';

import { loadStyle } from '../../utils/utils.js';
import { fetchMarketplace } from './marketplace-utils.js';

const style = await loadStyle(import.meta.url);

class NxMarketplace extends LitElement {
  static properties = {
    _items: { state: true },
    _error: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._failedImageHrefs ??= new Set();
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
    this._items = result.items;
  }

  _onImageError(imageHref) {
    this._failedImageHrefs.add(imageHref);
    this.requestUpdate();
  }

  _renderCard(item) {
    const {
      title, description, href, types, imageHref,
    } = item;
    const showImage = imageHref && !this._failedImageHrefs.has(imageHref);

    return html`
      <li class="card">
        ${showImage
    ? html`<img
        src=${imageHref}
        alt=""
        loading="lazy"
        @error=${() => this._onImageError(imageHref)}
      />`
    : html`<div class="placeholder"></div>`}
        <div class="content">
          <h3>${title}</h3>
          <p>${description}</p>
          ${types.length ? html`
            <div class="badges">
              ${types.map((type) => html`<span class="badge">${type}</span>`)}
            </div>
          ` : nothing}
        </div>
        <a
          class="cta"
          href=${href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label=${`Learn more about ${title}`}
        >Learn more</a>
      </li>
    `;
  }

  render() {
    if (this._error) return html`<p class="error">${this._error}</p>`;

    if (this._items === undefined) {
      return html`
        <ul class="loading" role="list" aria-busy="true">
          ${[0, 1, 2, 3].map(() => html`<li class="card skeleton" aria-hidden="true"></li>`)}
        </ul>
      `;
    }

    if (!this._items.length) return html`<p class="empty">No extensions available.</p>`;

    return html`
      <ul class="grid" role="list">
        ${this._items.map((item) => this._renderCard(item))}
      </ul>
    `;
  }
}

customElements.define('nx-marketplace', NxMarketplace);

export default function init(el) {
  // Let cards flow into the section's grid (set via section metadata, e.g. grid-4).
  el.style.display = 'contents';
  el.replaceChildren(document.createElement('nx-marketplace'));
}
