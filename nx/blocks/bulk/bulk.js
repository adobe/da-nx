import { LitElement, html, nothing } from '../../deps/lit/lit-core.min.js';
import { getConfig } from '../../scripts/nexter.js';
import { formatUrls, sendAction } from './index.js';
import { Queue } from '../../public/utils/tree.js';
import getSvg from '../../utils/svg.js';
import getStyle from '../../utils/styles.js';

await import('../../public/sl/components.js');
const style = await getStyle(import.meta.url);

const { nxBase: nx } = getConfig();
const icons = await getSvg({ paths: [`${nx}/img/icons/Smock_ChevronRight_18_N.svg`] });

// const MOCK_URLS = 'https://main--docket--da-pilot.aem.page/about/faq\nhttps://main--docket--da-pilot.aem.page/about/release-notes\nhttps://main--docket--da-pilot.aem.page/about/release-notes/da-admin\nhttps://main--docket--da-pilot.aem.page/about/release-notes/da-collab\nhttps://main--docket--da-pilot.aem.page/about/release-notes/da-content\nhttps://main--docket--da-pilot.aem.page/about/release-notes/da-live';

const FILTER_MAP = {
  Success: true,
  Errors: false,
  Remaining: undefined,
  Total: null,
};

class NxBulk extends LitElement {
  static properties = {
    _baseUrls: { state: true },
    _successUrls: { state: true },
    _errorUrls: { state: true },
    _isDelete: { state: true },
    _cancel: { state: true },
    _cancelText: { state: true },
    _showVersion: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this.shadowRoot.prepend(...icons);
  }

  resetState() {
    this._cancel = false;
    this._cancelText = 'Cancel';
    this._baseUrls = [];
    this._successUrls = [];
    this._errorUrls = [];
  }

  handleDeleteCheck() {
    this._isDelete = !this._isDelete;
  }

  handleCancel() {
    this._cancel = true;
    this._cancelText = 'Canceled';
  }

  handleToggleList(e) {
    const card = e.target.closest('.detail-card');
    const { name } = e.target.closest('button').dataset;
    const list = this.shadowRoot.querySelector(`.url-list-${name}`);
    const cards = this.shadowRoot.querySelectorAll('.detail-card');
    const lists = this.shadowRoot.querySelectorAll('.url-list');

    const isExpanded = card.classList.contains('is-expanded');
    [...cards, ...lists].forEach((el) => { el.classList.remove('is-expanded'); });
    if (isExpanded) return;

    card.classList.add('is-expanded');
    list.classList.add('is-expanded');
  }

  async handleSubmit(e) {
    e.preventDefault();
    this.resetState();

    const data = new FormData(this.shadowRoot.querySelector('form'));
    const { urls, action, delete: hasDelete, label } = Object.fromEntries(data);

    this._baseUrls = formatUrls(urls, action, hasDelete);

    const callback = async (url) => {
      if (this._cancel) return;
      await sendAction(url, label);
      this.requestUpdate();
    };

    const queue = new Queue(callback, 5, null, 150);
    await this._baseUrls.map((url) => queue.push(url));
  }

  handleSelect(e) {
    this._showVersion = e.target.value === 'versionsource';
  }

  get _totalCount() {
    return this._baseUrls.length + this._successUrls.length + this._errorUrls.length;
  }

  get _submit() {
    return this._isDelete
      ? { style: 'negative', text: 'Delete' }
      : { style: 'accent', text: 'Submit' };
  }

  getFilterList(ok) {
    if (!this._baseUrls) return [];
    // If null is purposefully supplied, give all urls
    if (ok === null) return this._baseUrls;
    return this._baseUrls.filter((url) => url.ok === ok);
  }

  renderBadge(name) {
    const lowerName = name.toLowerCase();
    const { length } = this.getFilterList(FILTER_MAP[name]);
    const hasExpand = length > 0;

    const hasCancel = length > 0 && name === 'Remaining';

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

  renderList(name) {
    const urls = this.getFilterList(FILTER_MAP[name]);

    return html`
      <div class="url-list url-list-${name.toLowerCase()}">
        <h2>${name}</h2>
        <ul class="urls-result">
          ${urls.map((url) => html`
            <li>
              <div class="url-path">${url.href}</div>
              <div class="url-status result-${url.ok !== undefined ? url.status : 'waiting'}">
                ${url.ok !== undefined ? url.status : 'waiting'}
              </div>
            </li>
          `)}
        </ul>
      </div>
    `;
  }

  render() {
    return html`
      <h1>Bulk Operations</h1>
      <form @submit=${this.handleSubmit}>
        <sl-textarea id="urls" label="URLs" name="urls" class="monospace" placeholder="Add AEM URLs here..." resize="none"></sl-textarea>
        <div class="da-bulk-action-submit">
          ${!this._showVersion ? html`
            <div class="delete-toggle">
              <input type="checkbox" id="delete" name="delete" .checked=${this._isDelete} @click=${this.handleDeleteCheck} />
              <label for="delete">Delete</label>
            </div>
          ` : nothing}
          ${this._showVersion ? html`<sl-input type="text" name="label" placeholder="Version label"></sl-input>` : nothing}
          <sl-select id="action" name="action" @change=${this.handleSelect}>
            <option value="preview">Preview</option>
            <option value="live">Publish</option>
            <option value="versionsource">Version</option>
            <option value="index">Index</option>
          </sl-select>
          <sl-button class="${this._submit.style}" @click=${this.handleSubmit}>${this._submit.text}</sl-button>
        </div>
      </form>
      <div class="detail-cards">
        ${this.renderBadge('Remaining')}
        ${this.renderBadge('Errors')}
        ${this.renderBadge('Success')}
        ${this.renderBadge('Total')}
      </div>
      ${this.renderList('Errors')}
      ${this.renderList('Success')}
      ${this.renderList('Remaining')}
      ${this.renderList('Total')}
    `;
  }
}

customElements.define('nx-bulk', NxBulk);

export default function init(el) {
  el.append(document.createElement('nx-bulk'));
}
