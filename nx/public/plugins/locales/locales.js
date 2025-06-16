import { html, LitElement, nothing } from 'da-lit';
import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import getStyle from '../../utils/styles.js';
import { setContext, getLangsAndLocales } from './index.js';

// NX Base
const nx = `${new URL(import.meta.url).origin}/nx`;

// Styles
const sl = await getStyle(`${nx}/public/sl/styles.css`);
const styles = await getStyle(import.meta.url);

class NxLocales extends LitElement {
  static properties = {
    _langs: { state: true },
    _message: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, styles];
    this.getLangs();
  }

  async getLangs() {
    const { message, langs, locales } = await getLangsAndLocales();
    if (message) {
      this._message = message;
      return;
    }
    this._langs = langs;
    this._locales = locales;
  }

  renderLocaleLangs(langs) {
    return html`<ul>
      ${langs.map((lang) => html`
        <li>
          <p>${lang.name}</p>
        </li>
      `)}
    </ul>`;
  }

  renderGroup(title, items) {
    return html`
      <div class="lang-group">
        <p class="lang-group-header">${title}</p>
        <ul class="lang-group-list">${items.map((item) => html`
          <li>
            <p>${item.name}</p>
            ${item.langs && this.renderLocaleLangs(item.langs)}
          </li>`)}
        </ul>
      </div>
    `;
  }

  renderAll() {
    return html`
      ${this.renderGroup('Languages', this._langs)}
      ${this.renderGroup('Regions', this._locales)}
    `;
  }

  render() {
    return html`${this._langs && this.renderAll()}`;
  }
}

customElements.define('nx-locales', NxLocales);

(async function init() {
  const { context, token } = await DA_SDK;
  setContext({ ...context, token });

  const nxLocales = document.createElement('nx-locales');

  document.body.append(nxLocales);
}());
