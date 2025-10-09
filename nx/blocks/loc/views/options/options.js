import { LitElement, html, nothing } from 'da-lit';
import { getConfig } from '../../../../scripts/nexter.js';
import getStyle from '../../../../utils/styles.js';
import getSvg from '../../../../utils/svg.js';
import { fetchConfig } from '../../utils/utils.js';
import { getAllActions, formatLangs, formatConfig, finalizeOptions } from './utils/utils.js';

const { nxBase: nx } = getConfig();

const style = await getStyle(import.meta.url);

const ICONS = [
  `${nx}/blocks/loc/img/Smock_Close_18_N.svg`,
  `${nx}/blocks/loc/img/Smock_Add_18_N.svg`,
];

class NxLocOptions extends LitElement {
  static properties = {
    project: { attribute: false },
    message: { attribute: false },
    _siteConfig: { state: true },
    _siteOptions: { state: true },
    _siteLangs: { state: true },
    _options: { state: true },
    _langs: { state: true },
    _actions: { state: true },
    _message: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
    this._message = { text: 'Starting the project will lock sources, options, and languages.' };
    this.formatOptions();
  }

  update(props) {
    // Allow the parent to pass or clear a message
    if (props.has('message')) this._message = this.message;
    super.update();
  }

  async formatOptions() {
    const { org, site } = this.project;
    const sheets = await fetchConfig(org, site);
    if (!(sheets.config || sheets.languages)) {
      this._message = { text: 'No config available.', type: 'error' };
      return;
    }
    const { config, options } = formatConfig(sheets);

    // Config is all available configs available from the site
    this._siteConfig = config;

    // Site options that can hold current selections
    this._siteOptions = options;

    // Langs have information inside them
    this._siteLangs = formatLangs(sheets.languages.data, config);

    // Distill down available lang actions into a single list.
    this._actions = getAllActions(this._siteLangs);

    this.updateOptions();
  }

  updateOptions() {
    const {
      options,
      langs,
      message,
    } = finalizeOptions(this._siteConfig, this._siteOptions, this._siteLangs, this.project.urls);

    if (message) return { message };

    // The parts we will persist
    this._options = options;
    this._langs = langs;

    return { updates: { options, langs } };
  }

  handleAction(e) {
    const { view } = e.detail;
    const { message, updates } = this.updateOptions();
    if (message) {
      this._message = message;
      return;
    }
    const data = { view, ...updates };
    const opts = { detail: { data }, bubbles: true, composed: true };
    const event = new CustomEvent('action', opts);
    this.dispatchEvent(event);
  }

  handleChangeOption({ target }) {
    this._siteOptions[target.name] = target.value;
    this.updateOptions();
  }

  handleLocaleToggle(e, locale) {
    e.preventDefault();
    locale.active = !locale.active;
    this._siteLangs = [...this._siteLangs];
    this.updateOptions();
  }

  handleChangeAll(e) {
    const { value } = e.target;
    // Reset to empty as we don't want to imply
    // something if its been overridden below.
    e.target.value = '';

    for (const select of this._allSelects) {
      select.value = value;
      const event = new Event('change');
      select.dispatchEvent(event);
    }

    this.updateOptions();
  }

  handleChangeAction(value, lang) {
    if (value) {
      const { orderedActions } = lang;
      const found = orderedActions.find((action) => action.value === value);
      // If not found, default to skip
      lang.activeAction = found || orderedActions.find((action) => action.value === 'skip');
    }
    this._siteLangs = [...this._siteLangs];
    this.updateOptions();
  }

  getCommaValues(prop) {
    if (!prop) return [];
    return this._siteConfig[prop]?.split(',').map((value) => value.trim()) || [];
  }

  hasLocales() {
    return this._siteLangs.some((lang) => lang.locales);
  }

  get _allSelects() {
    return this.shadowRoot.querySelectorAll('.lang-group.single-lang sl-select');
  }

  get langCount() {
    return this._siteLangs.filter((lang) => lang.activeAction.value !== 'skip').length;
  }

  get localeCount() {
    return this._siteLangs.reduce((acc, lang) => {
      let count = acc;
      if (lang.activeAction.value !== 'skip') {
        const activeLocales = lang.locales?.filter((locale) => locale.active) || [];
        count += activeLocales.length;
      }
      return count;
    }, 0);
  }

