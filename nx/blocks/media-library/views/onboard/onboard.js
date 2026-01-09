import { html, LitElement, nothing } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import { getOrgRepoFrmUrl } from '../../utils/utils.js';
import getSvg from '../../../../utils/svg.js';

const EL_NAME = 'nx-media-onboard';
const styles = await getStyle(import.meta.url);
const nx = `${new URL(import.meta.url).origin}/nx`;
const RANDOM_MAX = 8;

const ICONS = [
  `${nx}/public/icons/C_Icon_Arrow_Next.svg`,
  `${nx}/public/icons/S2_Icon_PinOff_20_N.svg`,
  `${nx}/public/icons/S2_Icon_More_20_N.svg`,
  `${nx}/public/icons/S2_Icon_Share_20_N.svg`,
  `${nx}/public/icons/S2_Icon_VisibilityOff_20_N.svg`,
  `${nx}/public/icons/S2_Icon_Clock_20_N.svg`,
];

function getRandom() {
  return Math.floor(Math.random() * RANDOM_MAX);
}

function ensureLeadingSlash(path) {
  return path.startsWith('/') ? path : `/${path}`;
}

function removeLeadingSlash(path) {
  return path.startsWith('/') ? path.substring(1) : path;
}

class NxMediaOnboard extends LitElement {
  static properties = {
    _recents: { state: true },
    _pinnedFolders: { state: true },
    _activeTab: { state: true },
    _urlError: { state: true },
  };

  constructor() {
    super();
    this._recents = [];
    this._pinnedFolders = [];
    this._activeTab = 'recents';
    this._urlError = false;
    this._flippedCards = new Set();
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
    this.loadRecentSites();
    this.loadPinnedFolders();
  }

  loadRecentSites() {
    const recentSites = JSON.parse(localStorage.getItem('da-sites')) || [];
    const recentOrgs = JSON.parse(localStorage.getItem('da-orgs')) || [];

    if (recentSites.length > 0) {
      this._recents = recentSites.map((name) => ({
        name,
        img: `/blocks/browse/da-sites/img/cards/da-${getRandom()}.jpg`,
        cardStyle: `da-card-style-${getRandom()}`,
      }));
    } else if (recentOrgs.length > 0) {
      this._recents = recentOrgs.map((name) => ({
        name,
        img: `/blocks/browse/da-sites/img/cards/da-${getRandom()}.jpg`,
        cardStyle: `da-card-style-${getRandom()}`,
      }));
    }
  }

  loadPinnedFolders() {
    const allPinnedFolders = [];
    const keys = Object.keys(localStorage).filter((key) => key.startsWith('media-library-pinned-folders-'));

    keys.forEach((key) => {
      const folders = JSON.parse(localStorage.getItem(key)) || [];
      allPinnedFolders.push(...folders);
    });

    this._pinnedFolders = allPinnedFolders.map((folder) => ({
      name: folder.path,
      img: `/blocks/browse/da-sites/img/cards/da-${getRandom()}.jpg`,
      cardStyle: `da-card-style-${getRandom()}`,
    }));
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
    const sitePath = ensureLeadingSlash(siteName);
    this.dispatchEvent(new CustomEvent('site-selected', {
      detail: { sitePath },
      bubbles: true,
    }));
  }

  handleCardFlip(e, cardId) {
    e.stopPropagation();
    if (this._flippedCards.has(cardId)) {
      this._flippedCards.delete(cardId);
    } else {
      this._flippedCards.add(cardId);
    }
    this.requestUpdate();
  }

  handleShare(e, siteName) {
    e.stopPropagation();
    const baseUrl = window.location.origin + window.location.pathname;
    const sitePath = ensureLeadingSlash(siteName);
    const shareUrl = `${baseUrl}${window.location.search}#${sitePath}`;

    navigator.clipboard.writeText(shareUrl).then(() => {
      window.dispatchEvent(new CustomEvent('show-notification', {
        detail: {
          heading: 'Link Copied',
          message: 'Media library link copied to clipboard',
          type: 'success',
          open: true,
        },
      }));
    });
  }

