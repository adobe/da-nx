import { html, LitElement, nothing } from 'da-lit';
import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import getStyle from '../../utils/styles.js';
import { setContext, getLangsAndLocales, getContext } from './index.js';

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
    this.setup();
  }

  async setup() {
    const { message, langs, locales } = await getLangsAndLocales();
    if (message) {
      this._message = message;
      return;
    }
    this._langs = langs;
    this._locales = locales;
  }

  findInLang(langs) {
    return langs.find((item) => this.path.startsWith(`${item.location}/`));
  }

  handleOpen(lang) {
    let found = this.findInLang(this._langs);
    if (!found) {
      const flatLocaleLangs = this._locales.reduce((acc, locale) => {
        acc.push(...locale.langs);
        return acc;
      }, []);
      found = this.findInLang(flatLocaleLangs);
    }

    const newPath = this.path.replace(found.location, lang.location);
    this.actions.setHash(`/${this.org}/${this.site}${newPath}`);
  }

  renderLocaleLangs(langs) {
    return html`<div>
      <ul>
        ${langs.map((lang) => html`
          <li>
            <p>${lang.name}</p>
            <button @click=${() => this.handleOpen(lang)}>Open</button>
          </li>
        `)}
      </ul>
    </div>`;
  }

  renderGroup(title, items) {
    return html`
      <div class="lang-group">
        <p class="lang-group-header">${title}</p>
        <ul class="lang-group-list">${items.map((item) => html`
          <li>
            <p>${item.name}</p>
            ${item.langs ? this.renderLocaleLangs(item.langs) : html`<button @click=${() => this.handleOpen(item)}>Open</button>`}
          </li>`)}
        </ul>
      </div>
    `;
  }

  renderAll() {
    return html`
      ${this.renderGroup('Languages', this._langs)}
      ${this.renderGroup('Locales', this._locales)}
    `;
  }

  render() {
    return html`${this._langs && this.renderAll()}`;
  }
}

customElements.define('nx-locales', NxLocales);

(async function init() {
  const { context, token, actions } = await DA_SDK;
  setContext({ ...context, token });

  const nxLocales = document.createElement('nx-locales');
  nxLocales.org = context.org;
  nxLocales.site = context.repo;
  nxLocales.path = context.path;
  nxLocales.actions = actions;

  document.body.append(nxLocales);
}());
