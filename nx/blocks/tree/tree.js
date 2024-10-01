import { LitElement, html, nothing } from '../../deps/lit/lit-core.min.js';
import { getConfig } from '../../scripts/nexter.js';
import { crawl } from '../../public/utils/tree.js';
import getStyle from '../../utils/styles.js';

const { nxBase } = getConfig();
const style = await getStyle(import.meta.url);
const buttons = await getStyle(`${nxBase}/styles/buttons.js`);

class NxBulk extends LitElement {
  static properties = {
    _files: { state: true },
    _canSubmit: { state: true },
    _time: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style, buttons];
  }

  async handleSubmit(e) {
    e.preventDefault();

    if (e.submitter.textContent === 'Cancel' && this.cancelCrawl) {
      this.cancelCrawl();
      this._canSubmit = true;
      return;
    }

    this._time = undefined;
    this._canSubmit = false;
    const data = new FormData(e.target);
    const { path } = Object.fromEntries(data);
    if (!path) return;
    const { getCrawled, cancelCrawl, getTime } = crawl({ path });

    this.cancelCrawl = cancelCrawl;
    this._files = [];

    const report = setInterval(() => {
      const { files, complete } = getCrawled();
      if (files.length > 0) {
        this._files.push(...files);
        this.requestUpdate();
      }
      if (complete) {
        this._time = getTime();
        clearInterval(report);
      }
    }, 200);
  }

  renderFiles() {
    return html`
      <h2>Files - ${this._files.length} ${this._time ? html`- ${this._time}s` : nothing}</h2>
      <ul class="files-list">
        ${this._files.map((file) => html`<li>${file.path}</li>`)}
      </ul>
    `;
  }

  render() {
    return html`
      <h1>Crawl Tree</h1>
      <form @submit=${this.handleSubmit}>
        <input name="path" placeholder="/da-sites/bacom" />
        <button class="accent" .disabled=${this._canSubmit}>Crawl</button>
        <button class="primary">Cancel</button>
      </form>
      ${this._files ? this.renderFiles() : nothing}
    `;
  }
}

customElements.define('nx-tree', NxBulk);

export default function init(el) {
  el.innerHTML = '<nx-tree></nx-tree>';
}
