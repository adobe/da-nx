import { LitElement, html, nothing } from '../../deps/lit/lit-core.min.js';
import { getConfig } from '../../scripts/nexter.js';
import getStyle from '../../utils/styles.js';
import makeBatches from '../../utils/batch.js';
import importUrl from './index.js';

const { nxBase } = getConfig();
const style = await getStyle(import.meta.url);
const buttons = await getStyle(`${nxBase}/styles/buttons.js`);

class NxImporter extends LitElement {
  static properties = {
    _urls: { attribute: false },
    _isImporting: { attribute: false },
    _status: { attribute: false },
  };

  constructor() {
    super();
    this._urls = [];
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style, buttons];
  }

  async batchImport() {
    performance.mark('start-import');

    // Batch requests
    const batches = makeBatches(this._urls);

    // Send them
    for (const batch of batches) {
      await Promise.all(batch.map(async (url) => importUrl(url)));
      this._urls = [...this._urls];
    }

    performance.mark('end-import');
    performance.measure('import', 'start-import', 'end-import');
    const replaceTime = performance.getEntriesByName('import')[0].duration;
    this._status = `Import took: ${String((replaceTime / 1000) / 60).substring(0, 4)} minutes`;
  }

  async import() {
    this._isImporting = true;
    await this.batchImport();
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

    if (data.upload) {
      const file = data.upload;
      const reader = new FileReader();
      reader.addEventListener('load', ({ target }) => {
        const json = JSON.parse(target.result);
        this._urls = json.data.map(({ path }) => {
          const url = new URL(path, data.origin);
          url.org = data.org;
          url.repo = data.repo;
          return url;
        });
        this.import();
      });
      reader.readAsText(file);
      return;
    }

    this._urls = [...new Set(data.urls.split('\n'))].map((href) => {
      const url = new URL(href);
      url.org = data.org;
      url.repo = data.repo;
      return url;
    });

    this.import();
  }

  render() {
    return html`
      <h1>Importer</h1>
      <p>Import any AEM Edge Delivery site into Dark Alley.</p>
      <form @submit=${this.handleSubmit}>
        <div class="form-row">
          <h2>Import</h2>
          <label for="urls">URLs</label>
          <input type="file" name="upload" accept="application/json" />
          <input type="text" name="origin" placeholder="Origin" value="https://main--bacom--adobecom.hlx.live" />
          <textarea name="urls" placeholder="Add AEM URLs"></textarea>
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
          ${this._status ? html`<p>${this._status}</p>` : nothing}
        </div>
        <ul class="results">
          <li>
            <div class="path">Source</div>
            <div class="status">Status</div>
            <div class="link">Link</div>
          </li>
          ${this._urls.map((url) => html`
            <li>
              <div class="path">${url.href}</div>
              <div class="status status-${url.status}">${url.status}</div>
              <div class="link">
                ${url.status === 200 ? html`<a href=${url.daHref} target="_blank">Edit</a>` : nothing}
              </div>
            </li>
          `)}
        </ul>
      </form>
    `;
  }
}

customElements.define('nx-importer', NxImporter);

export default async function init(el) {
  const bulk = document.createElement('nx-importer');
  el.append(bulk);
}
