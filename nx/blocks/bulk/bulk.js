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

    const batches = makeBatches(this._urls, 100);
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
        <textarea id="urls" name="urls" placeholder="Add AEM URLs here.">https://main--bacom-sandbox--adobecom.hlx.live/\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/aaa-northeast-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/aaa-northeast-case-study-updatedcaastags\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/abb-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/academy-of-art-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/accent-group-ecommerce-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/aci-worldwide-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/adobe-campaign-orchestration-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/adobe-digital-legal-workflow-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/adobe-digital-onboarding-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/adobe-digital-university-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/adobe-inside-adobe-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/adobe-promo-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/adobe-summit-2023-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/adp-workfront-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/aftia-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/airbus-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/aisg-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/al-ghandi-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/alma-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/alshaya-group-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/altisource-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/americord-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/analogic-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/aon-hewitt-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/apollo-tyres-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/ariel-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/armor-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/asics-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/asus-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/avidxchange-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/avionte-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/bank-of-new-zealand-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/barilla-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/bbva-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/bbva-workfront-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/ben-and-jerrys-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/benefytt-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/best-buy-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/best-western-hotels-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/biomedica-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/blackmores-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/bmw-group-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/bny-mellon-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/boots-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/border-states-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/bose-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/brand-safety-institute-case-study\nhttps://main--bacom-sandbox--adobecom.hlx.live/customer-success-stories/breville-case-study</textarea>
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