  handleHide(e, siteName, isPinned = false) {
    e.stopPropagation();
    if (isPinned) {
      const sitePath = removeLeadingSlash(siteName);
      const parts = sitePath.split('/');
      const [org, repo] = parts;

      const storageKey = `media-library-pinned-folders-${org}-${repo}`;
      const pinnedFolders = JSON.parse(localStorage.getItem(storageKey)) || [];
      const updatedFolders = pinnedFolders.filter((folder) => folder.path !== siteName);
      localStorage.setItem(storageKey, JSON.stringify(updatedFolders));

      this.loadPinnedFolders();
    } else {
      const recentSites = JSON.parse(localStorage.getItem('da-sites')) || [];
      const siteNameToRemove = removeLeadingSlash(siteName);
      const updatedSites = recentSites.filter((site) => site !== siteNameToRemove);
      localStorage.setItem('da-sites', JSON.stringify(updatedSites));

      this.loadRecentSites();
    }

    this._flippedCards.delete(siteName);
    this.requestUpdate();
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
          <svg class="icon" viewBox="0 0 26 26">
            <use href="#C_Icon_Arrow_Next"></use>
          </svg>
          </button>
        </div>
      </form>
    `;
  }

  renderSite(site, isPinned = false) {
    const siteName = removeLeadingSlash(site.name);
    const parts = siteName.split('/');
    const [org, repo, ...pathParts] = parts;
    const basePath = pathParts.length > 0 ? `/${pathParts.join('/')}` : null;
    const isFlipped = this._flippedCards.has(site.name);

    return html`
      <div class="nx-card ${isFlipped ? 'flipped' : ''}" @click=${() => this.handleSiteClick(site.name)}>
        <div class="nx-card-inner">
          <div class="nx-card-front">
            <div class="nx-card-picture-container">
              <picture>
                <img loading="lazy" src="${site.img}" alt="">
              </picture>
              <div class="nx-card-overlay ${site.cardStyle}">
                <h3>${repo}</h3>
                <p>${org}${basePath ? html`<span class="base-path">${basePath}</span>` : nothing}</p>
                <button
                  class="card-menu-btn"
                  @click=${(e) => this.handleCardFlip(e, site.name)}
                  title="Options"
                  aria-label="Card options"
                >
                <svg xmlns="http://www.w3.org/2000/svg" class="icon more" viewBox="0 0 20 20">
                  <use href="#S2_Icon_More_20_N"></use>
                </svg>
                </button>
                <div class="card-arrow">
                  <svg xmlns="http://www.w3.org/2000/svg" class="icon mini-arrow" viewBox="0 0 26 26">
                    <use href="#C_Icon_Arrow_Next"></use>
                  </svg>
                </div>
              </div>
            </div>
          </div>
          <div class="nx-card-back">
            <button
              class="card-action-btn share-btn"
              @click=${(e) => this.handleShare(e, site.name)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
                <use href="#S2_Icon_Share_20_N"></use>
              </svg>
              <span>Share</span>
            </button>
            <button
              class="card-action-btn hide-btn"
              @click=${(e) => this.handleHide(e, site.name, isPinned)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
                <use href="#S2_Icon_VisibilityOff_20_N"></use>
              </svg>
              <span>Hide</span>
            </button>
            <button
                  class="card-menu-btn"
                  @click=${(e) => this.handleCardFlip(e, site.name)}
                  title="Back"
                  aria-label="Card share options"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="icon more" viewBox="0 0 20 20">
                    <use href="#S2_Icon_More_20_N"></use>
                  </svg>
                </button>
          </div>
        </div>
      </div>
    `;
  }

  renderTabs() {
    const hasRecents = this._recents && this._recents.length > 0;
    const hasPinned = this._pinnedFolders && this._pinnedFolders.length > 0;

    if (!hasRecents && !hasPinned) return nothing;

    return html`
      <div class="tabs">
        ${hasRecents ? html`
          <button
            class="tab-button ${this._activeTab === 'recents' ? 'active' : ''}"
            @click=${() => { this._activeTab = 'recents'; }}
            aria-selected=${this._activeTab === 'recents' ? 'true' : 'false'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="icon recents" viewBox="0 0 20 20">
              <use href="#S2_Icon_Clock_20_N"></use>
            </svg>

            Recents
          </button>
        ` : nothing}
        ${hasPinned ? html`
          <button
            class="tab-button ${this._activeTab === 'pinned' ? 'active' : ''}"
            aria-selected=${this._activeTab === 'pinned' ? 'true' : 'false'}
            @click=${() => { this._activeTab = 'pinned'; }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="icon pinned" viewBox="0 0 20 20" fill="none">
              <use href="#S2_Icon_PinOff_20_N"></use>
            </svg>
            Pinned
          </button>
        ` : nothing}
      </div>
    `;
  }

  renderRecentSites() {
    return html`
      <div class="da-site-container">
        ${this.renderTabs()}
        ${this._activeTab === 'recents' ? html`
          <div class="nx-site-apps">
            ${this._recents.map((site) => this.renderSite(site, false))}
          </div>
        ` : nothing}
        ${this._activeTab === 'pinned' ? html`
          <div class="nx-site-apps">
            ${this._pinnedFolders.map((site) => this.renderSite(site, true))}
          </div>
        ` : nothing}
      </div>
    `;
  }

  renderAddNewSite() {
    return html`
      <div class='da-site-container'>
        <div class="da-site-header">
          <h2 class="error-title">Enter a site URL to explore its media</h2>
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
