import { LitElement, html, nothing } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import { getConfig } from '../../../../scripts/nexter.js';
import getSvg from '../../../../utils/svg.js';
import { getTranslateStepText, saveProject } from '../../utils/utils.js';
import { sortLangs, rolloutLang, getFilteredLangs, getSummaryCards } from './index.js';

const { nxBase: nx } = getConfig();

const style = await getStyle(import.meta.url);

const ICONS = [
  `${nx}/public/icons/S2_Icon_CheckmarkCircleGreen_20_N.svg`,
  `${nx}/public/icons/S2_Icon_AlertDiamondOrange_20_N.svg`,
];

class NxLocRollout extends LitElement {
  static properties = {
    org: { attribute: false },
    site: { attribute: false },
    path: { attribute: false },
    title: { attribute: false },
    options: { attribute: false },
    langs: { attribute: false },
    urls: { attribute: false },
    _summaryCards: { state: true },
    _sortedLangs: { state: true },
    _filters: { state: true },
    _message: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
    this._sortedLangs = sortLangs(this.langs);
    this._summaryCards = getSummaryCards();
  }

  handleAction({ detail }) {
    if (detail === 'prev') {
      const opts = { bubbles: true, composed: true };
      const event = new CustomEvent('prev', opts);
      this.dispatchEvent(event);
      return;
    }
    const nextDetail = { org: this.org, site: this.site, view: 'complete' };
    const opts = { detail: nextDetail, bubbles: true, composed: true };
    const event = new CustomEvent('next', opts);
    this.dispatchEvent(event);
  }

  async handleSaveProject() {
    const updates = {
      org: this.org,
      site: this.site,
      langs: this.langs,
    };
    await saveProject(this.path, updates);
  }

  async handleRolloutLang(langToRollout) {
    this._message = { text: `Rolling out ${langToRollout.name}.` };

    const actions = {
      sendMessage: (message) => { this._message = message; },
      requestUpdate: this.requestUpdate.bind(this),
    };

    const rolloutConf = {
      org: this.org,
      site: this.site,
      title: this.title,
      options: this.options,
      urls: this.urls,
      lang: langToRollout,
      actions,
    };

    const { message, errors } = await rolloutLang(rolloutConf);
    if (message || errors) {
      this._message = message;
      this._errors = errors;
      return;
    }

    // Replace the lang from the main list
    // with the one that has updated status info.
    const foundIdx = this.langs.findIndex((lang) => lang.code === langToRollout.code);
    this.langs[foundIdx] = langToRollout;

    await this.handleSaveProject();

    // Close any displayed messages
    this._message = undefined;
  }

  async handleRolloutGroup(group) {
    for (const lang of group.langs) {
      await this.handleRolloutLang(lang);
    }
  }

  handleLangToggle(lang) {
    lang.expand = !lang.expand;
    this.requestUpdate();
  }

  handleLocaleToggle(locale) {
    locale.expand = !locale.expand;
    this.requestUpdate();
  }

  /**
   * Handles summary button click
   * @param {Object} clicked the card that was clicked
   */
  handleSummaryFilter(clicked) {
    this._summaryCards.forEach((card) => {
      card.styles = [card.styles.shift()];
    });
    clicked.styles.push('is-expanded');
    this._filters = clicked.filter;
  }

  canGroupRollout(group) {
    if (this.anyRollout) return false;
    return group.canRollout;
  }

  canLangRollout(suppliedLang) {
    if (this.anyRollout) return false;
    return suppliedLang.rollout.status !== 'not ready';
  }

  getSummaryCount(filters) {
    if (!filters) return this._sortedLangs.length;
    return this._sortedLangs.filter(
      (lang) => filters.some((filter) => lang.rollout.status === filter),
    ).length;
  }

  get anyRollout() {
    return this._sortedLangs.some((lang) => lang.rollout.status === 'rolling out');
  }

  get langGroups() {
    const filteredLangs = getFilteredLangs(this._sortedLangs, this._filters);
    return Object.keys(filteredLangs).map((key) => filteredLangs[key]);
  }

  renderLocales(rollout, locales) {
    return html`<ul class="locale-list">
      ${locales.map((locale) => html`
        <li class="locale-item ${locale.expand ? 'is-expanded' : ''}">
          <div class="locale-details">
            <p>${locale.code}</p>
            <p class="sources-count">${this.urls.length}</p>
            <p class="saved-count">${locale.saved || 0}</p>
            <p class="rollout-status">${rollout.status}</p>
          <div>
          <div class="locale-urls">
            <ul>

            </ul>
          </div>
        </li>
      `)}
    </ul>`;
  }

  renderLang(lang) {
    const canRollout = this.canLangRollout(lang);
    return html`
      <li class="lang-item ${lang.expand ? 'is-expanded' : ''}">
        <div class="lang-item-details">
          <p class="lang-name">${lang.name}</p>
          <p class="sources-count">${this.urls.length}</p>
          <p class="saved-count">${lang.rollout.saved || 0}</p>
          <p class="rollout-status">${lang.rollout.status}</p>
          <div>
            ${canRollout ? html`<sl-button @click=${() => this.handleRolloutLang(lang)} class="primary outline">Rollout</sl-button>` : nothing}
          </div>
          <button @click=${() => this.handleLangToggle(lang)} class="expand">Expand language</button>
        </div>
        <div class="lang-item-locales">
          ${lang.expand ? this.renderLocales(lang.rollout, lang.locales) : nothing}
        </div>
      </li>
    `;
  }

  renderLangs(langs) {
    return html`
      <ul class="lang-list">
        ${langs.map((lang) => this.renderLang(lang))}
      </ul>
    `;
  }

  renderGroups() {
    return html`${this.langGroups.map((group) => html`
      <div class="lang-group-header">
        <p class="lang-group-title">${group.title}</p>
        ${this.canGroupRollout(group) ? html`
          <sl-button @click=${() => this.handleRolloutGroup(group)} class="accent">
            Rollout all ${group.title.toLowerCase()}
          </sl-button>` : nothing}
      </div>
      <div class="lang-group-labels">
        <p>Name</p>
        <p class="sources-count">Sources</p>
        <p class="saved-count">Rolled out</p>
        <p class="rollout-status">Status</p>
      </div>
      ${this.renderLangs(group.langs)}
    `)}`;
  }

  renderErrors() {
    if (!this._errors) return nothing;
    return html`
      <div class="lang-group-header">
        <p class="lang-group-title">Errors</p>
      </div>
      <ul class="lang-list">
        ${this._errors.map((url) => html`<li class="lang-item">
          <div class="lang-item-details lang-item-details-error">
          <p class="lang-name">${url.error}</p>
        </li>`)}
      </ul>
    `;
  }

  renderSummary() {
    return html`
      <div class="summary">
        ${this._summaryCards.map((card) => html`
          <button @click=${() => this.handleSummaryFilter(card)} class="summary-card ${card.styles.join(' ')}">
            <div class="summary-text">
              <p>${card.title}</p>
              <p>${this.getSummaryCount(card.filter)}</p>
            </div>
            <div class="expand"></div>
          </button>
        `)}
      </div>
    `;
  }

  render() {
    return html`
      <nx-loc-actions
        @action=${this.handleAction}
        .message=${this._message}
        prev=${getTranslateStepText(this.langs)}
        next="Project complete">
      </nx-loc-actions>
      ${this.renderSummary()}
      ${this.renderErrors()}
      ${this.renderGroups()}
    `;
  }
}

customElements.define('nx-loc-rollout', NxLocRollout);
