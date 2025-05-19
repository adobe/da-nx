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
    org: { attribute: false },
    site: { attribute: false },
    urls: { attribute: false },
    _config: { state: true },
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

  async formatOptions() {
    if (!(this.org || this.site)) {
      this._message = { text: 'No organization or site supplied.', type: 'error' };
      return;
    }
    const sheets = await fetchConfig(this.org, this.site);
    if (!(sheets.config || sheets.languages)) {
      this._message = { text: 'No config available.', type: 'error' };
      return;
    }
    const { config, options } = formatConfig(sheets);

    // Config is all available configs to pick from
    this._config = config;

    // Options are the currently active config options
    this._options = options;

    // Langs have information inside them
    this._langs = formatLangs(sheets.languages.data);

    // Distill down available lang actions into a single list.
    this._actions = getAllActions(this._langs);
  }

  handleSubmit() {
    const {
      view,
      options,
      langs,
      message,
    } = finalizeOptions(this._config, this._options, this._langs, this.urls);

    if (message) {
      this._message = message;
      return;
    }

    const detail = { org: this.org, site: this.site, view, options, langs };
    const opts = { detail, bubbles: true, composed: true };
    const event = new CustomEvent('next', opts);
    this.dispatchEvent(event);
  }

  handleChangeOption({ target }) {
    this._options[target.name] = target.value;
  }

  handleAction({ detail }) {
    if (detail === 'prev') {
      const opts = { bubbles: true, composed: true };
      const event = new CustomEvent('prev', opts);
      this.dispatchEvent(event);
    }
    if (detail === 'next') this.handleSubmit();
  }

  handleLocaleToggle(e, locale) {
    e.preventDefault();
    locale.active = !locale.active;
    this._langs = [...this._langs];
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
  }

  handleChangeAction(value, lang) {
    if (value) {
      const { orderedActions } = lang;
      const found = orderedActions.find((action) => action.value === value);
      // If not found, default to skip
      lang.activeAction = found || orderedActions.find((action) => action.value === 'skip');
    }
    this._langs = [...this._langs];
  }

  getCommaValues(prop) {
    if (!prop) return [];
    return this._config[prop].split(',').map((value) => value.trim());
  }

  hasLocales() {
    return this._langs.some((lang) => lang.locales);
  }

  get _allSelects() {
    return this.shadowRoot.querySelectorAll('.lang-group.single-lang sl-select');
  }

  get langCount() {
    return this._langs.filter((lang) => lang.activeAction.value !== 'skip').length;
  }

  get localeCount() {
    return this._langs.reduce((acc, lang) => {
      let count = acc;
      if (lang.activeAction.value !== 'skip') {
        const activeLocales = lang.locales.filter((locale) => locale.active);
        count += activeLocales.length;
      }
      return count;
    }, 0);
  }

  get translateCount() {
    return this._langs.filter((lang) => lang.activeAction.value === 'translate').length;
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
          ${this._langs.map((lang) => html`
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
          <p>${this.urls.length}</p>
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
            <p>${this.translateCount * this.urls.length}</p>
          </div>
        ` : nothing}
        ${this.localeCount > 0 ? html`
          <div class="detail-card detail-card-rollout">
            <p class="detail-card-heading">Rollout total</p>
            <p>${this.localeCount * this.urls.length}</p>
          </div>
        ` : nothing}
      </div>
    `;
  }

  render() {
    return html`
      <nx-loc-actions
        @action=${this.handleAction}
        .message=${this._message}
        prev="Validate sources"
        next="Start project">
      </nx-loc-actions>
      ${this._config && html`
        ${this.urls && this.renderDetails()}
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
        ${this._langs && this.renderLangList()}
      `}
    `;
  }
}

customElements.define('nx-loc-options', NxLocOptions);
