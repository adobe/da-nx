import { LitElement, html, nothing } from '../../../../deps/lit/dist/index.js';
import { getConfig } from '../../../../scripts/nexter.js';
import getStyle from '../../../../utils/styles.js';
import getSvg from '../../../../utils/svg.js';
import { convertUrl, overwriteCopy, rolloutCopy, formatDate, saveStatus } from '../index.js';

const { nxBase } = getConfig();
const style = await getStyle(import.meta.url);
const shared = await getStyle(`${nxBase}/blocks/locfour/project/views/shared.js`);
const buttons = await getStyle(`${nxBase}/styles/buttons.js`);

const ICONS = [
  `${nxBase}/blocks/locfour/img/Smock_Checkmark_18_N.svg`,
  `${nxBase}/blocks/locfour/img/Smock_ChevronRight_18_N.svg`,
];

class NxLocSync extends LitElement {
  static properties = {
    langs: { attribute: false },
    sourceLang: { attribute: false },
    conflictBehavior: { attribute: false },
    urls: { attribute: false },
    _canSync: { state: true },
    _status: { state: true },
    _syncDate: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style, shared, buttons];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
  }

  syncDone() {
    this._status = undefined;
    this.sourceLang.lastSync = Date.now();
    saveStatus(this.state);
  }

  async syncUrl(url) {
    delete url.synced;
    this.requestUpdate();

    const copyUrl = {
      source: `${this.sitePath}${url.extPath}`,
      destination: `${this.sitePath}${this.sourceLang.location}${url.basePath}`,
    };

    if (this.conflictBehavior === 'overwrite') {
      await overwriteCopy(copyUrl, this.title);
    } else {
      await rolloutCopy(copyUrl, this.title);
    }

    if (copyUrl.status === 'success') url.synced = true;
    this.requestUpdate();
  }

  async handleSync(e) {
    const { target } = e;
    e.target.disabled = true;

    let complete = 0;
    this._status = `Syncing ${this.urls.length} URLs to ${this.sourceLang.name} for translation.`;
    await Promise.all(this.urls.map(async (url) => {
      await this.syncUrl(url);
      complete += 1;
      this._status = `Syncing ${this.urls.length - complete} URLs to ${this.sourceLang.name} for translation.`;
    }));

    target.disabled = false;
    this.syncDone();
  }

  toggleExpand() {
    this.shadowRoot.querySelector('.da-loc-panel-expand-btn').classList.toggle('rotate');
    this.shadowRoot.querySelector('.da-loc-panel-content').classList.toggle('is-visible');
  }

  get _canSync() {
    return this.langs.some((lang) => lang.translation.status === 'not started');
  }

  renderDate() {
    if (!this.sourceLang.lastSync) return nothing;
    const { date, time } = formatDate(this.sourceLang.lastSync);
    return html`<strong>Last sync:</strong> ${date} at ${time}`;
  }

  render() {
    return html`
      <div class="da-loc-panel">
        <div class="da-loc-panel-title">
          <h3>Sync ${this.sourceLang.name ? html`<span class="quiet">(${this.sourceLang.name})</span>` : nothing}</h3>
          <div class="da-loc-panel-title-expand">
            <h3>Behavior: <span class="quiet">${this.conflictBehavior}</span></h3>
            <button class="da-loc-panel-expand-btn" @click=${this.toggleExpand} aria-label="Toggle Expand"><svg class="icon"><use href="#spectrum-chevronRight"/></svg></button>
          </div>
        </div>
        <p class="da-loc-panel-subtitle">Project URLs are not from the language used for translation.</p>
        <div class="da-loc-panel-content">
          <ul>
            ${this.urls.map((url) => html`
              <li class="da-loc-sync-url">
                <p>${url.extPath.replace('.html', '')}</p>
                <p>${this.sourceLang.location}${url.basePath.replace('.html', '')}</p>
                <div class="da-loc-sync-check ${url.synced ? 'is-visible' : ''}"><svg class="icon"><use href="#spectrum-check"/></svg></div>
              </li>
            `)}
          </ul>
        </div>
        <div class="da-loc-panel-actions">
          <p>${this._status || this.renderDate() || nothing}</p>
          <button class="primary" @click=${this.handleSync} ?disabled=${!this._canSync}>Sync all</button>
        </div>
      </div>
    `;
  }
}

customElements.define('nx-loc-sync', NxLocSync);
