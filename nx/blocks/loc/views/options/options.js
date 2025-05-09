import { LitElement, html, nothing } from 'da-lit';
import { getConfig } from '../../../../scripts/nexter.js';
import getStyle from '../../../../utils/styles.js';
import getSvg from '../../../../utils/svg.js';
import { fetchOptions } from '../../utils/utils.js';

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
    _config: { state: true },
    _langs: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
    this._message = { text: 'Clicking "manage project" will lock the project from URL, options, and language changes.' };
    this.formatOptions();
  }

  async formatOptions() {
    if (!(this.org || this.site)) {
      this._message = { text: 'No organization or site supplied.', type: 'error' };
      return;
    }
    const options = await fetchOptions(this.org, this.site);
    if (!(options.config || options.languages)) {
      this._message = { text: 'No config available.', type: 'error' };
      return;
    }
    this._config = options.config.data.reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});

    this._langs = options.languages.data;

    this._langs.forEach((lang) => {
      lang.locales = lang.locales && lang.locales.split(',').map((value) => ({ code: value.trim(), active: true }));
    });

    const name = this._config['translation.service.name'];

    const service = { name, envs: {} };
    Object.keys(this._config).forEach((key) => {
      if (key.startsWith('translation.service.')) {
        const serviceKey = key.replace('translation.service.', '');

        const [env, prop] = serviceKey.split('.');
        if (env === 'name' || env === 'all') return;
        service.envs[env] ??= {};
        service.envs[env][prop] = this._config[key];
      }
    });
    this._config.service = service;
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

  calculateActions(langs) {
    return langs.reduce((acc, lang) => {
      const actions = lang.actions.split(', ');
      actions.forEach((action) => {
        if (!acc.some((curr) => curr === action)) acc.push(action);
      });
      return acc;
    }, []);
  }

  getCommaValues(prop) {
    if (!prop) return [];
    return this._config[prop].split(',').map((value) => value.trim());
  }

  hasLocales() {
    return this._langs.some((lang) => lang.locales);
  }

  renderFieldgroup(label, property) {
    const values = this.getCommaValues(property);
    return html`
      <div class="nx-loc-fieldgroup">
        <p>${label}</p>
        <sl-select name="Source sync">
          ${values.map((value) => html`<option>${value}</option>`)}
        </sl-select>
      </div>`;
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

  renderChangeAll() {
    return html`
      <sl-select @change=${(e) => this.handleChangeAll(e.target.value)}>
        <option value="">Skip</option>
        ${this.calculateActions(this._langs).map((action) => html`
          <option value="${action}">${action}</option>
        `)}
      </sl-select>`;
  }

  renderLangList() {
    return html`
      <p class="nx-loc-options-header">Languages</p>
      <div class="nx-loc-options-panel nx-loc-options-panel-languages">
        <div class="lang-list">
          <div class="lang-group">
            <div class="lang-heading">
              <p>All languages${this.hasLocales() ? html` & locales` : nothing}</p>
              ${this.renderChangeAll()}
            </div>
          </div>
          ${this._langs.map((lang) => html`
          ${lang.actions !== '' ? html`
            <div class="lang-group ${lang.locales ? 'has-locales' : ''}">
              <div class="lang-heading">
                <p>${lang.name}</p>
                <sl-select @change=${(e) => this.handleChangeAction(e.target.value, lang)}>
                  <option value="">Skip</option>
                  ${lang.actions.split(', ').map((action) => html`
                    <option value="${action}">${action}</option>
                  `)}
                </sl-select>
              </div>
              ${lang.locales ? this.renderLocales(lang) : nothing}
            </div>` : nothing}
        </div>
      </div>
      `)}
    `;
  }

  render() {
    return html`
      <nx-loc-actions
        @action=${this.handleAction}
        .message=${this._message}
        prev="Validate references"
        next="Manage project">
      </nx-loc-actions>
      ${this._config ? html`
        <p class="nx-loc-options-header">Options</p>
        <div class="nx-loc-options-panel">
          <div class="nx-loc-options-group">
            ${this.renderFieldgroup('Environment', 'translation.service.all.envs')}
          </div>

          <p class="nx-loc-options-panel-subhead">Conflict resolution</p>
          <div class="nx-loc-options-group">
            ${this.renderFieldgroup('On source sync', 'source.conflict.behavior')}
            ${this.renderFieldgroup('On translation return', 'translate.conflict.behavior')}
            ${this.renderFieldgroup('On source copy', 'source.copy.conflict.behavior')}
            ${this.renderFieldgroup('On rollout', 'rollout.conflict.behavior')}
          </div>
        </div>
      ` : nothing}
      ${this._langs ? this.renderLangList() : nothing}
    `;
  }
}

customElements.define('nx-loc-options', NxLocOptions);
