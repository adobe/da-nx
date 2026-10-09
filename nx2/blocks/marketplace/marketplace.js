import { LitElement, html, nothing } from 'da-lit';

import { loadStyle } from '../../utils/utils.js';
import { loadHrefSvg } from '../../utils/svg.js';
import { fetchMarketplace, isAdobeOwned } from './marketplace-utils.js';

const style = await loadStyle(import.meta.url);

const ADOBE_LOGO_HREF = new URL('../../../nx/img/logos/aec.svg', import.meta.url).href;

class NxMarketplace extends LitElement {
  static properties = {
    _items: { state: true },
    _error: { state: true },
    _adobeLogo: { state: true },
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
    this._loadCardExtras(result.items);
  }

  // Non-critical card decorations are loaded only when an item needs them.
  _loadCardExtras(items) {
    if (items.some(({ type }) => type)) import('../shared/pills/pills.js');
    if (items.some(isAdobeOwned)) {
      loadHrefSvg(ADOBE_LOGO_HREF)
        .then((svg) => { this._adobeLogo = svg; })
        .catch(() => { /* card renders without the logo */ });
    }
  }

  _renderMedia(item) {
    const { type, imageHref } = item;
    const showImage = imageHref && !this._failedImageHrefs.has(imageHref);
    const showLogo = this._adobeLogo && isAdobeOwned(item);

    return html`
      <div class="media">
        ${showImage
    ? html`<img
          src=${imageHref}
          alt=""
          loading="lazy"
          @error=${() => this._onImageError(imageHref)}
        />`
    : html`<div class="placeholder"></div>`}
        ${type ? html`<nx-pills .label=${'Type'} .items=${[{ id: type, label: type, removable: false }]}></nx-pills>` : nothing}
        ${showLogo ? html`<span class="adobe-logo" role="img" aria-label="Adobe" title="Adobe">
          ${this._adobeLogo.cloneNode(true)}
        </span>` : nothing}
      </div>
    `;
  }

  _onImageError(imageHref) {
    this._failedImageHrefs.add(imageHref);
    this.requestUpdate();
  }

  _renderCard(item) {
    const {
      title, description, docHref, tryHref,
    } = item;

    return html`
      <li class="card">
        ${this._renderMedia(item)}
        <div class="content">
          <h3>${title}</h3>
          <p>${description}</p>
        </div>
        <div class="actions">
          ${docHref ? html`<a
            class="cta cta-primary"
            href=${docHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label=${`Learn more about ${title}`}
          >Learn more</a>` : nothing}
          ${tryHref ? html`<a
            class="cta cta-secondary"
            href=${tryHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label=${`Try out ${title}`}
          >Try out</a>` : nothing}
        </div>
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
