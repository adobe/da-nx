import { html, LitElement, nothing } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import { getOrgRepoFrmUrl } from '../../utils/utils.js';

const EL_NAME = 'nx-media-onboard';
const styles = await getStyle(import.meta.url);

const RANDOM_MAX = 8;

function getRandom() {
  return Math.floor(Math.random() * RANDOM_MAX);
}

class NxMediaOnboard extends LitElement {
  static properties = {
    _recents: { state: true },
    _urlError: { state: true },
  };

  constructor() {
    super();
    this._recents = [];
    this._urlError = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    this.loadRecentSites();
  }

  async updated(changedProperties) {
    super.updated(changedProperties);
  }

  loadRecentSites() {
    const recentSites = JSON.parse(localStorage.getItem('da-sites')) || [];
    const recentOrgs = JSON.parse(localStorage.getItem('da-orgs')) || [];

    if (recentSites.length > 0) {
      this._recents = recentSites.map((name) => ({
        name,
        img: `/blocks/browse/da-sites/img/cards/da-${getRandom()}.jpg`,
        style: `da-card-style-${getRandom()}`,
      }));
    } else if (recentOrgs.length > 0) {
      this._recents = recentOrgs.map((name) => ({
        name,
        img: `/blocks/browse/da-sites/img/cards/da-${getRandom()}.jpg`,
        style: `da-card-style-${getRandom()}`,
      }));
    }
  }

  async handleUrlSubmit(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const { siteUrl } = Object.fromEntries(formData);

    if (!siteUrl) return;

    try {
      const { repo, org } = getOrgRepoFrmUrl(siteUrl);
      const sitePath = `/${org}/${repo}`;

      this.dispatchEvent(new CustomEvent('site-selected', {
        detail: { sitePath },
        bubbles: true,
      }));
    } catch (error) {
      this._urlError = true;
      setTimeout(() => { this._urlError = false; }, 3000);
    }
  }

  handleSiteClick(siteName) {
    const sitePath = `/${siteName}`;
    this.dispatchEvent(new CustomEvent('site-selected', {
      detail: { sitePath },
      bubbles: true,
    }));
  }

  renderUrlInput() {
    return html`
      <form @submit=${this.handleUrlSubmit}>
        <input
          @keydown="${() => { this._urlError = false; }}"
          @change="${() => { this._urlError = false; }}"
          type="text" 
          name="siteUrl"
          placeholder="https://main--site--org.aem.page"
          class="${this._urlError ? 'error' : nothing}"
        />
        <div class="da-form-btn-offset">
          <button type="submit" aria-label="Go to site">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 26">
              <path fill="currentColor"
                d="M23.09,13.67c.14-.35.14-.74,0-1.08-.07-.17-.18-.33-.31-.46l-6.62-6.62c-.55-.55-1.45-.55-2,0-.55.55-.55,1.45,0,2l4.21,4.21H4.61c-.78,0-1.41.63-1.41,1.42s.63,1.42,1.41,1.42h13.76l-4.21,4.21c-.55.55-.55,1.45,0,2,.28.28.64.41,1,.41s.72-.14,1-.41l6.62-6.62c.13-.13.23-.29.31-.46Z" />
            </svg>
          </button>
        </div>
      </form>
    `;
  }

  renderSite(site) {
    const [org, repo] = site.name.split('/');
    return html`
      <div class="nx-card" @click=${() => this.handleSiteClick(site.name)}>
        <div class="nx-card-inner">
          <div class="nx-card-picture-container">
            <picture>
              <img loading="lazy" src="${site.img}" alt="">
            </picture>
            <div class="nx-card-overlay">
              <h3>${repo}</h3>
              <p>${org}</p>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderRecentSites() {
    return html`
      <div class="da-site-container">
        <h2 class="error-title">Recents</h2>
        <div class="nx-site-apps">
          ${this._recents.map((site) => this.renderSite(site))}
        </div>
      </div>
    `;
  }

  renderAddNewSite() {
    return html`
      <div class="da-site-container">
        <h2 class="error-title">Browse Media</h2>
        <div class="da-no-site-well">
          <img src="/blocks/browse/da-sites/img/site-icon-color.svg" width="78" height="60" alt=""/>
          <div class="da-no-site-text">
            <h3>Enter a site URL to explore its media</h3>
          </div>
          ${this.renderUrlInput()}
        </div>
      </div>
    `;
  }

  renderEmpty() {
    return html`
      <div class='da-site-container'>
        <h2 class="error-title">Get Started</h2>
        <div class="da-no-site-well no-path">
          <img src="/blocks/browse/da-sites/img/site-icon-color.svg" width="78" height="60" alt=""/>
          <div class="da-no-site-text">
            <h3>Enter a site URL to explore its media</h3>
          </div>
          ${this.renderUrlInput()}
        </div>
      </div>
    `;
  }

  render() {
    if (this._recents && this._recents.length > 0) {
      return html`
        ${this.renderRecentSites()}
        ${this.renderAddNewSite()}
      `;
    }
    return this.renderEmpty();
  }
}

customElements.define(EL_NAME, NxMediaOnboard);
