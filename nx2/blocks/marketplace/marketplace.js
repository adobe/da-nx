import { LitElement, html, nothing } from 'da-lit';

import { loadStyle } from '../../utils/utils.js';
import { fetchMarketplace } from './marketplace-utils.js';

const style = await loadStyle(import.meta.url);
const buttonStyle = await loadStyle(new URL('../../styles/buttons.css', import.meta.url).href);

class NxMarketplace extends LitElement {
  static properties = {
    _items: { state: true },
    _error: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [buttonStyle, style];
    this._load();
  }

  async _load() {
    const result = await fetchMarketplace({ origin: window.location.origin });
    if (result.error) {
      this._error = result.error;
      return;
    }
    this._items = result.items;
  }

  // eslint-disable-next-line class-methods-use-this
  _renderCard(item) {
    const {
      title, description, href, types, imageHref,
    } = item;

    return html`
      <li class="card">
        ${imageHref
    ? html`<img src=${imageHref} alt="" loading="lazy" />`
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
          class="cta nx-btn-primary"
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
        <ul class="loading">
          ${[0, 1, 2, 3].map(() => html`<li class="card skeleton"></li>`)}
        </ul>
      `;
    }

    if (!this._items.length) return html`<p class="empty">No extensions available.</p>`;

    return html`
      <ul class="grid">
        ${this._items.map((item) => this._renderCard(item))}
      </ul>
    `;
  }
}

customElements.define('nx-marketplace', NxMarketplace);

export default function init(el) {
  el.replaceChildren(document.createElement('nx-marketplace'));
}
