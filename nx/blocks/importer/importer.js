import { LitElement, html, nothing } from '../../deps/lit/lit-core.min.js';
import { getConfig } from '../../scripts/nexter.js';
import getStyle from '../../utils/styles.js';
import { importAll, calculateTime } from './index.js';
import getSvg from '../../utils/svg.js';

const { nxBase } = getConfig();
const style = await getStyle(import.meta.url);
const buttons = await getStyle(`${nxBase}/styles/buttons.js`);

const ICONS = [
  `${nxBase}/img/icons/Smock_ChevronRight_18_N.svg`,
];

const MOCK_URLS = 'https://main--bacom--adobecom.hlx.live/products/experience-platform/planning-and-measurement\nhttps://main--bacom--adobecom.hlx.live/ae_ar/\nhttps://main--bacom--adobecom.hlx.live/.milo/edge-worker-config.json\nhttps://main--bacom--adobecom.hlx.live/ae_ar/sitemap.xml\nhttps://main--bacom--adobecom.hlx.live/assets/icons/badge-icon-infofilled.svg\nhttps://main--bacom--adobecom.hlx.live/assets/pdfs/resources/unlock-the-amazing-possibilities-of-personalization/unlock-the-amazing-possibilities-of-personalization-v3.pdf\nhttps://main--bacom--adobecom.hlx.live/assets/videos/customer-success-stories/adobe-generative-ai-case-study.mp4\n';

class NxImporter extends LitElement {
  static properties = {
    _urls: { state: true },
    _isImporting: { state: true },
    _status: { state: true },
    _processed: { state: true },
    _expanded: { state: true },
  };

