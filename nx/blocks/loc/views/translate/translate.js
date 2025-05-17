import { LitElement, html, nothing } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import { getConfig } from '../../../../scripts/nexter.js';
import getSvg from '../../../../utils/svg.js';
import { setupConnector, fetchContent } from './index.js';

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
    this.setupService();
    this.filterLangs();
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
    }
    // const detail = { org: this.org, site: this.site, view, urls };
    // const opts = { detail, bubbles: true, composed: true };
    // const event = new CustomEvent('next', opts);
    // this.dispatchEvent(event);
  }

  handleSaveLangs() {
    console.log('Saving langs');
  }

  handleMessage(message) {
    this._message = message;
  }

  async handleConnect() {
    await this._service.connector.connect(this._service);
  }

  async handleSendAll() {
    const sourceLocation = this.options['source.language']?.location || '/';

    const { urls } = await fetchContent(this.org, this.site, sourceLocation, this.urls);

    this._urlErrors = urls.filter((url) => url.error);
    if (this._urlErrors.length) return;

    const actions = {
      requestUpdate: this.requestUpdate.bind(this),
      saveLangs: this.handleSaveLangs.bind(this),
      setMessage: this.handleMessage.bind(this),
    };

    // const translateConf = {
    //   title: this.title,
    //   service: this._service,
    //   langs: this._translateLangs,
    //   urls,
    //   actions,
    // };

    // this._service.connector.sendAllLanguages(translateConf);
  }

  renderTranslateAction() {
    if (this._connected === false) {
      return html`
        <p><strong>Conflict behavior:</strong> ${this.options['translate.conflict.behavior']}</p>
        <sl-button @click=${this.handleConnect} class="accent">Connect</sl-button>
      `;
    }

    if (this._connected) {
      return html`
        <p><strong>Conflict behavior:</strong> ${this.options['translate.conflict.behavior']}</p>
        <sl-button @click=${this.handleSendAll} class="accent">Translate all</sl-button>
      `;
    }

    return nothing;
  }

  renderLangStatus(lang) {
    const status = lang.translation?.status || 'not started';
    const statusStyle = `is-${status.replaceAll(' ', '-')}`;

    return html`
      <div class="lang-status ${statusStyle}">
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
              <p class="lang-count">${lang.sent || 0}</p>
              <p class="lang-count">${lang.translate || 0}</p>
              <p class="lang-count">${lang.saved || 0}</p>
              ${this.renderLangStatus(lang)}
            </div>
          </li>
        `)}
      </ul>
    `;
  }

  renderCopy() {
    return html`
      <div class="nx-loc-list-actions">
        <p class="nx-loc-list-actions-header">Copy (${this.options['source.language'].name})</p>
        <div class="actions">
          <p><strong>Conflict behavior:</strong> ${this.options['copy.conflict.behavior']}</p>
          <sl-button @click=${this.handleSyncAll} class="accent">Copy all</sl-button>
        </div>
      </div>
      <div class="nx-loc-list-header">
        <p>Location</p>
        <p class="lang-count">Sources</p>
        <p class="lang-count">Sent</p>
        <p class="lang-count">Translated</p>
        <p class="lang-count">Saved</p>
        <p class="status-label">Status</p>
      </div>
      <ul>
        ${this._copyLangs.map((lang) => html`
          <li>
            <div class="inner">
              <p>${lang.location} (${lang.name})</p>
              <p class="lang-count">${this.urls.length}</p>
              <p class="lang-count">${lang.sent || 0}</p>
              <p class="lang-count">${lang.translate || 0}</p>
              <p class="lang-count">${lang.saved || 0}</p>
              <div class="url-status">
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
        next="Rollout">
      </nx-loc-actions>
      ${this.renderUrlErrors()}
      ${this.renderTranslate()}
      ${this.renderCopy()}
    `;
  }
}

customElements.define('nx-loc-translate', NxLocTranslate);
