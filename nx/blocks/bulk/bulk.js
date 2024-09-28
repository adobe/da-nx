import { LitElement, html, nothing } from '../../deps/lit/lit-core.min.js';

import { getConfig } from '../../scripts/nexter.js';
import makeBatches from '../../utils/public/batch.js';
import getStyle from '../../utils/styles.js';

import { formatUrls, sendAction, throttle } from './index.js';

const { nxBase } = getConfig();
const style = await getStyle(import.meta.url);
const buttons = await getStyle(`${nxBase}/styles/buttons.js`);

const SUCCESS_CODES = [200, 201, 204];

const MOCK_URLS = 'https://main--bacom-sandbox--adobecom.hlx.live/\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/aaa-northeast-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/aaa-northeast-case-study-updatedcaastags\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/abb-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/academy-of-art-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/accent-group-ecommerce-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/aci-worldwide-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/adobe-campaign-orchestration-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/adobe-digital-legal-workflow-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/adobe-digital-onboarding-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/adobe-digital-university-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/adobe-inside-adobe-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/adobe-promo-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/adobe-summit-2023-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/adp-workfront-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/aftia-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/airbus-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/aisg-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/al-ghandi-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/alma-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/alshaya-group-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/altisource-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/americord-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/analogic-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/aon-hewitt-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/apollo-tyres-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/ariel-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/armor-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/asics-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/asus-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/avidxchange-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/avionte-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/bank-of-new-zealand-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/barilla-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/bbva-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/bbva-workfront-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/ben-and-jerrys-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/benefytt-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/best-buy-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/best-western-hotels-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/biomedica-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/blackmores-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/bmw-group-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/bny-mellon-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/boots-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/border-states-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/bose-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/brand-safety-institute-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/breville-case-study';

class NxBulk extends LitElement {
  static properties = {
    _baseUrls: { state: true },
    _successUrls: { state: true },
    _errorUrls: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style, buttons];
    this.resetUrls();
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
    const start = Date.now();
    const finishedBatch = await Promise.all(batch.map(async (url) => sendAction(url)));
    this.processBatch(finishedBatch);
    this.requestUpdate();
    await throttle(start);
  }

  resetUrls() {
    this._baseUrls = [];
    this._successUrls = [];
    this._errorUrls = [];
  }

  async handleSubmit(e) {
    e.preventDefault();
    this.resetUrls();

    const data = new FormData(e.target);
    const { urls, action } = Object.fromEntries(data);

    this._baseUrls = formatUrls(urls, action);
    const batches = makeBatches(this._baseUrls, 10);

    for (const batch of batches) { await this.sendBatch(batch); }
  }

  get _totalCount() {
    return this._baseUrls.length + this._successUrls.length + this._errorUrls.length;
  }

  renderBadge(name, length) {
    return html`
      <div class="detail-card detail-card-${name.toLowerCase()}">
        <h3>${name}</h3>
        <p>${length}</p>
      </div>`;
  }

  renderList(name, urls) {
    return html`
      <h2>${name} - ${urls.length}</h2>
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
    `;
  }

  render() {
    return html`
      <h1>Bulk Operations</h1>
      <form @submit=${this.handleSubmit}>
        <label for="urls">URLs</label>
        <textarea id="urls" name="urls" placeholder="Add AEM URLs here.">${MOCK_URLS}</textarea>
        <div class="da-bulk-action-submit">
          <div>
            <select id="action" name="action">
              <option value="preview">Preview</option>
              <option value="live">Publish</option>
              <option value="index">Index</option>
            </select>
          </div>
          <div>
            <button class="accent">Submit</button>
          </div>
        </div>
      </form>
      <div class="detail-cards">
        ${this.renderBadge('Remaining', this._baseUrls.length)}
        ${this.renderBadge('Error', this._errorUrls.length)}
        ${this.renderBadge('Success', this._successUrls.length)}
        ${this.renderBadge('Total', this._totalCount)}
      </div>
      ${this._errorUrls.length > 0 ? this.renderList('Errors', this._errorUrls) : nothing}
      ${this._successUrls.length > 0 ? this.renderList('Success', this._successUrls) : nothing}
      ${this._baseUrls.length > 0 ? this.renderList('In Progress', this._baseUrls) : nothing}
    `;
  }
}

customElements.define('nx-bulk', NxBulk);

export default function init(el) {
  el.innerHTML = '<nx-bulk></nx-bulk>';
}
