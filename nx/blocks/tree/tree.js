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
    this._canSubmit = true;
  }

  pushFile(file) {
    const path = file.path.replace('.html', '');
    const [org, repo, ...pathParts] = path.substring(1).split('/');
    const pageName = pathParts.pop();
    pathParts.push(pageName === 'index' ? '' : pageName);

    file.aemPreview = `https://main--${repo}--${org}.aem.page/${pathParts.join('/')}`;

    let editView;
    if (file.ext === 'html') {
      editView = '/edit';
    } else if (file.ext === 'json') {
      editView = '/sheet';
    } else {
      editView = '/media';
    }
    file.editPath = `${editView}#${path}`;

    this._files.push(file);
    this.requestUpdate();
  }

  makeAEMUrl() {

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
    this._files = [];
    const callback = this.pushFile.bind(this);
    const { results, getDuration, cancelCrawl } = crawl({ path, callback, throttle: 10 });

    const getTime = setInterval(() => { this._time = getDuration(); }, 100);

    this.cancelCrawl = cancelCrawl;
    results.then(() => {
      this._canSubmit = true;
      clearInterval(getTime);
      this._time = getDuration();
    });
  }

  toggleView() {
    const details = this.shadowRoot.querySelectorAll('.details');
    details.forEach((detail) => {
      detail.classList.toggle('hide');
    });
  }

  handleCopy(e) {
    const button = e.currentTarget;
    const originalText = button.textContent;
    button.textContent = 'Copied ✓';

    const aemPaths = this._files.map((file) => file.aemPreview);
    const blob = new Blob([aemPaths.join('\n')], { type: 'text/plain' });
    const data = [new ClipboardItem({ [blob.type]: blob })];
    navigator.clipboard.write(data);

    setTimeout(() => {
      button.textContent = originalText;
    }, 1000);
  }

  renderFile(file) {
    return html`
      <li>
        <div class="details da-details">
          <p>${file.path}</p>
          <a href=${file.editPath}>Edit</a>
        </div>
        <div class="details aem-details hide">
          <p>${file.aemPreview}</p>
          <a href=${file.aemPreview}>Preview</a>
        </div>
      </li>`;
  }

  renderFiles() {
    return html`
      <div class="totals-header">
        <h2>Files - ${this._files.length}</h2>
        <h2>${this._time ? html`${this._time}s` : nothing}</h2>
        <div class="da-list-actions">
          <button class="accent" @click=${this.handleCopy}>Copy list</button>
          <button class="primary" @click=${this.toggleView}>Toggle view</button>
        </div>
      </div>
      <ul class="files-list">${this._files.map(this.renderFile)}</ul>`;
  }

  render() {
    return html`
      <h1>Crawl Tree</h1>
      <form @submit=${this.handleSubmit}>
        <input name="path" value="/da-sites/bacom" />
        <button class="accent" .disabled=${!this._canSubmit}>Crawl</button>
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
