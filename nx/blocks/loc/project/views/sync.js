import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../../../nx2/utils/utils.js';
import { overwriteCopy, rolloutCopy, formatDate, MAX_CONCURRENT_WRITES, saveStatus } from '../index.js';
import { Queue } from '../../../../../nx2/public/utils/tree.js';

const style = await loadStyle(import.meta.url);

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
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  async syncDone() {
    this._status = undefined;
    this.sourceLang.lastSync = Date.now();
    await saveStatus(this.state);
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
    const queue = new Queue(async (url) => {
      await this.syncUrl(url);
      complete += 1;
      this._status = `Syncing ${this.urls.length - complete} URLs to ${this.sourceLang.name} for translation.`;
    }, MAX_CONCURRENT_WRITES);
    await Promise.all(this.urls.map((url) => queue.push(url)));

    target.disabled = false;
    this.syncDone();
  }

  toggleExpand() {
    this.shadowRoot.querySelector('.da-loc-panel-expand-btn').classList.toggle('rotate');
    this.shadowRoot.querySelector('.da-loc-panel-content').classList.toggle('is-visible');
  }

  get _canSync() {
    // Only allow sync if translation has not been started
    // or the language is the same as the source lang.
    return this.langs.some(
      (lang) => lang.translation.status === 'not started' || lang.location === this.sourceLang.location,
    );
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
            <button class="da-loc-panel-expand-btn" @click=${this.toggleExpand} aria-label="Toggle Expand">
              <svg class="icon" viewBox="0 0 20 20"><use href="/img/icons/s2-icon-chevronright-20-n.svg#icon"/></svg>
            </button>
          </div>
        </div>
        <p class="da-loc-panel-subtitle">Project URLs are not from the language used for translation.</p>
        <div class="da-loc-panel-content">
          <ul>
            ${this.urls.map((url) => html`
              <li class="da-loc-sync-url">
                <p>${url.extPath.replace('.html', '')}</p>
                <p>${this.sourceLang.location}${url.basePath.replace('.html', '')}</p>
                <div class="da-loc-sync-check ${url.synced ? 'is-visible' : ''}">
                  <svg class="icon" viewBox="0 0 20 20"><use href="/img/icons/s2-icon-checkmark-20-n.svg#icon"/></svg>
                </div>
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
