import { LitElement, html, nothing } from '../../deps/lit/lit-core.min.js';

import { getConfig } from '../../scripts/nexter.js';
import makeBatches from '../../utils/public/batch.js';
import getStyle from '../../utils/styles.js';
import getSvg from '../../utils/svg.js';

import { formatUrls, sendAction, throttle } from './index.js';

const { nxBase } = getConfig();
const style = await getStyle(import.meta.url);
const buttons = await getStyle(`${nxBase}/styles/buttons.js`);

const ICONS = [
  `${nxBase}/img/icons/Smock_ChevronRight_18_N.svg`,
];

const SUCCESS_CODES = [200, 201, 204];

const MOCK_URLS = 'https://main--bacom-sandbox--adobecom.hlx.live/\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/aaa-northeast-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/aaa-northeast-case-study-updatedcaastags\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/abb-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/academy-of-art-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/accent-group-ecommerce-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/aci-worldwide-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/adobe-campaign-orchestration-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/adobe-digital-legal-workflow-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/adobe-digital-onboarding-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/adobe-digital-university-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/adobe-inside-adobe-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/adobe-promo-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/adobe-summit-2023-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/adp-workfront-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/aftia-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/airbus-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/aisg-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/al-ghandi-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/alma-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/alshaya-group-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/altisource-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/americord-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/analogic-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/aon-hewitt-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/apollo-tyres-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/ariel-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/armor-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/asics-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/asus-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/avidxchange-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/avionte-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/bank-of-new-zealand-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/barilla-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/bbva-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/bbva-workfront-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/ben-and-jerrys-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/benefytt-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/best-buy-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/best-western-hotels-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/biomedica-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/blackmores-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/bmw-group-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/bny-mellon-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/boots-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/border-states-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/bose-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/brand-safety-institute-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/breville-case-study';

class NxBulk extends LitElement {
  static properties = {
    _baseUrls: { state: true },
    _successUrls: { state: true },
    _errorUrls: { state: true },
    _isDelete: { state: true },
    _cancel: { state: true },
    _cancelText: { state: true },
  };

  constructor() {
    super();
    this._isDelete = false;
    this.resetState();
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style, buttons];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
  }

  processBatch(completeUrls) {
    completeUrls.forEach((url) => {
      const idx = this._baseUrls.findIndex(({ pathname }) => pathname === url.pathname);
      const [spliced] = this._baseUrls.splice(idx, 1);
      if (SUCCESS_CODES.some((code) => code === spliced.status)) {
        this._successUrls.unshift(spliced);
      } else {
        this._errorUrls.unshift(spliced);
      }
    });
  }

  async sendBatch(batch) {
    const finishedBatch = await Promise.all(batch.map(async (url) => sendAction(url)));
    this.processBatch(finishedBatch);
    if (this._cancel) {
      this._cancelText = 'Cancelled';
      return;
    }
    this.requestUpdate();
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
    this._cancelText = 'Canceling';
  }

  handleToggleList(e) {
    const card = e.target.closest('.detail-card');
    card.classList.toggle('is-expanded');
    const { name } = e.target.closest('button').dataset;
    const list = this.shadowRoot.querySelector(`.url-list-${name}`);
    list.classList.toggle('is-expanded');
  }

  async handleSubmit(e) {
    e.preventDefault();
    this.resetState();

    const data = new FormData(e.target);
    const { urls, action, delete: hasDelete } = Object.fromEntries(data);

    this._baseUrls = formatUrls(urls, action, hasDelete);
    const batches = makeBatches(this._baseUrls, 10);

    for (const batch of batches) {
      if (this._cancel) break;
      const start = Date.now();
      await this.sendBatch(batch);
      await throttle(start);
    }
  }

  get _totalCount() {
    return this._baseUrls.length + this._successUrls.length + this._errorUrls.length;
  }

  renderBadge(name, length, hasCancel) {
    const lowerName = name.toLowerCase();
    const hasExpand = length > 0 && lowerName !== 'total';

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

  renderList(name, urls) {
    return html`
      <div class="url-list url-list-${name.toLowerCase()}">
        <h2>${name}</h2>
        <ul class="urls-result">
          ${urls.map((url) => html`
            <li>
              <div class="url-path">${url.href}</div>
              <div class="url-status result-${url.status ? url.status : 'waiting'}">
                ${url.status ? url.status : 'waiting'}
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
        <label for="urls">URLs</label>
        <textarea id="urls" name="urls" placeholder="Add AEM URLs here."></textarea>
        <div class="da-bulk-action-submit">
          <div class="delete-toggle">
            <input type="checkbox" id="delete" name="delete" .checked=${this._isDelete} @click=${this.handleDeleteCheck} />
            <label for="delete">Delete</label>
          </div>
          <select id="action" name="action">
            <option value="preview">Preview</option>
            <option value="live">Publish</option>
            <option value="index">Index</option>
          </select>
          ${this._isDelete ? html`<button class="negative">Delete</button>` : html`<button class="accent">Submit</button>`}
        </div>
      </form>
      <div class="detail-cards">
        ${this.renderBadge('Remaining', this._baseUrls.length, this._baseUrls.length > 1)}
        ${this.renderBadge('Error', this._errorUrls.length)}
        ${this.renderBadge('Success', this._successUrls.length)}
        ${this.renderBadge('Total', this._totalCount)}
      </div>
      ${this.renderList('Error', this._errorUrls)}
      ${this.renderList('Success', this._successUrls)}
      ${this.renderList('Remaining', this._baseUrls)}
    `;
  }
}

customElements.define('nx-bulk', NxBulk);

export default function init(el) {
  el.innerHTML = '<nx-bulk></nx-bulk>';
}
