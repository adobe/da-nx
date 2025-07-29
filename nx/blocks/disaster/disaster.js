import { LitElement, html, nothing } from 'da-lit';
import { getConfig } from '../../scripts/nexter.js';
import getStyle from '../../utils/styles.js';
import { daFetch } from '../../utils/daFetch.js';
import { DA_ORIGIN } from '../../public/utils/constants.js';
import { Queue } from '../../public/utils/tree.js';

import '../../public/sl/components.js';

const MIME_TYPES = {
  html: 'text/html',
  json: 'application/json',
  svg: 'image/svg+xml',
};

const MOCK_PATHS = [
  '/adobecom/da-bacom/index.html',
  '/adobecom/da-bacom/index.html',
];

const { nxBase: nx } = getConfig();
const sl = await getStyle(`${nx}/public/sl/styles.css`);
const styles = await getStyle(import.meta.url);

class NxDisaster extends LitElement {
  static properties = {
    _results: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, styles];
  }

  async deleteItem(path) {
    const daResp = await daFetch(`${DA_ORIGIN}/source${path}`, { method: 'DELETE' });
    return daResp.ok;
  }

  async fetchText(path) {
    const cmResp = await daFetch(`https://da-admin.chris-millar.workers.dev/source${path}`);
    if (!cmResp.ok) {
      this._results.push({ path, status: cmResp.status, result: 'not ok' });
      return null;
    }
    return cmResp.text();
  }

  async saveItem(path, text) {
    const blob = new Blob([text], { type: MIME_TYPES[path.split('.').pop()] });

    const body = new FormData();
    body.append('data', blob);
    const opts = { method: 'POST', body };
    const daResp = await daFetch(`${DA_ORIGIN}/source${path}`, opts);
    if (!daResp.ok) {
      this._results.push({ path, status: daResp.status, result: 'not ok' });
      return null;
    }
    this._results.push({ path, status: daResp.status, result: 'ok' });
    return daResp.ok;
  }

  async restore(paths) {
    this._results = [];

    const callback = async (path) => {
      const text = await this.fetchText(path);
      if (!text) return;

      const deleted = await this.deleteItem(path);
      if (!deleted) return;

      await this.saveItem(path, text);

      this.requestUpdate();
    };

    const queue = new Queue(callback, 50);
    for (const path of paths) {
      queue.push(path);
    }
  }

  handleSubmit(e) {
    e.preventDefault();
    const formData = new FormData(this.shadowRoot.querySelector('form'));
    const pathsString = formData.get('paths');
    if (pathsString.length === 0) return;
    const paths = pathsString.split('\n').filter((path) => path.length > 0);
    this.restore(paths);
  }

  render() {
    return html`
      <form>
        <h1>Restore from old infrastructure</h1>
        <p>This tool will restore the content from the old infrastructure to the new one.</p>
        <p>It will delete the content from the new infrastructure and then restore it from the old infrastructure.</p>
        <div class="input">
          <sl-textarea name="paths" resize="none" placeholder="/{ORG}/{PROJECT}/{PATH}.{EXT}">${MOCK_PATHS.join('\n')}</sl-textarea>
        </div>
        <div class="warning">
          <p>Any content in da.live at this location will be deleted and replaced with content from 18:00 - 11/25/2025 which is when the cutover happened.</p>
          <sl-button @click=${this.handleSubmit}>Restore</sl-button>
        </div>
      </form>
      <ul>
        ${this._results?.length > 0 ? this._results.map((result) => html`
          <li>${result.path} - ${result.status} - ${result.result}</li>
        `) : nothing}
      </ul>
    `;
  }
}

customElements.define('nx-disaster', NxDisaster);

export default function disaster(el) {
  const cmp = document.createElement('nx-disaster');
  el.appendChild(cmp);
}
