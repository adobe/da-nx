import { LitElement, html, nothing } from '../../../deps/lit/lit-core.min.js';
import { getConfig } from '../../../scripts/nexter.js';
import getStyle from '../../../utils/styles.js';
import getSvg from '../../../utils/svg.js';

const { nxBase } = getConfig();
const style = await getStyle(import.meta.url);
const buttons = await getStyle(`${nxBase}/styles/buttons.js`);

const DA_ORIGIN = 'https://admin.da.live';
const LANG_PATH = '/.da/languages.json';
const PROJ_PATH = '/localization/projects/active';
const ICONS = [
  `${nxBase}/blocks/loc/img/Smock_Close_18_N.svg`,
  `${nxBase}/blocks/loc/img/Smock_Add_18_N.svg`,
];

const MOCK_URLS = 'https://main--bacom--da-sites.hlx.page/customer-success-stories/workers-credit-union-case-study\nhttps://main--bacom--da-sites.hlx.page/customer-success-stories/workers-credit-union-case-study\nhttps://main--bacom--da-sites.hlx.page/customer-success-stories/western-digital-case-study\nhttps://main--bacom--da-sites.hlx.page/customer-success-stories/webmd-case-study\nhttps://main--bacom--da-sites.hlx.page/customer-success-stories/weber-state-university-case-study\nhttps://main--bacom--da-sites.hlx.page/customer-success-stories/waymark-tech-case-study\nhttps://main--bacom--da-sites.hlx.page/customer-success-stories/warriors-camera-to-cloud-case-study\nhttps://main--bacom--da-sites.hlx.page/customer-success-stories/walgreens-boots-alliance-case-study\nhttps://main--bacom--da-sites.hlx.page/customer-success-stories/vw-classic-parts-case-study\nhttps://main--bacom--da-sites.hlx.page/customer-success-stories/vodafone-training-case-study\nhttps://main--bacom--da-sites.hlx.page/customer-success-stories/vodafone-case-study';

