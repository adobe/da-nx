import { LitElement, html, nothing } from '../../deps/lit/lit-core.min.js';

import { getConfig } from '../../scripts/nexter.js';
import { daFetch } from '../../utils/daFetch.js';
import makeBatches from '../../utils/public/batch.js';
import getStyle from '../../utils/styles.js';

const { nxBase } = getConfig();
const style = await getStyle(import.meta.url);
const buttons = await getStyle(`${nxBase}/styles/buttons.js`);

class NxBulk extends LitElement {
  static properties = {
    _urls: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style, buttons];
  }

  async handleSubmit(e) {
    e.preventDefault();
    this._urls = null;

    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);
    const action = data.action.toLowerCase();

    this._urls = [...new Set(data.urls.split('\n'))].map((href) => {
      const url = new URL(href);
      const [ref, repo, org] = url.hostname.split('.').shift().split('--');
      let { pathname } = url;
      if (pathname.endsWith('/')) pathname = `${pathname}index`;
      return { ref, org, repo, pathname, action };
    });

    const batches = makeBatches(this._urls, 50);
    for (const batch of batches) {
      await Promise.all(batch.map(async (url) => {
        const opts = { method: 'POST' };
        const resp = await daFetch(`https://admin.hlx.page/${url.action}/${url.org}/${url.repo}/${url.ref}${url.pathname}`, opts);
        url.status = resp.status;
        return resp.status;
      }));
      this._urls = [...this._urls];
    }
  }

  render() {
    return html`
      <h1>Bulk Operations</h1>
      <form @submit=${this.handleSubmit}>
        <label for="urls">URLs</label>
        <textarea id="urls" name="urls" placeholder="Add AEM URLs here."></textarea>
        <div class="da-bulk-action-submit">
          <div>
            <select id="action" name="action">
              <option value="preview">Preview</option>
              <option value="live">Publish</option>
              <option value="index">Index</option>
            </select>
          </div>
          <div>
            <button class="primary">Submit</button>
          </div>
        </div>
      </form>
      ${this._urls ? html`<h2>Results</h2>` : nothing}
      <ul class="urls-result">
        ${this._urls ? this._urls.map((url) => html`
          <li>
            <div class="url-path">${url.pathname}</div>
            <div class="url-status result-${url.status ? url.status : 'waiting'}">
              ${url.status ? url.status : 'waiting'}
            </div>
          </li>
        `) : nothing}
      </ul>
    `;
  }
}

customElements.define('nx-bulk', NxBulk);

export default function init(el) {
  el.innerHTML = '<nx-bulk></nx-bulk>';
}
