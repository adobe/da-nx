import { LitElement, html, nothing } from '../../../../deps/lit/lit-core.min.js';
import { getConfig } from '../../../../scripts/nexter.js';
import { daFetch } from '../../../../utils/daFetch.js';
import getStyle from '../../../../utils/styles.js';

const { nxBase } = getConfig();
const style = await getStyle(import.meta.url);
const buttons = await getStyle(`${nxBase}/styles/buttons.js`);

const DA_ORIGIN = 'https://admin.da.live';
const TRANSLATE_CONF = '/.da/translate.json';

// const MOCK_URLS = '';
const MOCK_URLS = `https://main--da-bacom--adobecom.aem.page/customer-success-stories/xfinity-creative-customer-story\nhttps://main--da-bacom--adobecom.aem.page/customer-success-stories/abb-case-study\nhttps://main--da-bacom--adobecom.aem.page/customer-success-stories/academy-of-art-case-study\nhttps://main--da-bacom--adobecom.aem.page/customer-success-stories/accent-group-ecommerce-case-study\nhttps://main--da-bacom--adobecom.aem.page/customer-success-stories/aci-worldwide-case-study\nhttps://main--da-bacom--adobecom.aem.page/customer-success-stories/adobe-campaign-orchestration-case-study\nhttps://main--da-bacom--adobecom.aem.page/customer-success-stories/adobe-digital-legal-workflow-case-study\nhttps://main--da-bacom--adobecom.aem.page/customer-success-stories/adobe-digital-onboarding-case-study\nhttps://main--da-bacom--adobecom.aem.page/customer-success-stories/adobe-digital-university-case-study\nhttps://main--da-bacom--adobecom.aem.page/customer-success-stories/adobe-inside-adobe-case-study\nhttps://main--da-bacom--adobecom.aem.page/customer-success-stories/adobe-promo-case-study`;
// const MOCK_URLS = 'https://main--smartling--aabsites.aem.page/demo\nhttps://main--smartling--aabsites.aem.page/another';

class NxLocDetails extends LitElement {
  static properties = {
    urls: { attribute: false },
    _error: { attribute: false },
    _title: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style, buttons];
  }

  async handleUrls(rawUrls) {
    if (!rawUrls) {
      this.error('Please add AEM URLs.');
      return {};
    }

    // Split and de-dupe
    let urls = [...new Set(rawUrls.split('\n'))];

    // Remove empties
    urls = urls.filter((url) => url);

    // Convert to proper URLs
    urls = urls.map((url) => new URL(url));

    // Get first hostname
    const { hostname } = urls[0];

    // Ensure all URLs have same hostname
    const filtered = urls.filter((url) => url.hostname === hostname);
    if (filtered.length !== urls.length) {
      return this.error('URLs are not from the same site.');
    }

    // Subdomain split
    const [repo, org] = hostname.split('.')[0].split('--').slice(1).slice(-2);
    if (!(repo || org)) return this.error('Please use AEM URLs');

    // Get site's languages
    let resp = await daFetch(`${DA_ORIGIN}/source/${org}/${repo}${TRANSLATE_CONF}`);
    if (!resp.ok) {
      console.log('Using default translate config.');
      resp = await fetch(`${nxBase}/blocks/loc/setup/translate.json`);
    }

    const json = await resp.json();
    const { config: configJson, languages } = json;

    const config = {};
    configJson.data.forEach((conf) => {
      config[conf.key] = {
        value: conf.value,
        description: conf.description,
      };
    });

    const langs = languages.data.map((lang) => {
      const locales = lang.locales
        ? lang.locales.split(',').map((locale) => ({
          code: locale.trim(),
          active: true,
        }))
        : undefined;

      return { ...lang, locales };
    });

    return { org, repo, config, langs, urls };
  }

  error(error) {
    this._error = error;
    return null;
  }

  handleTitle(rawTitle) {
    if (!rawTitle) {
      this.error('Please add a title.');
      return null;
    }
    return rawTitle;
  }

  validateTitle({ target }) {
    this._title = target.value.replaceAll(/[^a-zA-Z0-9]/g, '-').toLowerCase();
  }

  async handleSubmit(e) {
    e.preventDefault();
    const step = 'details';

    const formData = new FormData(e.target);
    const { urls: rawUrls, title: rawTitle } = Object.fromEntries(formData);

    const title = this.handleTitle(rawTitle);
    if (!title) return;

    const { org, repo, urls, config, langs } = await this.handleUrls(rawUrls);
    if (!urls) return;

    const detail = {
      step, title, org, repo, urls, config, langs,
    };
    const opts = { detail, bubbles: true, composed: true };
    const event = new CustomEvent('next', opts);
    this.dispatchEvent(event);
  }

  render() {
    return html`
      <form @submit=${this.handleSubmit}>
        <div class="sub-heading">
          <h2>Setup basics</h2>
          <div class="actions">
            ${this._error ? html`<p class="error">${this._error}</p>` : nothing}
            <input type="submit" value="Validate references" class="accent" />
          </div>
        </div>
        <div>
          <label for="title">Title</label>
          <input type="text" name="title" .value=${this._title || 'demo'} @input=${this.validateTitle} />
        </div>
        <div>
          <label for="urls">URLs</label>
          <textarea name="urls" placeholder="Add AEM URLs here.">${MOCK_URLS}</textarea>
        </div>
      </form>
    `;
  }
}

customElements.define('nx-loc-details', NxLocDetails);
