import { LitElement, html, nothing } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import { getConfig } from '../../../../scripts/nexter.js';
import getSvg from '../../../../utils/svg.js';
import { Queue } from '../../../../public/utils/tree.js';
import { filterSyncUrls } from './index.js';
import { mergeCopy, overwriteCopy } from '../../project/index.js';
import DaUrl from '../../utils/daUrl.js';

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
    _syncSources: { state: true },
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
    const { options, langs, urls, sync } = this.project;

    // Hydrate from an existing sync object
    if (sync) {
      this._syncSources = Object.keys(sync).reduce((acc, key) => {
        acc[key] = sync[key].map((pair) => ({
          source: new DaUrl(pair.source),
          destination: new DaUrl(pair.destination),
          synced: pair.synced,
        }));
        return acc;
      }, {});
      return;
    }

    // Fallback to parsing langs and URLs - new or legacy project
    // Group and filter only the URLs that need a sync
    this._syncSources = filterSyncUrls(options, langs, urls);
  }

  handleAction(e) {
    const { view, hash, href } = e.detail;
    const detail = hash || href ? { hash, href } : { data: { view } };
    const opts = { detail, bubbles: true, composed: true };
    const event = new CustomEvent('action', opts);
    this.dispatchEvent(event);
  }

  async syncUrl(url) {
    const { source, destination } = url;
    const behavior = this.project.options['sync.conflict.behavior'];

    const { org: sourceOrg, site: sourceSite, daAdminPath: sourceDaPath } = source.supplied;
    const { org: destOrg, site: destSite, daAdminPath: destDaPath } = destination.supplied;

    // If its JSON, force overwrite
    const overwrite = behavior === 'overwrite' || source.supplied.daAdminPath.endsWith('.json');

    const copyConf = {
      source: `/${sourceOrg}/${sourceSite}${sourceDaPath}`,
      destination: `/${destOrg}/${destSite}${destDaPath}`,
    };

    const copyFn = overwrite ? overwriteCopy : mergeCopy;
    const resp = await copyFn(copyConf, this.title);
    url.synced = resp.ok ? 'synced' : 'error';

    this.requestUpdate();
  }

  async handleSyncAll(type) {
    // Forcefully drop the current sync status on the URLs
    this._flatUrls.forEach((url) => { delete url.synced; });
    this.requestUpdate();

    if (type === 'skip') {
      this._flatUrls.forEach((url) => { url.synced = 'skipped'; });
      this.requestUpdate();
      return;
    }

    const syncUrl = this.syncUrl.bind(this);
    const queue = new Queue(syncUrl, 50);
    await Promise.all(this._flatUrls.map((url) => queue.push(url)));

    // Flatten down source and destination DaUrls to only hrefs and sync status
    const toPersist = Object.keys(this._syncSources).reduce((acc, key) => {
      const urls = this._syncSources[key].map(({ source, destination, synced }) => ({
        source: source.href,
        destination: destination.href,
        synced,
      }));
      acc[key] = urls;
      return acc;
    }, {});

    const opts = { detail: { data: { sync: toPersist } }, bubbles: true, composed: true };
    const event = new CustomEvent('action', opts);
    this.dispatchEvent(event);
  }

  handleToggleExpand(url) {
    url.expand = !url.expand;
    this.requestUpdate();
  }

  // Get a truly flat list of sync source pairs
  get _flatUrls() {
    if (!this._syncSources?.length) return [];
    return Object.keys(this._syncSources).reduce((acc, key) => {
      acc.push(...this._syncSources[key]);
      return acc;
    }, []);
  }

  get _project() {
    return {
      ...this.project,
      // urls: this.getPersistedUrls(),
    };
  }

  get _defaultMessage() {
    return { text: 'Some sources need to be synced.' };
  }

  get _allSynced() {
    const done = this._flatUrls.every((pair) => pair.synced);
    console.log(done);
    return done;
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
        <div class="nx-loc-actions-header">
          <p class="nx-loc-list-actions-header">Sync</p>
          <div class="actions">
            <p><strong>Conflict behavior:</strong> ${this.project.options['sync.conflict.behavior']}</p>
            <sl-button @click=${() => this.handleSyncAll('skip')} class="primary outline">Skip sync</sl-button>
            <sl-button @click=${() => this.handleSyncAll('sync')} class="accent">Sync all</sl-button>
          </div>
        </div>
        ${Object.keys(this._syncSources).map((sourcePath) => html`
          <p class="nx-loc-sync-source-title">Supplied URLs are not from <strong>${sourcePath}</strong>. Please sync them.</p>
          <div class="nx-loc-list-header">
            <p>Source</p>
            <p>Destination</p>
            <p class="status-label">Status</p>
          </div>
          <ul>
            ${this._syncSources[sourcePath].map((url) => html`
              <li class="${url.expand ? 'is-expanded' : ''}">
                <div class="inner">
                  <p>${url.source.supplied.aemPath}</p>
                  <p>${url.destination.supplied.aemPath}</p>
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
                      .path="${url.source.aemPath}">
                    </nx-loc-url-details>
                    <nx-loc-url-details
                      .path="/${url.destination.aemPath}">
                    </nx-loc-url-details>
                  </div>` : nothing}
              </li>
            `)}
          </ul>
        `)}
      
        
        
      
      
      
    `;
  }
}

customElements.define('nx-loc-sync', NxLocSync);
