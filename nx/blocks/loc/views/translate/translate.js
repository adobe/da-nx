import { LitElement, html, nothing } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import { getConfig } from '../../../../scripts/nexter.js';
import getSvg from '../../../../utils/svg.js';
import { saveProject } from '../../utils/utils.js';
import {
  setupConnector,
  getUrls,
  saveLangItemsToDa,
  copySourceLangs,
  checkWaitingLanguages,
  sendAllForTranslation,
  removeWaitingLanguagesFromConf,
} from './index.js';

const { nxBase: nx } = getConfig();

const style = await getStyle(import.meta.url);

const ICONS = [
  `${nx}/public/icons/S2_Icon_CheckmarkCircleGreen_20_N.svg`,
  `${nx}/public/icons/S2_Icon_AlertDiamondOrange_20_N.svg`,
];

class NxLocTranslate extends LitElement {
  static properties = {
    org: { attribute: false },
    site: { attribute: false },
    path: { attribute: false },
    title: { attribute: false },
    options: { attribute: false },
    langs: { attribute: false },
    urls: { attribute: false },
    _urlErrors: { state: true },
    _connected: { state: true },
    _translateLangs: { state: true },
    _copyLangs: { state: true },
    _message: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
    this.filterLangs();
    this.setupService();
  }

  async setupService() {
    const connector = await setupConnector(this.options.service);
    this._service = { ...this.options.service, connector };
    this._connected = await this._service.connector.isConnected(this._service);
  }

  filterLangs() {
    this._translateLangs = this.langs.filter((lang) => lang.action === 'translate');
    this._copyLangs = this.langs.filter((lang) => lang.action === 'copy');
  }

  handleAction({ detail }) {
    if (detail === 'prev') {
      const opts = { bubbles: true, composed: true };
      const event = new CustomEvent('prev', opts);
      this.dispatchEvent(event);
      return;
    }
    const opts = { detail: { org: this.org, site: this.site, view: 'rollout', urls: this.urls }, bubbles: true, composed: true };
    const event = new CustomEvent('next', opts);
    this.dispatchEvent(event);
  }

  async handleSaveLangs() {
    const updates = {
      org: this.org,
      site: this.site,
      langs: this.langs,
    };
    await saveProject(this.path, updates);
    this.requestUpdate();
  }

  handleMessage(message) {
    this._message = message;
  }

  async handleConnect() {
    await this._service.connector.connect(this._service);
  }

  async getBaseTranslationConf(fetchContent) {
    const actions = {
      saveState: this.handleSaveLangs.bind(this),
      sendMessage: this.handleMessage.bind(this),
    };

    const { org, site, title, _service, _translateLangs } = this;

    const sourceLocation = this.options['source.language']?.location || '/';

    const { urls } = await getUrls(org, site, _service, sourceLocation, this.urls, fetchContent);

    return {
      org,
      site,
      title,
      service: _service,
      langs: _translateLangs,
      urls,
      actions,
    };
  }

  async handleSendAll() {
    const conf = await this.getBaseTranslationConf(true);
    const sendAll = await sendAllForTranslation(conf, this._service.connector);
    if (sendAll?.errors?.length) {
      this._urlErrors = sendAll.errors;
    }
  }

  async checkAndSaveLangs(conf) {
    this._message = { text: 'Checking for languages to save' };

    const langsToSave = this._translateLangs.filter((lang) => lang.translation?.status === 'translated');

    if (langsToSave.length) {
      const sendMessage = this.handleMessage.bind(this);

      // Overwrite the base langs to only the ones we want to save
      const saveConf = { ...conf, langs: langsToSave };

      await saveLangItemsToDa(this.options, saveConf, this._service.connector, sendMessage);
    }
    await checkWaitingLanguages(conf, this._service.connector, this.urls, this.options['source.language']?.location);

    this._message = undefined;
  }

  async handleGetStatus() {
    if (!this.incompleteLangs) {
      this._message = { text: 'All languages complete or cancelled.' };
      return;
    }

    const conf = await this.getBaseTranslationConf(false);

    await this._service.connector.getStatusAll(removeWaitingLanguagesFromConf(conf));

    await this.checkAndSaveLangs(conf);

    this.handleSaveLangs();
  }

  async handleCancelAll() {
    const sendMessage = this.handleMessage.bind(this);

    const { cancelTranslation } = this._service.connector;

    for (const lang of this._translateLangs) {
      await cancelTranslation({ service: this._service, lang, sendMessage });
    }

    // Re-fetch status to ensure the service canceled everything.
    this.handleGetStatus();
  }

  async handleCopyAll() {
    await copySourceLangs(this.org, this.site, this.title, this.options, this._copyLangs, this.urls);
    this.handleSaveLangs();
    this.requestUpdate();
  }

  get canRollout() {
    return this.langs.some((lang) => {
      const rolloutOnly = lang.action === 'rollout';
      const tranlateComplete = lang.translation?.status === 'complete';
      const copyComplete = lang.copy?.status === 'complete';
      return rolloutOnly || tranlateComplete || copyComplete;
    });
  }

