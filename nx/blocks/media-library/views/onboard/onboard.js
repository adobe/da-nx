import { html, LitElement, nothing } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import { getOrgRepoFrmUrl } from '../../utils/utils.js';
import { loadPinnedFolders } from '../../utils/pin-folders.js';

const EL_NAME = 'nx-media-onboard';
const styles = await getStyle(import.meta.url);

const RANDOM_MAX = 8;

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
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 26">
              <path fill="currentColor"
                d="M23.09,13.67c.14-.35.14-.74,0-1.08-.07-.17-.18-.33-.31-.46l-6.62-6.62c-.55-.55-1.45-.55-2,0-.55.55-.55,1.45,0,2l4.21,4.21H4.61c-.78,0-1.41.63-1.41,1.42s.63,1.42,1.41,1.42h13.76l-4.21,4.21c-.55.55-.55,1.45,0,2,.28.28.64.41,1,.41s.72-.14,1-.41l6.62-6.62c.13-.13.23-.29.31-.46Z" />
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
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
                  <path fill="currentColor" d="M16,17.51c.83,0,1.5-.67,1.5-1.5s-.67-1.5-1.5-1.5-1.5.67-1.5,1.5.67,1.5,1.5,1.5Z" />
                  <path fill="currentColor" d="M10,17.51c.83,0,1.5-.67,1.5-1.5s-.67-1.5-1.5-1.5-1.5.67-1.5,1.5.67,1.5,1.5,1.5Z" />
                  <path fill="currentColor" d="M22,17.51c.83,0,1.5-.67,1.5-1.5s-.67-1.5-1.5-1.5-1.5.67-1.5,1.5.67,1.5,1.5,1.5Z" />
                </svg>
                </button>
                <div class="card-arrow">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
                    <path fill="currentColor" d="M22.91,16.38c.1-.24.1-.51,0-.76-.05-.12-.12-.23-.21-.32l-4.63-4.63c-.39-.39-1.01-.39-1.4,0-.39.39-.39,1.01,0,1.4l2.94,2.94h-9.62c-.55,0-.99.44-.99.99s.44.99.99.99h9.62l-2.94,2.94c-.39.39-.39,1.01,0,1.4.19.19.45.29.7.29s.51-.1.7-.29l4.63-4.63c.09-.09.16-.2.21-.32Z" />
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
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path fill="currentColor" d="M13.5273 5.49023L10.5249 2.49267C10.2319 2.20068 9.75782 2.20019 9.46485 2.49316L6.46729 5.49072C6.17432 5.78369 6.17432 6.2583 6.46729 6.55127C6.61377 6.69775 6.80567 6.771 6.99756 6.771C7.18945 6.771 7.38135 6.69776 7.52783 6.55127L9.25 4.8291V13.0103C9.25 13.4243 9.58594 13.7603 10 13.7603C10.4141 13.7603 10.75 13.4243 10.75 13.0103V4.83667L12.4678 6.55176C12.7607 6.84375 13.2353 6.84473 13.5283 6.55078C13.8208 6.25781 13.8208 5.78271 13.5273 5.49023Z" fill="#292929"/>
                <path fill="currentColor" d="M15.75 18.021H4.25C3.00928 18.021 2 17.0117 2 15.771V10.021C2 9.60694 2.33594 9.271 2.75 9.271C3.16406 9.271 3.5 9.60694 3.5 10.021V15.771C3.5 16.1846 3.83643 16.521 4.25 16.521H15.75C16.1636 16.521 16.5 16.1846 16.5 15.771V10.021C16.5 9.60694 16.8359 9.271 17.25 9.271C17.6641 9.271 18 9.60694 18 10.021V15.771C18 17.0117 16.9907 18.021 15.75 18.021Z" fill="#292929"/>
              </svg>
              <span>Share</span>
            </button>
            <button
              class="card-action-btn hide-btn"
              @click=${(e) => this.handleHide(e, site.name, isPinned)}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path fill="currentColor" d="M9.96582 16.6826C5.11035 16.6826 0.75 12.2939 0.75 10.2217C0.75 9.30174 1.61426 7.86228 2.95117 6.55369C3.24609 6.2656 3.7207 6.26951 4.01172 6.56541C4.30176 6.86131 4.2959 7.33592 4 7.62596C2.69043 8.90721 2.25 9.9453 2.25 10.2217C2.25 11.3662 5.89746 15.1826 9.96582 15.1826C10.5703 15.1826 11.1973 15.0976 11.8291 14.9307C12.2266 14.8291 12.6396 15.0644 12.7461 15.4648C12.8516 15.8652 12.6123 16.2754 12.2119 16.3818C11.4561 16.581 10.7002 16.6826 9.96582 16.6826Z" fill="#292929"/>
                <path fill="currentColor" d="M16.6035 13.8428C16.4004 13.8428 16.1983 13.7607 16.0498 13.5986C15.7705 13.293 15.792 12.8184 16.0977 12.5391C17.2373 11.4971 17.75 10.5566 17.75 10.2217C17.75 9.41992 15.8457 6.94531 13.2393 5.66992C12.2305 5.16015 11.1104 4.88574 9.99024 4.87207C9.37012 4.87207 8.72559 4.96582 8.08497 5.15137C7.68458 5.26075 7.27052 5.03614 7.15626 4.63867C7.04103 4.24121 7.27052 3.82519 7.66896 3.70996C8.44435 3.48535 9.22853 3.37207 10 3.37207C11.3565 3.38867 12.7041 3.71875 13.9072 4.32617C16.6494 5.66894 19.25 8.53613 19.25 10.2217C19.25 11.1406 18.4502 12.4209 17.1094 13.6465C16.9658 13.7783 16.7842 13.8428 16.6035 13.8428Z" fill="#292929"/>
                <path fill="currentColor" d="M18.7803 17.7412L13.0022 11.9631C13.2056 11.6667 13.3599 11.3484 13.4611 11.0171C13.6699 10.3325 13.0029 9.7666 12.3423 10.041C11.8468 10.2468 11.3965 10.1816 11.1611 10.1221L9.7893 8.75024C9.69482 8.38086 9.70995 8.00537 9.82909 7.66455C10.0518 7.02783 9.35643 6.40576 8.72924 6.6543C8.49377 6.74756 8.26684 6.86768 8.05248 7.01343L2.28027 1.24121C1.9873 0.948242 1.51269 0.948242 1.21972 1.24121C0.92675 1.53418 0.92675 2.00879 1.21972 2.30176L17.7197 18.8018C17.8662 18.9482 18.0576 19.0215 18.25 19.0215C18.4424 19.0215 18.6338 18.9483 18.7803 18.8018C19.0732 18.5088 19.0732 18.0342 18.7803 17.7412Z" fill="#292929"/>
                <path fill="currentColor" d="M8.20459 12.9978C8.8999 13.4316 9.72754 13.5852 10.5237 13.4824L6.54199 9.50073C6.37366 10.8164 6.92773 12.2009 8.20459 12.9978Z" fill="#292929"/>
              </svg>
              <span>Hide</span>
            </button>
            <button
                  class="card-menu-btn"
                  @click=${(e) => this.handleCardFlip(e, site.name)}
                  title="Back"
                  aria-label="Card share options"
                >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
                  <path fill="currentColor" d="M16,17.51c.83,0,1.5-.67,1.5-1.5s-.67-1.5-1.5-1.5-1.5.67-1.5,1.5.67,1.5,1.5,1.5Z" />
                  <path fill="currentColor" d="M10,17.51c.83,0,1.5-.67,1.5-1.5s-.67-1.5-1.5-1.5-1.5.67-1.5,1.5.67,1.5,1.5,1.5Z" />
                  <path fill="currentColor" d="M22,17.51c.83,0,1.5-.67,1.5-1.5s-.67-1.5-1.5-1.5-1.5.67-1.5,1.5.67,1.5,1.5,1.5Z" />
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
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
              <path fill="currentColor" d="M10 18.75C5.1748 18.75 1.25 14.8252 1.25 10C1.25 5.1748 5.1748 1.25 10 1.25C14.8252 1.25 18.75 5.1748 18.75 10C18.75 14.8252 14.8252 18.75 10 18.75ZM10 2.75C6.00195 2.75 2.75 6.00195 2.75 10C2.75 13.998 6.00195 17.25 10 17.25C13.998 17.25 17.25 13.998 17.25 10C17.25 6.00195 13.998 2.75 10 2.75Z"/>
              <path d="M13.249 12.6445C13.1201 12.6445 12.9892 12.6113 12.8701 12.541L9.64941 10.6465C9.41992 10.5117 9.27929 10.2656 9.27929 10V5C9.27929 4.58594 9.61523 4.25 10.0293 4.25C10.4433 4.25 10.7793 4.58594 10.7793 5V9.57129L13.6299 11.248C13.9873 11.458 14.1064 11.918 13.8965 12.2744C13.7568 12.5127 13.5059 12.6445 13.249 12.6445Z"/>
            </svg>

            Recents
          </button>
        ` : nothing}
        ${hasPinned ? html`
          <button
            class="tab-button ${this._activeTab === 'pinned' ? 'active' : ''}"
            @click=${() => { this._activeTab = 'pinned'; }}
          >
            <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path fill="currentColor" d="M17.3809 6.56641L13.4346 2.62012C13.0723 2.25684 12.5889 2.05762 12.0752 2.05762C11.5605 2.05762 11.0752 2.25879 10.7139 2.6211C10.2891 3.04493 10.0928 3.62012 10.1572 4.18555L6.99219 7.35059L4.68067 7.15235C3.93262 7.06641 3.24317 7.46192 2.9209 8.1377C2.59863 8.81543 2.7334 9.59668 3.26465 10.1279L6.03809 12.9014L2.21973 16.7197C1.92676 17.0127 1.92676 17.4873 2.21973 17.7803C2.36621 17.9268 2.55762 18 2.75 18C2.94238 18 3.13379 17.9268 3.28027 17.7803L7.09863 13.9619L9.87304 16.7363C10.2119 17.0762 10.6533 17.2529 11.1045 17.2529C11.3594 17.2529 11.6172 17.1963 11.8623 17.0801C12.5391 16.7578 12.9258 16.0674 12.8486 15.334L12.6484 13.0078L15.8144 9.8418C16.3818 9.90918 16.9551 9.71192 17.3789 9.28809C17.7422 8.92481 17.9424 8.44239 17.9433 7.92871C17.9443 7.41309 17.7441 6.92969 17.3809 6.56641ZM16.3184 8.22754C16.1914 8.35352 16.0303 8.38672 15.8809 8.32324C15.5996 8.19922 15.2715 8.26367 15.0537 8.48144L11.3408 12.1943C11.1846 12.3506 11.1045 12.5683 11.124 12.7891L11.3555 15.4766C11.3711 15.6211 11.2881 15.6914 11.2168 15.7256C11.1445 15.7607 11.0361 15.7783 10.9336 15.6758L4.32521 9.06738C4.22169 8.96386 4.24025 8.85547 4.27541 8.7832C4.30666 8.71777 4.36818 8.64355 4.49904 8.64355C4.51174 8.64355 4.52443 8.64453 4.5381 8.6455L7.21095 8.87499C7.43263 8.8955 7.64845 8.81542 7.80568 8.65819L11.5176 4.94628C11.7344 4.72948 11.7979 4.40136 11.6758 4.11913C11.6104 3.96581 11.6445 3.81151 11.7744 3.68163C11.8545 3.60155 11.9609 3.55761 12.0752 3.55761C12.1885 3.55761 12.2949 3.60156 12.374 3.68066L16.3203 7.62695C16.4854 7.79199 16.4844 8.06152 16.3184 8.22754Z"/>
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
      <div class="da-site-container">
        <h2 class="error-title">Browse Media</h2>
        <div class="da-no-site-well browse-media">
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
