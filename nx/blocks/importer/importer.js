import { LitElement, html, nothing } from '../../deps/lit/lit-core.min.js';
import { getConfig } from '../../scripts/nexter.js';
import getStyle from '../../utils/styles.js';
import { importAll, calculateTime } from './index.js';

const { nxBase } = getConfig();
const style = await getStyle(import.meta.url);
const buttons = await getStyle(`${nxBase}/styles/buttons.js`);

const MOCK_URLS = 'https://main--bacom--adobecom.hlx.live/customer-success-stories/xfinity-creative-customer-story\nhttps://main--bacom--adobecom.hlx.live/placeholders.json\nhttps://main--bacom--adobecom.hlx.live/\nhttps://main--bacom--adobecom.hlx.live/blah';

class NxImporter extends LitElement {
  static properties = {
    _urls: { state: true },
    _isImporting: { state: true },
    _status: { state: true },
  };

  constructor() {
    super();
    this._urls = [];
    this._status = {};
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style, buttons];
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

  async import() {
    this._isImporting = true;
    const startTime = Date.now();

    const requestUpdate = this.requestUpdate.bind(this);
    await importAll(this._urls, requestUpdate);

    const time = calculateTime(startTime);
    this.setStatus(`Import of ${this._urls.length} URLs took: ${time} minutes`, 'info');
    this._isImporting = false;
  }

  async handleSubmit(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);

    if (!(data.org || data.repo)) {
      console.log('No org or repo to import into');
      return;
    }

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
      const manualUrls = [...new Set(data.urls.split('\n'))].map((href) => {
        const url = new URL(href);
        url.toOrg = data.org;
        url.toRepo = data.repo;
        return url;
      });
      this._urls.unshift(...manualUrls);
    }

    if (!this._urls || this._urls.length === 0) {
      this.setStatus('No URLs to import.');
      return;
    }
    this.setStatus();
    this.import();
  }

  handleCopy(title) {
    const urls = title === 'Errors' ? this._errors : this._urls;
    const aemPaths = urls.map((url) => url.href);
    const blob = new Blob([aemPaths.join('\n')], { type: 'text/plain' });
    const data = [new ClipboardItem({ [blob.type]: blob })];
    navigator.clipboard.write(data);
  }

  get statusDialog() {
    return this.shadowRoot.querySelector('.da-import-status');
  }

  get _errors() {
    return this._urls.filter((url) => url.status > 299 || url.status === 'error');
  }

  renderUrls(title, urls) {
    return html`
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
          <textarea id="urls" name="urls" placeholder="Add AEM URLs">https://main--bacom-blog--adobecom.hlx.live/au/blog/basics/4-types-of-projects-which-kind-are-you-leading</textarea>
        </div>
        <div class="form-row">
          <h2>Into</h2>
          <div class="org-repo-row">
            <div>
              <label>Org</label>
              <input type="text" name="org" placeholder="org" value="da-sites" />
            </div>
            <div>
              <label>Repo</label>
              <input type="text" name="repo" placeholder="repo" value="bacom" />
            </div>
          </div>
        </div>
        <div class="form-row">
          <input type="submit" value="${this._isImporting ? 'Importing' : 'Import'}" class="accent" ?disabled=${this._isImporting} />
        </div>
        ${this._errors?.length > 0 ? this.renderUrls('Errors', this._errors) : nothing}
        ${this._urls?.length > 0 ? this.renderUrls('All URLs', this._urls) : nothing}
      </form>
    `;
  }
}

customElements.define('nx-importer', NxImporter);

export default async function init(el) {
  document.body.querySelector('main').style.position = 'relative';
  const bulk = document.createElement('nx-importer');
  el.append(bulk);
}