  get incompleteLangs() {
    return this._translateLangs.filter((lang) => {
      const status = lang.translation?.status;
      if (status === 'complete') return false;
      if (status === 'cancelled') return false;
      return true;
    }).length;
  }

  get canCancel() {
    const { cancelTranslation } = this._service.connector;
    return !!cancelTranslation && this.incompleteLangs;
  }

  renderBehavior() {
    return html`<p><strong>Conflict behavior:</strong> ${this.options['translate.conflict.behavior']}</p>`;
  }

  renderTranslateAction() {
    if (this._connected === false) {
      return html`
        ${this.renderBehavior()}
        <sl-button @click=${this.handleConnect} class="accent">Connect</sl-button>
      `;
    }

    if (this._connected) {
      // Only langs with a translation object have been sent.
      const sent = this._translateLangs.some((lang) => lang.translation);
      const cancelled = this._translateLangs.every((lang) => lang.translation?.status === 'cancelled');

      if (!cancelled) {
        if (sent) {
          return html`
            ${this.renderBehavior()}
            ${this.canCancel ? html`<sl-button @click=${this.handleCancelAll} class="primary outline">Cancel project</sl-button>` : nothing}
            <sl-button @click=${this.handleGetStatus} class="accent">Get status</sl-button>
          `;
        }

        return html`
          ${this.renderBehavior()}
          <sl-button @click=${this.handleSendAll} class="accent">Translate all</sl-button>
        `;
      }
    }

    return nothing;
  }

  renderLangStatus(lang, suppliedType) {
    const type = suppliedType || 'translation';
    const status = lang[type]?.status || 'not started';
    const statusStyle = `is-${status.replaceAll(' ', '-')}`;

    return html`
      <div class="lang-status ${statusStyle}" title="${status === 'waiting' ? `Waiting for ${lang.waitingFor?.name ?? ''}` : status}">
        ${status}
      </div>
    `;
  }

  renderUrlErrors() {
    if (!this._urlErrors) return nothing;

    return html`
      <div class="nx-loc-list-actions">
        <p class="nx-loc-list-actions-header">Errors</p>
      </div>
      <div class="nx-loc-list-header"><p>Message</p></div>
      <ul class="error-list">
        ${this._urlErrors.map((url) => html`
          <li>
            <div class="inner">
              <p>${url.error}</p>
            </div>
          </li>
        `)}
      </ul>
    `;
  }

  renderTranslate() {
    return html`
      <div class="nx-loc-list-actions">
        <p class="nx-loc-list-actions-header">Translate (${this.options.service.name})</p>
        <div class="actions">${this.renderTranslateAction()}</div>
      </div>
      <div class="nx-loc-list-header">
        <p>Language</p>
        <p class="lang-count">Sources</p>
        <p class="lang-count">Sent</p>
        <p class="lang-count">Translated</p>
        <p class="lang-count">Saved</p>
        <p class="status-label">Status</p>
      </div>
      <ul>
        ${this._translateLangs.map((lang) => html`
          <li>
            <div class="inner">
              <p>${lang.name} - ${lang['translate type']}</p>
              <p class="lang-count">${this.urls.length}</p>
              <p class="lang-count">${lang.translation?.sent || 0}</p>
              <p class="lang-count">${lang.translation?.translated || 0}</p>
              <p class="lang-count">${lang.translation?.saved || 0}</p>
              ${this.renderLangStatus(lang)}
            </div>
          </li>
        `)}
      </ul>
    `;
  }

  renderCopy() {
    if (!this._copyLangs?.length) return nothing;

    console.log(this._copyLangs);

    return html`
      <div class="nx-loc-list-actions">
        <p class="nx-loc-list-actions-header">Copy (${this.options['source.language'].name})</p>
        <div class="actions">
          <p><strong>Conflict behavior:</strong> ${this.options['copy.conflict.behavior']}</p>
          <sl-button @click=${this.handleCopyAll} class="accent">Copy all</sl-button>
        </div>
      </div>
      <div class="nx-loc-list-header">
        <p>Location</p>
        <p class="lang-count"></p>
        <p class="lang-count"></p>
        <p class="lang-count">Sources</p>
        <p class="lang-count">Saved</p>
        <p class="status-label">Status</p>
      </div>
      <ul>
        ${this._copyLangs.map((lang) => html`
          <li>
            <div class="inner">
              <p>${lang.name} - ${this.options['source.language'].name} copy</p>
              <p class="lang-count"></p>
              <p class="lang-count"></p>
              <p class="lang-count">${this.urls.length}</p>
              <p class="lang-count">${lang.copy?.saved || 0}</p>
              <div class="url-status">
                ${this.renderLangStatus(lang, 'copy')}
              </div>
            </div>
          </li>
        `)}
      </ul>
    `;
  }

  render() {
    return html`
      <nx-loc-actions
        @action=${this.handleAction}
        .message=${this._message}
        prev="Sync sources"
        ?nextDisabled=${!this.canRollout}
        next="Rollout">
      </nx-loc-actions>
      ${this.renderUrlErrors()}
      ${this.renderTranslate()}
      ${this.renderCopy()}
    `;
  }
}

customElements.define('nx-loc-translate', NxLocTranslate);
