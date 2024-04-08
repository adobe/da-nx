import { LitElement, html, nothing } from '../../../../deps/lit/lit-core.min.js';
import { getConfig } from '../../../../scripts/nexter.js';
import getStyle from '../../../../utils/styles.js';
import getSvg from '../../../../utils/svg.js';

const { nxBase } = getConfig();
const style = await getStyle(import.meta.url);
const buttons = await getStyle(`${nxBase}/styles/buttons.js`);

const ICONS = [
  `${nxBase}/blocks/loc/img/Smock_Close_18_N.svg`,
  `${nxBase}/blocks/loc/img/Smock_Add_18_N.svg`,
];

const DA_ORIGIN = 'https://admin.da.live';
const PROJ_PATH = '/localization/projects/active';

class NxLocLangs extends LitElement {
  static properties = {
    title: { attribute: false },
    org: { attribute: false },
    repo: { attribute: false },
    urls: { attribute: false },
    langs: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style, buttons];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
  }

  get allSelects() {
    return this.shadowRoot.querySelectorAll('.lang-group select');
  }

  setupLocales(lang) {
    return lang.locales.reduce((acc, locale) => {
      if (locale.active) {
        acc[locale.code] = {
          ...locale,
          urls: this.urls.map((url) => ({
            source: `/${this.org}/${this.repo}/langstore/${lang.code}${url.pathname}.html`,
            destination: `/${this.org}/${this.repo}/${locale.code}${url.pathname}.html`,
            aemAdmin: `/${this.org}/${this.repo}/main/${locale.code}${url.pathname}`,
            preview: `${url.origin}/${locale.code}${url.pathname}`,
          })),
        };
      }

      return acc;
    }, {});
  }

  setupLangstore(lang) {
    return this.urls.map((url) => ({
      source: `/${this.org}/${this.repo}${lang.code !== 'en' ? '/langstore/en' : ''}${url.pathname}.html`,
      destination: `/${this.org}/${this.repo}/langstore/${lang.code}${url.pathname}.html`,
      aemAdmin: `/${this.org}/${this.repo}/main/langstore/${lang.code}${url.pathname}`,
      preview: `${url.origin}/langstore/${lang.code}${url.pathname}`,
    }));
  }

  async handleLangsStep() {
    const langs = this.langs.reduce((acc, lang) => {
      if (lang.action) {
        lang.langstore = { urls: this.setupLangstore(lang) };
        lang.locales = this.setupLocales(lang);
        lang.total = Object.keys(lang.locales).length * this.urls.length;
        acc.push(lang);
      }
      return acc;
    }, []);
    const project = { title: this.title, langs, urls: this.urls, step: 'new' };
    const time = Date.now();
    const body = new FormData();
    const blob = new Blob([JSON.stringify(project)], { type: 'application/json' });
    body.append('data', blob);
    const opts = { method: 'PUT', body };
    const path = `/${this.org}/${this.repo}${PROJ_PATH}/${time}`;
    const fetchPath = `${DA_ORIGIN}/source${path}.json`;
    const resp = await fetch(fetchPath, opts);
    if (!resp.ok) this._error = 'Something went wrong.';
    window.location.hash = `#${path}`;
  }

  handleSubmit(e) {
    e.preventDefault();
    this.handleLangsStep();
  }

  handleLocaleToggle(e, locale) {
    e.preventDefault();
    locale.active = !locale.active;
    this.langs = [...this.langs];
  }

  handleChangeAction(value, lang) {
    if (value) {
      lang.action = value.toLowerCase().trim();
    } else {
      delete lang.action;
    }
    this.langs = [...this.langs];
  }

  handleChangeAll(value) {
    this.allSelects.forEach((select) => {
      select.value = value;
      const event = new Event('change');
      select.dispatchEvent(event);
    });
  }

  renderLangList() {
    return html`
      <div class="sub-heading">
        <p class="lang-heading">Select languages & locales</p>
        ${this.langs ? html`
          <select @change=${(e) => this.handleChangeAll(e.target.value)}>
            <option value="">Skip</option>
            ${this.langs[2].actions.split(',').map((action) => html`
              <option value="${action}">${action}</option>
            `)}
          </select>
        ` : nothing}
      </div>
      ${this.langs.map((lang) => html`
        <div class="lang-group">
          <div class="lang-heading">
            <p>${lang.language}</p>
            <select @change=${(e) => this.handleChangeAction(e.target.value, lang)}>
              <option value="">Skip</option>
              ${lang.actions.split(',').map((action) => html`
                <option value="${action}">${action}</option>
              `)}
            </select>
          </div>
          <div>
            <p class="lang-heading">Locales</p>
            <ul class="locale-list">
              ${lang.locales.map((locale) => html`
                <li class="${locale.active ? 'active' : 'inactive'}">
                  <button @click=${(e) => this.handleLocaleToggle(e, locale)}>
                    <span>${locale.code}</span>
                    ${locale.active ? html`<svg class="icon"><use href="#spectrum-close"/></svg>` : html`<svg class="icon"><use href="#spectrum-add"/></svg>`}
                  </button>
                </li>
              `)}
            </ul>
          </div>
        </div>
      `)}
    `;
  }

  render() {
    return html`
      <form id="lang-form" class="hidden" @submit=${this.handleSubmit}>
        <div class="sub-heading">
          <h2>Select languages & locales</h2>
          <div class="actions">
            <input type="submit" value="Start project" class="accent" />
          </div>
        </div>
        <div>
          <label for="title">Title</label>
          <input type="text" name="title" value="${this.title}" disabled />
        </div>
        <div class="lang-list">
          ${this.langs ? this.renderLangList() : nothing}
        </div>
      </form>
    `;
  }
}

customElements.define('nx-loc-langs', NxLocLangs);
