import { LitElement, html, nothing } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import { getConfig } from '../../../../scripts/nexter.js';
import getSvg from '../../../../utils/svg.js';
import { Queue } from '../../../../public/utils/tree.js';
import { getSyncUrls } from './index.js';
import { mergeCopy, overwriteCopy } from '../../project/index.js';

const { nxBase: nx } = getConfig();

const style = await getStyle(import.meta.url);

const ICONS = [
  `${nx}/public/icons/S2_Icon_CheckmarkCircleGreen_20_N.svg`,
  `${nx}/public/icons/S2_Icon_AlertDiamondOrange_20_N.svg`,
];

class NxLocSync extends LitElement {
  static properties = {
    project: { attribute: false },
    message: { attribute: false },
    _message: { state: true },
    _syncUrls: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
    this._message = this._defaultMessage;
    this.getSyncUrls();
  }

  update(props) {
    // Allow the parent to pass or clear a message
    if (props.has('message')) this._message = this.message;
    super.update();
  }

  getSyncUrls() {
    const { org, site, options, urls } = this.project;
    const sendLocation = options['source.language']?.location || '/';
    this._syncUrls = getSyncUrls(org, site, sendLocation, urls);
  }

  getPersistedUrls() {
    return this._syncUrls.map((url) => ({
      suppliedPath: url.suppliedPath,
      basePath: url.basePath,
      checked: url.checked,
      synced: url.synced,
    }));
  }

  handleAction(e) {
    const { view, hash, href } = e.detail;
    const detail = hash || href ? { hash, href } : { data: { view } }
    const opts = { detail, bubbles: true, composed: true };
    const event = new CustomEvent('action', opts);
    this.dispatchEvent(event);
  }

  async syncUrl(url) {
    const { source, destination, ext } = url;
    const behavior = this.project.options['sync.conflict.behavior'];

    // If its JSON, force overwrite
    const overwrite = behavior === 'overwrite' || ext === 'json';

    const copyFn = overwrite ? overwriteCopy : mergeCopy;
    const resp = await copyFn({ source, destination }, this.title);

    url.synced = resp.ok ? 'synced' : 'error';

    this.requestUpdate();
  }

  async handleSyncAll(type) {
    // Forcefully drop the current sync status on the URLs
    this._syncUrls.forEach((url) => { delete url.synced; });
    this.requestUpdate();

    if (type === 'skip') {
      this._syncUrls.forEach((url) => { url.synced = 'skipped'; });
      this.requestUpdate();
      return;
    }

    const syncUrl = this.syncUrl.bind(this);
    const queue = new Queue(syncUrl, 50);
    await Promise.allSettled(this._syncUrls.map((url) => queue.push(url)));

    const urls = this.getPersistedUrls();
    const opts = { detail: { data: { urls } }, bubbles: true, composed: true };
    const event = new CustomEvent('action', opts);
    this.dispatchEvent(event);
  }

  handleToggleExpand(url) {
    url.expand = !url.expand;
    this.requestUpdate();
  }

  get _project() {
    return {
      ...this.project,
      urls: this.getPersistedUrls(),
    };
  }

  get _defaultMessage() {
    const { name, location } = this.project.options['source.language'];
    return { text: `Sync sources to ${name} - ${location}` };
  }

  get _allSynced() {
    return this._syncUrls.every((url) => url.synced === 'synced' || url.synced === 'skipped');
  }

  get _syncPrefix() {
    return this.project.options['source.language'].location;
  }

  renderStatus(status) {
    const iconIds = {
      synced: '#S2_Icon_CheckmarkCircleGreen_20_N',
      skipped: '#S2_Icon_CheckmarkCircleGreen_20_N',
      error: '#S2_Icon_AlertDiamondOrange_20_N',
    };

    if (status) {
      return html`
        <svg viewBox="0 0 20 20">
          <use href="${iconIds[status]}" />
        </svg>`;
    }

    return nothing;
  }

  render() {
    return html`
      <nx-loc-actions
        .project=${this._project}
        .message=${this._message}
        @action=${this.handleAction}>
      </nx-loc-actions>
      <div class="nx-loc-list-actions">
        <div>
          <p class="nx-loc-list-actions-header">Sync</p>
          <p>Supplied URLs are not from <strong>${this.project.options['source.language'].location}</strong>. Please sync them.</p>
        </div>
        <div class="actions">
          <p><strong>Conflict behavior:</strong> ${this.project.options['sync.conflict.behavior']}</p>
          <sl-button @click=${() => this.handleSyncAll('skip')} class="primary outline">Skip sync</sl-button>
          <sl-button @click=${() => this.handleSyncAll('sync')} class="accent">Sync all</sl-button>
        </div>
      </div>
      <div class="nx-loc-list-header">
        <p>Source</p>
        <p>Destination</p>
        <p class="status-label">Status</p>
      </div>
      <ul>
        ${this._syncUrls.map((url) => html`
          <li class="${url.expand ? 'is-expanded' : ''}">
            <div class="inner">
              <p>${url.sourceView}</p>
              <p>${url.destView}</p>
              <div class="url-info">
                <div class="url-status">
                  ${this.renderStatus(url.synced)}
                </div>
                <button @click=${() => this.handleToggleExpand(url)} class="url-expand">Expand</button>
              </div>
            </div>
            ${url.expand ? html`
              <div class="url-details">
                <nx-loc-url-details
                  .path="/${this.project.org}/${this.project.site}${url.sourceView}">
                </nx-loc-url-details>
                <nx-loc-url-details
                  .path="/${this.project.org}/${this.project.site}${url.destView}">
                </nx-loc-url-details>
              </div>` : nothing}
          </li>
        `)}
      </ul>
    `;
  }
}

customElements.define('nx-loc-sync', NxLocSync);
