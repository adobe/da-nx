import { LitElement, html, nothing } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import { getConfig } from '../../../../scripts/nexter.js';
import getSvg from '../../../../utils/svg.js';
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
    project: { attribute: false },
    message: { attribute: false },
    _options: { state: true },
    _langs: { state: true },
    _urls: { state: true },
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
    this.setupService();
  }

  update(props) {
    // Allow the parent to pass or clear a message
    if (props.has('message')) this._message = this.message;
    if (props.has('project')) this.setupProject();
    super.update();
  }

  async setupService() {
    const connector = await setupConnector(this.project.options.service);
    this._service = { ...this.project.options.service, connector };
    this._connected = await this._service.connector.isConnected(this._service);
  }

  setupProject() {
    this._urls = this.project.urls;
    this._options = this.project.options;
    this._langs = this.project.langs;
    this._translateLangs = this._langs.filter((lang) => lang.action === 'translate');
    this._copyLangs = this._langs.filter((lang) => lang.action === 'copy');
  }

  handleMessage(message) {
    this._message = message;
  }

  async handleSaveLangs(props) {
    const data = props ? { langs: this._langs, ...props } : { langs: this._langs };
    const opts = { detail: { data }, bubbles: true, composed: true };
    const event = new CustomEvent('action', opts);
    this.dispatchEvent(event);
  }

  handleAction(e) {
    const { href, hash, view } = e.detail;
    const detail = { href, hash };
    if (view) detail.data = { view };

    const opts = { detail, bubbles: true, composed: true };
    const event = new CustomEvent('action', opts);
    this.dispatchEvent(event);
  }

  async handleConnect() {
    this._connected = await this._service.connector.connect(this._service);
  }

  async fetchUrls(service, fetchContent) {
    const { org, site, snapshot } = this.project;
    const sourceLocation = this._options['source.language']?.location || '/';

    return getUrls(org, site, service, sourceLocation, this._urls, fetchContent, snapshot);
  }

  async getBaseTranslationConf(fetchContent) {
    const actions = {
      saveState: this.handleSaveLangs.bind(this),
      sendMessage: this.handleMessage.bind(this),
    };

    const { org, site, title, options, snapshot } = this.project;
    const { _service: service, _translateLangs: langs } = this;

    const { urls } = await this.fetchUrls(service, fetchContent);

    return {
      org,
      site,
      snapshot,
      title,
      service,
      options,
      langs,
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
    this.handleMessage({ text: 'Checking for languages to save' });

    const langsToSave = this._translateLangs.filter((lang) => lang.translation?.status === 'translated' || lang.translation?.status === 'complete');

    if (langsToSave.length) {
      const sendMessage = this.handleMessage.bind(this);

      // Overwrite the base langs to only the ones we want to save
      const saveConf = { ...conf, langs: langsToSave };

      await saveLangItemsToDa(this._options, saveConf, this._service.connector, sendMessage);
    }
    await checkWaitingLanguages(conf, this._service.connector, this._urls, this._options['source.language']?.location);

    this.handleMessage(undefined);
  }

  async handleGetStatus() {
    // if (!this.incompleteLangs) {
    //   this.handleMessage({ text: 'All languages complete or cancelled.' });
    //   return;
    // }

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

  async handleCancelLang(lang) {
    const sendMessage = this.handleMessage.bind(this);

    const { cancelTranslation } = this._service.connector;

    await cancelTranslation({ service: this._service, lang, sendMessage });

    await this.handleGetStatus();
  }

  async handleCopyAll() {
    const { urls } = await this.fetchUrls({}, true);

    const errors = urls.filter((url) => url.error);
    if (errors.length) {
      this._urlErrors = errors;
      return;
    }

    const { org, site, title, options } = this.project;

    await copySourceLangs(org, site, title, options, this._copyLangs, urls);
    this.handleSaveLangs();
    this.requestUpdate();
  }

  get _project() {
    return {
      ...this.project,
      ...this._langs,
    };
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
    return !!(this._service?.connector?.cancelTranslation) && this.incompleteLangs;
  }

  renderBehavior() {
    return html`<p><strong>Conflict behavior:</strong> ${this._options['translate.conflict.behavior']}</p>`;
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

  renderCancelLang(lang) {
    if (!this.canCancel || !this._connected || !lang.translation || lang.translation?.status === 'cancelled') return nothing;
    return html`<sl-button @click=${() => this.handleCancelLang(lang)} class="primary outline">Cancel</sl-button>`;
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

  renderServiceLink() {
    if (!this._options.service.link) return this._options.service.name;
    return html`<a href="${this._options.service.link}" target="_blank">${this._options.service.name}</a>`;
  }

  renderTranslate() {
    if (!this._translateLangs?.length) return nothing;
    const withCancel = this.canCancel && this._connected && this._translateLangs.some((lang) => lang.translation && lang.translation.status !== 'cancelled') ? ' with-cancel' : '';

    return html`
      <div class="nx-loc-list-actions">
        <p class="nx-loc-list-actions-header">Translate (${this.renderServiceLink()})</p>
        <div class="actions">${this.renderTranslateAction()}</div>
      </div>
      <div class="nx-loc-list-header${withCancel}">
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
            <div class="inner${withCancel}">
              <p>${lang.name} - ${lang['translate type']}</p>
              <p class="lang-count">${this._urls.length}</p>
              <p class="lang-count">${lang.translation?.sent || 0}</p>
              <p class="lang-count">${lang.translation?.translated || 0}</p>
              <p class="lang-count">${lang.translation?.saved || 0}</p>
              ${this.renderLangStatus(lang)}
              ${this.renderCancelLang(lang)}
            </div>
          </li>
        `)}
      </ul>
    `;
  }

  renderCopy() {
    if (!this._copyLangs?.length) return nothing;

    return html`
      <div class="nx-loc-list-actions">
        <p class="nx-loc-list-actions-header">Copy (${this._options['source.language'].name})</p>
        <div class="actions">
          <p><strong>Conflict behavior:</strong> ${this._options['copy.conflict.behavior']}</p>
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
              <p>${lang.name} - ${this._options['source.language'].name} copy</p>
              <p class="lang-count"></p>
              <p class="lang-count"></p>
              <p class="lang-count">${this._urls.length}</p>
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
        .project=${this._project}
        .message=${this._message}
        @action=${this.handleAction}>
      </nx-loc-actions>
      ${this.renderUrlErrors()}
      ${this.renderTranslate()}
      ${this.renderCopy()}
    `;
  }
}

customElements.define('nx-loc-translate', NxLocTranslate);