  constructor() {
    super();
    this._urls = [];
    this._status = {};
    this._processed = 0;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style, buttons];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
  }

  setStatus(text, type = 'error') {
    if (!text) {
      this._status = {};
      this.statusDialog.close();
      return;
    }
    this._status = { text, type };
    this.statusDialog.showModal();
  }

  setProcessed() {
    this._processed += 1;
  }

  async import(findFragments) {
    this._isImporting = true;
    const startTime = Date.now();

    const requestUpdate = this.requestUpdate.bind(this);
    const setProcessed = this.setProcessed.bind(this);
    await importAll(this._urls, findFragments, setProcessed, requestUpdate);

    const time = calculateTime(startTime);
    this.setStatus(`Import of ${this._urls.length} URLs took: ${time} minutes`, 'info');
    this._isImporting = false;
  }

  async handleSubmit(e) {
    this._processed = 0;
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);

    if (!(data.org || data.repo)) {
      console.log('No org or repo to import into');
      return;
    }

    const findFragments = data.fragments === 'yes';
    this._urls = [];

    if (data.index) {
      const { origin } = new URL(data.index);
      const resp = await fetch(data.index);
      if (!resp.ok) this.setStatus('Query Index could not be downloaded. CORs error?');
      const json = await resp.json();
      this._urls = json.data.map(({ path }) => {
        const url = new URL(path, origin);
        url.toOrg = data.org;
        url.toRepo = data.repo;
        return url;
      });
    }

    if (data.urls) {
      const manualUrls = [...new Set(data.urls.split('\n'))].reduce((acc, href) => {
        try {
          const url = new URL(href);
          url.toOrg = data.org;
          url.toRepo = data.repo;
          acc.push(url);
        } catch {
          // Do nothing
        }
        return acc;
      }, []);
      this._urls.unshift(...manualUrls);
    }

    if (!this._urls || this._urls.length === 0) {
      this.setStatus('No URLs to import.');
      return;
    }
    this.setStatus();
    this.import(findFragments);
  }

  handleCopy(title) {
    let urls;
    if (title === 'Errors') urls = this._errors;
    if (title === 'Redirects') urls = this._redirects;
    if (title === 'Success') urls = this._successes;
    if (title === 'Total') urls = this._urls;

    const aemPaths = urls.map((url) => url.href);
    const blob = new Blob([aemPaths.join('\n')], { type: 'text/plain' });
    const data = [new ClipboardItem({ [blob.type]: blob })];
    navigator.clipboard.write(data);
  }

  handleToggleList(e) {
    const card = e.target.closest('.detail-card');
    const { name } = e.target.closest('button').dataset;
    const cards = this.shadowRoot.querySelectorAll('.detail-card');
    const lists = this.shadowRoot.querySelectorAll('.url-list');

    const isExpanded = card.classList.contains('is-expanded');
    [...cards, ...lists].forEach((el) => { el.classList.remove('is-expanded'); });
    if (isExpanded) return;

    card.classList.add('is-expanded');
    this._expanded = name;
  }

  get _remaining() {
    return this._urls.filter((url) => !url.status);
  }

  get _redirects() {
    return this._urls.filter((url) => url.status === 'redir');
  }

  get statusDialog() {
    return this.shadowRoot.querySelector('.da-import-status');
  }

  get _successes() {
    return this._urls.filter((url) => url.status && !(url.status === 'error' || url.status > 299));
  }

  get _errors() {
    return this._urls.filter((url) => url.status > 299 || url.status === 'error');
  }

  renderBadge(name, length, hasCancel = false) {
    const lowerName = name.toLowerCase();
    const hasExpand = length > 0;

    return html`
      <div class="detail-card detail-card-${lowerName}">
        <div>
          <h3>${name}</h3>
          <p>${length}</p>
        </div>
        <div class="detail-card-actions">
          ${hasCancel ? html`<button class="cancel-button" @click=${this.handleCancel}>${this._cancelText}</button>` : nothing}
          ${hasExpand ? html`
            <button class="toggle-list-icon" @click=${this.handleToggleList} data-name="${lowerName}">
              <svg class="icon"><use href="#spectrum-chevronRight"/></svg>
            </button>
          ` : nothing}
        </div>
      </div>`;
  }

  renderUrls(title, urls) {
    return html`
      <div>
        <div class="da-title-row">
          <h2>${title}</h2>
          <button class="accent" type="button" @click=${() => this.handleCopy(title)}>Copy ${title}</button>
        </div>
        <ul class="results">
          <li>
            <div class="path">Source</div>
            <div class="status">Status</div>
            <div class="link">Link</div>
          </li>
          ${urls.map((url) => html`
            <li>
              <div class="path">${url.href}</div>
              <div class="status status-${url.status}">${url.status}</div>
              <div class="link">
                ${url.status < 400 ? html`<a href=${url.daHref} target="_blank">Edit</a>` : nothing}
              </div>
            </li>
          `)}
        </ul>
      </div>
    `;
  }

  render() {
    return html`
      <dialog class="da-import-status da-import-status-${this._status.type}">
        ${this._status.text}
        <button @click=${() => this.setStatus()}>Close</button>
      </dialog>
      <h1>Importer</h1>
      <p>Import any AEM Edge Delivery site into DA.</p>
      <p class="cors-note">Note: The site must have https://da.live in access-control-allow-origin headers.</p>
      <form @submit=${this.handleSubmit}>
        <div class="form-row">
          <h2>Import</h2>
          <label for="index">By Query Index</label>
          <input id="index" type="text" name="index" placeholder="https://main--bacom--adobecom.hlx.live/query-index.json?limit=-1" />
          <label for="urls">By URL</label>
          <textarea id="urls" name="urls" placeholder="Add AEM URLs"></textarea>
        </div>
        <div class="form-row">
          <h2>Include fragments</h2>
          <select id="fragments" name="fragments">
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>
        <div class="form-row">
          <h2>Into</h2>
          <div class="org-repo-row">
            <div>
              <label>Org</label>
              <input type="text" name="org" placeholder="org" />
            </div>
            <div>
              <label>Repo</label>
              <input type="text" name="repo" placeholder="repo" />
            </div>
          </div>
        </div>
        <div class="form-row">
          <input type="submit" value="${this._isImporting ? 'Importing' : 'Import'}" class="accent" ?disabled=${this._isImporting} />
        </div>
      </form>
      <div class="detail-cards">
        ${this.renderBadge('Remaining', this._remaining.length)}
        ${this.renderBadge('Errors', this._errors.length)}
        ${this.renderBadge('Redirects', this._redirects.length)}
        ${this.renderBadge('Success', this._successes.length)}
        ${this.renderBadge('Total', this._urls.length)}
      </div>
      <div class="url-lists">
        ${this._expanded === 'remaining' ? this.renderUrls('Remaining', this._remaining) : nothing}
        ${this._expanded === 'errors' ? this.renderUrls('Errors', this._errors) : nothing}
        ${this._expanded === 'redirects' ? this.renderUrls('Redirects', this._redirects) : nothing}
        ${this._expanded === 'success' ? this.renderUrls('Success', this._successes) : nothing}
        ${this._expanded === 'total' ? this.renderUrls('Total', this._urls.filter((url) => url.status)) : nothing}
      </div>
    `;
  }
}

customElements.define('nx-importer', NxImporter);

export default async function init(el) {
  document.body.querySelector('main').style.position = 'relative';
  const bulk = document.createElement('nx-importer');
  el.append(bulk);
}
