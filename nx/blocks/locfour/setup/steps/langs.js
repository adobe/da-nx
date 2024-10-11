import { LitElement, html, nothing } from '../../../../deps/lit/lit-core.min.js';
import { getConfig } from '../../../../scripts/nexter.js';
import { daFetch } from '../../../../utils/daFetch.js';
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

  async handleLangsStep(options) {
    const sourceLang = this.langs.find((lang) => lang.language === this.config['source.language']?.value);

    const langs = this.langs.reduce((acc, lang) => {
      const { action, locales, location, language: name, code } = lang;

      if (lang.action) {
        acc.push({ action, locales, location, name, code });
      }
      return acc;
    }, []);

    const project = {
      title: this.title,
      org: this.org,
      site: this.repo,
      options,
      sourceLang,
      langs,
      urls: this.urls.map((url) => ({
        pathname: url.pathname,
        extpath: url.extPath,
      })),
    };

    const time = Date.now();
    const body = new FormData();
    const blob = new Blob([JSON.stringify(project)], { type: 'application/json' });
    body.append('data', blob);
    const opts = { method: 'PUT', body };
    const path = `/${this.org}/${this.repo}${PROJ_PATH}/${time}`;
    const fetchPath = `${DA_ORIGIN}/source${path}.json`;
    const resp = await daFetch(fetchPath, opts);
    if (!resp.ok) this._error = 'Something went wrong.';
    window.location.hash = `#${path}`;
  }

  getConflictOpts(name) {
    if (this.config[name]) {
      return [
        this.config[name].value,
        this.config[name].value === 'merge' ? 'overwrite' : 'merge',
      ];
    }
    return [
      'overwrite',
      'merge',
    ];
  }

  hasLocales() {
    return this.langs.some((lang) => lang.locales);
  }

  handleSubmit(e) {
    e.preventDefault();

    const data = new FormData(e.target);
    const sourceConflict = data.get('source.conflict.behavior');
    const returnConflict = data.get('translate.conflict.behavior');
    const rolloutConflict = data.get('rollout.conflict.behavior');
    const autoPreview = data.get('complete.aem.preview');
    const autoPublish = data.get('complete.aem.publish');

    const options = {
      sourceConflict,
      returnConflict,
      rolloutConflict,
      autoPreview,
      autoPublish,
    };

    this.handleLangsStep(options);
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

  renderLocales(lang) {
    return html`
      <div>
        <p class="locale-heading">Locales</p>
        <ul class="locale-list">
          ${lang.locales.map((locale) => html`
            <li class="${locale.active ? 'active' : 'inactive'}">
              <button @click=${(e) => this.handleLocaleToggle(e, locale)}>
                <span>${locale.code.replace('/', '')}</span>
                ${locale.active ? html`<svg class="icon"><use href="#spectrum-close"/></svg>` : html`<svg class="icon"><use href="#spectrum-add"/></svg>`}
              </button>
            </li>
          `)}
        </ul>
      </div>
    `;
  }

  renderLangList() {
    return html`
      <div class="lang-list">
        <div class="sub-lang-heading">
          <h2>Languages${this.hasLocales() ? html` & locales` : nothing}</h2>
          ${this.langs ? html`
            <select @change=${(e) => this.handleChangeAll(e.target.value)}>
              <option value="">Skip</option>
              ${this.langs[1].actions.split(',').map((action) => html`
                <option value="${action}">${action}</option>
              `)}
            </select>
          ` : nothing}
        </div>
        ${this.langs.map((lang) => html`
          <div class="lang-group ${lang.locales ? 'has-locales' : ''}">
            <div class="lang-heading">
              <h3>${lang.language}</h3>
              <select @change=${(e) => this.handleChangeAction(e.target.value, lang)}>
                <option value="">Skip</option>
                ${lang.actions.split(',').map((action) => html`
                  <option value="${action}">${action}</option>
                `)}
              </select>
            </div>
            ${lang.locales ? this.renderLocales(lang) : nothing}
          </div>
        </div>
      `)}
    `;
  }

  renderOption(label, name) {
    if (!this.config[name]) return nothing;
    return html`
      <div class="da-loc-job-option">
        <label>${label}</label>
        <p>${this.config[name].description}</p>
        <select name="${name}">
          ${this.getConflictOpts(name).map((opt) => html`<option>${opt}</option>`)}
        </select>
      </div>
    `;
  }

  renderConfig() {
    return html`
      <h2>Options</h2>
      <div class="da-loc-job-options conflict-section">
        <h3>Conflict resolution</h3>
        <div class="da-loc-job-option-group">
          ${this.renderOption('On source sync', 'source.conflict.behavior')}
          ${this.renderOption('On translation return', 'translate.conflict.behavior')}
          ${this.hasLocales() ? this.renderOption('On rollout', 'rollout.conflict.behavior') : nothing}
        </div>
      </div>
      <div class="da-loc-job-options complete-section">
        <h3>Preview & publish</h3>
        <div class="da-loc-job-option-group">
          ${this.renderOption('Auto preview on complete', 'complete.aem.preview')}
          ${this.renderOption('Auto publish on complete', 'complete.aem.publish')}
        </div>
      </div>
    `;
  }

  render() {
    return html`
      <form id="lang-form" class="hidden" @submit=${this.handleSubmit}>
        <div class="sub-heading">
          <h2>Details</h2>
          <div class="actions">
            <input type="submit" value="Create project" class="accent" />
          </div>
        </div>
        <div>
          <label for="title">Title</label>
          <input type="text" name="title" value="${this.title}" disabled />
        </div>
        ${this.config ? this.renderConfig() : nothing}
        ${this.langs ? this.renderLangList() : nothing}
      </form>
    `;
  }
}

customElements.define('nx-loc-langs', NxLocLangs);