  get translateCount() {
    return this._siteLangs.filter((lang) => lang.activeAction.value === 'translate').length;
  }

  get _project() {
    return {
      ...this.project,
      langs: this._langs,
      options: this._options,
    };
  }

  renderFieldgroup(label, property) {
    const values = this.getCommaValues(property);
    return html`
      <div class="nx-loc-fieldgroup">
        <p>${label}</p>
        <sl-select name="${property}" value="${values[0]}" @change=${this.handleChangeOption}>
          ${values.map((value) => html`<option>${value}</option>`)}
        </sl-select>
      </div>`;
  }

  renderLocales(lang) {
    return html`
      <div class="lang-locales">
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

  renderChangeAll() {
    return html`
      <sl-select @change=${this.handleChangeAll}>
        <option></option>
        ${this._actions.map((action) => html`
          <option value="${action.value}">${action.name}</option>
        `)}
      </sl-select>`;
  }

  renderLangList() {
    return html`
      <p class="nx-loc-options-header">Languages</p>
      <div class="nx-loc-options-panel nx-loc-options-panel-languages">
        <div class="lang-list">
          <div class="lang-group all-langs">
            <div class="lang-heading">
              <p>All languages${this.hasLocales() ? html` & locales` : nothing}</p>
              ${this.renderChangeAll()}
            </div>
          </div>
          ${this._siteLangs.map((lang) => html`
            <div class="lang-group single-lang ${lang.locales ? 'has-locales' : ''}">
              <div class="lang-heading">
                <p>${lang.name}</p>
                <sl-select name="lang-${lang.code}-action" value=${lang.activeAction.value} @change=${(e) => this.handleChangeAction(e.target.value, lang)}>
                  ${lang.orderedActions.map((action) => html`
                    <option value="${action.value}">${action.name}</option>
                  `)}
                </sl-select>
              </div>
              ${lang.locales ? this.renderLocales(lang) : nothing}
            </div>
        </div>
      </div>
      `)}
    `;
  }

  renderDetails() {
    return html`
      <div class="detail-cards">
        <div class="detail-card detail-card-sources">
          <p class="detail-card-heading">Sources</p>
          <p>${this.project.urls.length}</p>
        </div>
        <div class="detail-card detail-card-languages">
          <p class="detail-card-heading">Languages</p>
          <p>${this.langCount}</p>
        </div>
        ${this.localeCount > 0 ? html`
          <div class="detail-card detail-card-locales">
            <p class="detail-card-heading">Locales</p>
            <p>${this.localeCount}</p>
          </div>
        ` : nothing}
         ${this.translateCount > 0 ? html`
          <div class="detail-card detail-card-translate">
            <p class="detail-card-heading">Translate total</p>
            <p>${this.translateCount * this.project.urls.length}</p>
          </div>
        ` : nothing}
        ${this.localeCount > 0 ? html`
          <div class="detail-card detail-card-rollout">
            <p class="detail-card-heading">Rollout total</p>
            <p>${this.localeCount * this.project.urls.length}</p>
          </div>
        ` : nothing}
      </div>
    `;
  }

  render() {
    return html`
      ${this._siteConfig && html`
        <nx-loc-actions
          .project=${this._project}
          .message=${this._message}
          @action=${this.handleAction}>
        </nx-loc-actions>
        ${this.project.urls && this.renderDetails()}
        <p class="nx-loc-options-header">Options</p>
        <div class="nx-loc-options-panel">
          <div class="nx-loc-options-group">
            ${this.renderFieldgroup('Environment', 'translation.service.all.env')}
          </div>
          <p class="nx-loc-options-panel-subhead">Conflict resolution</p>
          <div class="nx-loc-options-group">
            ${this.renderFieldgroup('On source sync', 'sync.conflict.behavior')}
            ${this.renderFieldgroup('On translation return', 'translate.conflict.behavior')}
            ${this.renderFieldgroup('On source copy', 'copy.conflict.behavior')}
            ${this.renderFieldgroup('On rollout', 'rollout.conflict.behavior')}
          </div>
        </div>
        ${this._siteLangs && this.renderLangList()}
      `}
    `;
  }
}

customElements.define('nx-loc-options', NxLocOptions);
