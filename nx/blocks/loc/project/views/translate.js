import { LitElement, html, nothing } from '../../../../deps/lit/dist/index.js';
import { DA_ORIGIN } from '../../../../public/utils/constants.js';
import { getConfig } from '../../../../scripts/nexter.js';
import { daFetch } from '../../../../utils/daFetch.js';
import getStyle from '../../../../utils/styles.js';
import getSvg from '../../../../utils/svg.js';
import { detectService, saveLangItems, saveStatus, formatDate } from '../index.js';

const { nxBase } = getConfig();
const style = await getStyle(import.meta.url);
const shared = await getStyle(`${nxBase}/blocks/loc/project/views/shared.css`);
const buttons = await getStyle(`${nxBase}/styles/buttons.js`);

const ICONS = [
  `${nxBase}/blocks/loc/img/Smock_ChevronRight_18_N.svg`,
];

class NxLocTranslate extends LitElement {
  static properties = {
    state: { attribute: false },
    config: { attribute: false },
    sourceLang: { attribute: false },
    langs: { attribute: false },
    urls: { attribute: false },
    _status: { state: true },
    _connected: { state: true },
    _fetchingStatus: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style, shared, buttons];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
    this.connectService();
    this.formatUrls();
  }

  async connectService() {
    const { options } = this.state;
    const { environment = 'stage' } = options || {};
    this._service = await detectService(this.config, environment);
    this._actions = this._service.actions;
    this._dnt = this._service.dnt;
    this._serviceSupportsCancel = this._actions.canCancel && this._actions.canCancel();
    this._connected = await this._service.actions.isConnected(this._service);
  }

  setStatus(text) {
    this._status = text;
  }

  requestPanelUpdates() {
    const opts = { detail: true, bubbles: true, composed: true };
    const event = new CustomEvent('status', opts);
    this.dispatchEvent(event);
  }

  async saveState() {
    await saveStatus(this.state);
    this.requestPanelUpdates();
    this.requestUpdate();
  }

  async handleConnect() {
    const result = await this._actions.connect(this._service);
    if (result === true) this._connected = true;
  }

  formatUrls() {
    this.urls.forEach((url) => {
      const prefix = this.sourceLang.location === '/' ? '' : this.sourceLang.location;
      const path = url.basePath.startsWith(prefix) ? url.basePath : `${prefix}${url.basePath}`;
      url.srcPath = `${this.sitePath}${path}`;
    });
  }

  async handleSaveLang(lang) {
    this.setStatus(`Saving ${lang.translation.translated} items for ${lang.name}.`);
    lang.translation.status = 'saving';
    lang.translation.saved = 0;
    this.requestUpdate();

    const items = await this._actions.getItems(this._service, lang, this.urls);

    const results = await saveLangItems(this.sitePath, items, lang, this._service.dnt.removeDnt);

    const success = results.filter((result) => (result.success)).length;
    lang.translation.saved = success;
    if (success === this.urls.length) {
      lang.translation.status = 'complete';
      lang.rollout = {
        status: 'ready',
        ready: success,
      };
    }
    this.setStatus();
    await this.saveState();
  }

  async autoSaveLangs() {
    const autoSaveLangs = this.langs.filter((lang) => {
      const { translated, saved } = lang.translation;
      return translated === this.urls.length && (!saved || saved === 0);
    });

    for (const lang of autoSaveLangs) {
      await this.handleSaveLang(lang);
    }
  }

  async handleStatus() {
    this._fetchingStatus = true;

    const actions = {
      setStatus: this.setStatus.bind(this),
      saveState: this.saveState.bind(this),
    };

    const { title, _service, langs, urls } = this;
    await this._actions.getStatusAll(title, _service, langs, urls, actions);

    await this.autoSaveLangs();

    if (this._completeLangs === this.langs.length) {
      this.state.translateComplete = Date.now();
      await this.saveState();
    }

    this._fetchingStatus = false;
  }

  async doCancelLang(lang) {
    this._actions.cancelLang(this._service, lang);
    lang.translation.status = 'cancelled';
  }

  async handleCancelLang(lang) {
    this.setStatus(`Cancelling task for ${lang.name}`);
    await this.doCancelLang(lang);
    this.setStatus();
    await this.saveState();
  }

  async handleCancelAll() {
    this.setStatus('Cancelling all tasks');
    await Promise.all(this.langs
      .filter((lang) => lang.translation.status === 'created')
      .map((lang) => this.doCancelLang(lang)));
    this.setStatus();
    await this.saveState();
  }

  async getSiteConfig() {
    let resp = await daFetch(`${DA_ORIGIN}/source/${this.state.org}/${this.state.site}/.da/translate.json`);
    if (!resp.ok) {
      resp = await fetch(`${nxBase}/blocks/loc/setup/translate.json`);
    }
    return resp.json();
  }

  async getSourceContent() {
    this._status = 'Getting source content';

    const siteConfig = await this.getSiteConfig();

    await Promise.all(this.urls.map(async (url) => {
      const resp = await daFetch(`${DA_ORIGIN}/source${url.srcPath}`);
      if (!resp.ok) {
        url.error = 'Error fetching document for DNT.';
        url.status = 520;
        return;
      }
      const text = await resp.text();
      const extension = url.srcPath.split('.').pop();
      url.content = await this._service.dnt.addDnt(text, siteConfig, { fileType: extension });
    }));

    // Check for errors
    this._errors = this.urls.filter((url) => url.error);
    if (this._errors.length > 0) {
      this._status = 'Errors fetching documents.';
      return false;
    }

    return true;
  }

  async sendForTranslation() {
    this.setStatus('Sending to translation provider');

    const actions = {
      setStatus: this.setStatus.bind(this),
      saveState: this.saveState.bind(this),
    };

    const { title, _service, langs, urls, state } = this;
    await this._actions.sendAllLanguages(title, _service, langs, urls, actions, state);

    return !this.langs.some((lang) => lang.translation.status !== 'created');
  }

  async handleTranslateAll(e) {
    const { target } = e;
    target.disabled = true;

    // Ensure sync is disabled during send
    this.langs.forEach((lang) => { lang.translation.status = 'starting'; });
    this.requestPanelUpdates();

    const contentSuccess = await this.getSourceContent();
    if (!contentSuccess) return;

    // Source docs are ready for translation
    this.langs.forEach((lang) => { lang.translation.status = 'ready'; });

    const sendSuccess = await this.sendForTranslation();
    if (!sendSuccess) return;

    // Get an initial status after send
    this.handleStatus();
  }

  toggleExpand() {
    this.shadowRoot.querySelector('.da-loc-panel-expand-btn').classList.toggle('rotate');
    this.shadowRoot.querySelector('.da-loc-panel-content').classList.toggle('is-visible');
  }

  get _translateComplete() {
    return this.state.translateComplete;
  }

  get _completeLangs() {
    return this.langs.filter((lang) => lang.translation.status === 'complete').length;
  }

  get _canStatus() {
    if (this._fetchingStatus) return false;
    return this._completeLangs < this.langs.length;
  }

  get _canTranslate() {
    return this.langs.some((lang) => lang.translation.status === 'not started');
  }

  canCancelLang(lang) {
    return this._serviceSupportsCancel && lang.translation.status === 'created';
  }

  canCancelAll() {
    return this._serviceSupportsCancel && this.langs.every((lang) => ['created', 'cancelled'].includes(lang.translation.status));
  }

  renderDate() {
    if (!this._translateComplete) return nothing;
    const { date, time } = formatDate(this._translateComplete);
    return html`<strong>Completed:</strong> ${date} at ${time}.`;
  }

  renderErrors() {
    return html`
      <div class="da-loc-panel-errors">
        <ul>
          ${this._errors.map((err) => html`
            <li>
              <p><strong>${err.error}</strong></p>
              <p>${err.srcPath}</p>
              ${err.status ? html`<div class="da-error-box">${err.status}</div>` : nothing}
            </li>
          `)}
        </ul>
      </div>`;
  }

  renderActions() {
    if (!this._connected) return html`<button class="primary" @click=${this.handleConnect}>Connect</button>`;
    if (this._canTranslate) return html`<button class="primary" @click=${this.handleTranslateAll}>Send all for translation</button>`;
    return html`<button class="primary" @click=${this.handleStatus} ?disabled=${!this._canStatus}>Get status</button>`;
  }

  renderCancelAction() {
    if (!this.canCancelAll()) return nothing;
    return html`<button class="primary" @click=${this.handleCancelAll} ?disabled=${!this.canCancelAll()}>Cancel all</button>`;
  }

  renderSaveLang(lang) {
    if (lang.translation.saved && !this._service?.canResave) return nothing;
    return html`<button class="primary" @click=${() => { this.handleSaveLang(lang); }} ?disabled=${lang.translation.status === 'saving'}>${lang.translation.saved ? 'Re-save' : 'Save'}</button>`;
  }

  renderCancelLang(lang) {
    return html`<button class="primary" @click=${() => { this.handleCancelLang(lang); }} ?disabled=${lang.translation.status === 'saving'}>Cancel</button>`;
  }

  render() {
    return html`
      <div class="da-loc-panel">
        <div class="da-loc-panel-title">
          <h3>Translate <span class="quiet">(${this._service?.name})</span></h3>
          <div class="da-loc-panel-title-expand">
            <h3>Behavior: <span class="quiet">overwrite</span></h3>
            <button class="da-loc-panel-expand-btn rotate" @click=${this.toggleExpand} aria-label="Toggle Expand"><svg class="icon"><use href="#spectrum-chevronRight"/></svg></button>
          </div>
        </div>
        <div class="da-loc-panel-content is-visible">
          <div class="da-lang-cards">
            ${this.langs.map((lang) => html`
              <div class="da-lang-card">
                <div class="da-card-header ${lang.translation.status}">
                  <div>
                    <p class="da-card-subtitle">Language</p>
                    <p class="da-card-title">${lang.name}</p>
                  </div>
                  <p class="da-card-badge">${lang.translation.status}</p>
                </div>
                <div class="da-card-content">
                  <div class="da-card-details">
                    <div>
                      <p class="da-card-subtitle">Sent</p>
                      <p class="da-card-title">${lang.translation.sent || 0} of ${this.urls.length}</p>
                    </div>
                    <div>
                      <p class="da-card-subtitle">Translated</p>
                      <p class="da-card-title">${lang.translation.translated || 0} of ${this.urls.length}</p>
                    </div>
                    <div>
                      <p class="da-card-subtitle">Saved</p>
                      <p class="da-card-title">${lang.translation.saved || 0} of ${this.urls.length}</p>
                    </div>
                  </div>
                </div>
                <div class="da-card-actions">
                  <p></p>
                  ${lang.translation.translated === this.urls.length ? this.renderSaveLang(lang) : nothing}
                  ${this._connected && this.canCancelLang(lang) ? this.renderCancelLang(lang) : nothing}
                </div>
              </div>
            `)}
          </div>
        </div>
        ${this._errors?.length > 0 ? this.renderErrors() : nothing}
        <div class="da-loc-panel-actions">
          <p>${this._status || this.renderDate() || nothing}</p>
          ${this.renderCancelAction()}
          ${this.renderActions()}
        </div>
      </div>
    `;
  }
}

customElements.define('nx-loc-translate', NxLocTranslate);