class NxLocSetup extends LitElement {
  static properties = {
    _title: { attribute: false },
    _langs: { attribute: false },
    _urls: { attribute: false },
    _error: { attribute: false },
    _org: { attribute: false },
    _repo: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style, buttons];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
  }

  setupLocales(lang) {
    return lang.locales.reduce((acc, locale) => {
      if (locale.active) {
        acc[locale.code] = {
          ...locale,
          urls: this._urls.map((url) => ({
            source: `/${this._org}/${this._repo}/langstore/${lang.code}${url.pathname}.html`,
            destination: `/${this._org}/${this._repo}/${locale.code}${url.pathname}.html`,
            aemAdmin: `/${this._org}/${this._repo}/main/${locale.code}${url.pathname}`,
            preview: `${url.origin}/${locale.code}${url.pathname}`,
          })),
        };
      }

      return acc;
    }, {});
  }

  setupLangstore(lang) {
    return this._urls.map((url) => ({
      source: `/${this._org}/${this._repo}${lang.code !== 'en' ? '/langstore/en' : ''}${url.pathname}.html`,
      destination: `/${this._org}/${this._repo}/langstore/${lang.code}${url.pathname}.html`,
      aemAdmin: `/${this._org}/${this._repo}/main/langstore/${lang.code}${url.pathname}`,
      preview: `${url.origin}/langstore/${lang.code}${url.pathname}`,
    }));
  }

  async handleUrlsStep(form, data) {
    // Split and de-dupe
    data.urls = [...new Set(data.urls.split('\n'))];

    // Convert to proper URLs
    data.urls = data.urls.map((url) => new URL(url));

    // Get first hostname
    const { hostname } = data.urls[0];

    // Ensure all URLs have same hostname
    this._urls = data.urls.filter((url) => url.hostname === hostname);
    if (this._urls.length !== data.urls.length) {
      this._error = 'URLs are not from the same site.';
      return;
    }

    // Subdomain split
    const [repo, org] = hostname.split('.')[0].split('--').slice(1).slice(-2);
    if (!(repo || org)) {
      this._error = 'Please use AEM URLs';
      return;
    }
    this._org = org;
    this._repo = repo;

    // Get site's languages
    const resp = await fetch(`${DA_ORIGIN}/source/${org}/${repo}${LANG_PATH}`);
    if (!resp.ok) {
      this._error = 'Site has no supported languages';
      return;
    }
    const langs = (await resp.json()).data;
    this._langs = langs.map((lang) => {
      const locales = lang.locales.split(',').map((locale) => ({
        code: locale,
        active: true,
      }));
      return { ...lang, locales };
    });

    this._title = data.title;

    form.classList.add('hidden');
    form.nextElementSibling.classList.remove('hidden');
  }

  async handleLangsStep() {
    const formattedLangs = this._langs.reduce((acc, lang) => {
      if (lang.action) {
        lang.langstore = { urls: this.setupLangstore(lang) };
        lang.locales = this.setupLocales(lang);
        lang.total = Object.keys(lang.locales).length * this._urls.length;
        acc.push(lang);
      }
      return acc;
    }, []);
    const project = {
      title: this._title,
      langs: formattedLangs,
      urls: this._urls,
      step: 'new',
    };
    const time = Date.now();
    const body = new FormData();
    const blob = new Blob([JSON.stringify(project)], { type: 'application/json' });
    body.append('data', blob);
    const opts = { method: 'PUT', body };
    const path = `/${this._org}/${this._repo}${PROJ_PATH}/1711921477619`;
    const fetchPath = `${DA_ORIGIN}/source${path}.json`;
    const resp = await fetch(fetchPath, opts);
    if (!resp.ok) this._error = 'Something went wrong.';
    window.location.hash = `#${path}`;
  }

  handleSubmit(e) {
    e.preventDefault();
    const form = e.target;
    // Clear any existing errors
    this._error = undefined;

    const formData = new FormData(form);
    const data = Object.fromEntries(formData);
    if (form.id === 'url-form') this.handleUrlsStep(form, data);
    if (form.id === 'lang-form') this.handleLangsStep();
  }

  handleLocaleToggle(e, locale) {
    e.preventDefault();
    locale.active = !locale.active;
    this._langs = [...this._langs];
  }

  handleChangeAction(value, lang) {
    if (value) {
      lang.action = value.toLowerCase().trim();
    } else {
      delete lang.action;
    }
    this._langs = [...this._langs];
  }

  renderLangList() {
    return html`
      <p class="lang-heading">Select languages</p>
      ${this._langs.map((lang) => html`
        <div class="lang-group">
          <div class="lang-heading">
            <p>${lang.language}</p>
            <select @change=${(e) => this.handleChangeAction(e.target.value, lang)}>
              <option value=""></option>
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
      <h1>Create new project</h1>
      <form id="url-form" class="title" @submit=${this.handleSubmit}>
        <div class="form-heading">
          <h2>Add details</h2>
          <div class="actions">
            ${this._error ? html`<p class="error">${this._error}</p>` : nothing}
            <input type="submit" value="Next" class="accent" />
          </div>
        </div>
        <div>
          <label for="title">Title</label>
          <input type="text" name="title" value="test title" />
        </div>
        <div>
          <label for="urls">URLs</label>
          <textarea name="urls">${MOCK_URLS}</textarea>
        </div>
      </form>
      <form id="lang-form" class="hidden" @submit=${this.handleSubmit}>
        <div>
          <label for="title">Title</label>
          <input type="text" name="title" value="${this._title}" disabled />
        </div>
        <div class="form-heading">
          <h2>Select languages</h2>
          <div class="actions">
            ${this._error ? html`<p class="error">${this._error}</p>` : nothing}
            <input type="submit" value="Next" class="accent" />
          </div>
        </div>
        <div class="lang-list">
          ${this._langs ? this.renderLangList() : nothing}
        </div>
      </form>
    `;
  }
}

customElements.define('nx-loc-setup', NxLocSetup);
