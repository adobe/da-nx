import { html, LitElement, nothing } from 'da-lit';
import getStyle from '../../utils/styles.js';
import getSvg from '../../public/utils/svg.js';

// import { getRecents } from './utils/new.js';

import { getDocumentMediaBreakdown, loadMediaSheet } from './utils/processing.js';
import { copyMediaToClipboard, parseAemUrl } from './utils/utils.js';
import { processMediaData, calculateFilteredMediaData } from './utils/filters.js';
import '../../public/sl/components.js';
import './views/topbar/topbar.js';
import './views/sidebar/sidebar.js';
import './views/grid/grid.js';

import './views/list/list.js';
import './views/modal-manager/modal-manager.js';
import './views/scan/scan.js';

const EL_NAME = 'nx-media-library';
const nx = `${new URL(import.meta.url).origin}/nx`;
const sl = await getStyle(`${nx}/public/sl/styles.css`);
const slComponents = await getStyle(`${nx}/public/sl/components.css`);
const styles = await getStyle(import.meta.url);

// Configuration constants - removed unused CONFIG variable

const ICONS = [
  `${nx}/public/icons/S2_Icon_Close_20_N.svg`,
];

const RANDOM_MAX = 8;

function getRandom() {
  return Math.floor(Math.random() * RANDOM_MAX);
}

class NxMediaLibrary extends LitElement {
  static properties = {
    // GROUP 1: Core Data Properties
    sitePath: { state: true },
    _mediaData: { state: true },
    _error: { state: true },
    _hasValidPath: { state: true },

    // GROUP 2: Filter & Search Properties
    _searchQuery: { state: true },
    _selectedFilterType: { state: true },
    _filterCounts: { state: true },

    // GROUP 3: UI State Properties
    _currentView: { state: true },
    _recents: { state: true },
    _urlError: { state: true },
  };

  constructor() {
    super();
    this._currentView = 'grid';
    this._selectedFilterType = 'all';
    this._needsFilterRecalculation = true;
    this._needsFilterUpdate = false;
    this._updateStartTime = 0;
    this._hasValidPath = false;
    this._recentSites = [];

    // Single-pass processing results
    this._processedData = null;
    this._filteredMediaData = null;
    this._searchSuggestions = [];

    this._filterCounts = {}; // Make this reactive
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, slComponents, styles];

    getSvg({ parent: this.shadowRoot, paths: ICONS });

    // Listen for alt text updates from modal manager
    window.addEventListener('alt-text-updated', this.handleAltTextUpdated);

    this.getRecents();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._messageTimeout) {
      clearTimeout(this._messageTimeout);
    }
    window.removeEventListener('alt-text-updated', this.handleAltTextUpdated);
  }

  // ============================================================================
  // LIFECYCLE OPTIMIZATION
  // ============================================================================

  // shouldUpdate(changedProperties) {
  //   // Only update for meaningful property changes
  //   const dataProps = ['_mediaData', '_error', 'sitePath'];
  //   const filterProps = ['_searchQuery', '_selectedFilterType', '_filterCounts'];
  //   const uiProps = ['_currentView'];
  //   const hasDataChange = dataProps.some((prop) => changedProperties.has(prop));
  //   const hasFilterChange = filterProps.some((prop) => changedProperties.has(prop));
  //   const hasUIChange = uiProps.some((prop) => changedProperties.has(prop));

  //   return hasDataChange || hasFilterChange || hasUIChange;
  // }

  // willUpdate(changedProperties) {
  //   // Single-pass data processing when media data changes
  //   if (changedProperties.has('_mediaData') && this._mediaData) {
  //     this._processedData = processMediaData(this._mediaData);
  //     this._needsFilterRecalculation = true;
  //     this._needsFilterUpdate = true;
  //   }

  //   // Prepare filter recalculation for search/filter changes
  //   if (changedProperties.has('_searchQuery')
  //       || changedProperties.has('_selectedFilterType')
  //   ) {
  //     this._needsFilterRecalculation = true;
  //   }
  // }

  // update(changedProperties) {
  //   // Handle sitePath changes for timestamp management
  //   if (changedProperties.has('sitePath') && this.sitePath) {
  //     this.initialize();
  //   }
  //   super.update(changedProperties);
  // }

  update(props) {
    console.log('props', props);
    if (props.has('sitePath') && this.sitePath) {
      this.initialize();
      if (!this.sitePath) {
        const recentSites = this.getRecents();
        if (recentSites && recentSites.length > 0) {
          this.mapRecentSites(recentSites);
        }
      }
    }
    super.update(props);
  }

  updated() {
    // Handle post-update side effects
    this.updateComplete.then(() => {
      if (this._needsFilterUpdate) {
        this.updateFilters();
        this._needsFilterUpdate = false;
      }
    });
  }

  // ============================================================================
  // COMPUTED PROPERTIES (GETTERS)
  // ============================================================================

  get filteredMediaData() {
    // Always recalculate when accessed
    this._filteredMediaData = calculateFilteredMediaData(
      this._mediaData,
      this._selectedFilterType,
      this._searchQuery,
      this.selectedDocument,
    );

    return this._filteredMediaData || [];
  }

  get selectedDocument() {
    if (this._mediaData && this._mediaData.length > 0) {
      const indexDoc = this._mediaData.find((media) => media.doc === '/index.html');
      if (indexDoc) {
        return '/index.html';
      }

      const firstDoc = this._mediaData.find((media) => media.doc && media.doc.trim());
      if (firstDoc) {
        return firstDoc.doc;
      }
    }

    return null;
  }

  get documentMediaBreakdown() {
    if (!this.selectedDocument || !this._mediaData) {
      return null;
    }
    return getDocumentMediaBreakdown(this._mediaData, this.selectedDocument);
  }

  // ============================================================================
  // DATA PROCESSING METHODS
  // ============================================================================

  // ============================================================================
  // FILTER COUNTS GETTER
  // ============================================================================

  get filterCounts() {
    return this._processedData?.filterCounts || {};
  }

  // ============================================================================
  // ORG/REPO GETTERS
  // ============================================================================

  get org() {
    if (!this.sitePath) return null;
    const [org] = this.sitePath.split('/').slice(1, 3);
    return org;
  }

  get repo() {
    if (!this.sitePath) return null;
    const [, repo] = this.sitePath.split('/').slice(1, 3);
    return repo;
  }

  // ============================================================================
  // INITIALIZATION & DATA LOADING
  // ============================================================================

  async initialize() {
    // Initial data loading with timestamp management
    if (this.sitePath) {
      console.log('WTF', this.sitePath);
      const [org, repo] = this.sitePath.split('/').slice(1, 3);
      if (org && repo) {
        // Load initial media data using the combined method
        await this.loadMediaData(org, repo);
      }
    }
  }

  async loadMediaData(org, repo) {
    try {
      // For initial load, always load the data regardless of changes
      // START HERE RC
      const mediaData = await loadMediaSheet(org, repo);
      console.log('mediaData', mediaData.length, org, repo);

      if (mediaData && mediaData.length > 0) {
        this._mediaData = mediaData;
        this._needsFilterRecalculation = true;
        this._needsFilterUpdate = true;
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[MAIN] Failed to load media data:', error);
    }
  }

  updateFilters() {
    if (!this._processedData) return;
    // Use pre-calculated filter counts from single-pass processing
    this._filterCounts = this._processedData.filterCounts;
  }

  // ============================================================================
  // MEDIA DATA UPDATE HANDLER
  // ============================================================================

  handleMediaDataUpdated(e) {
    const { mediaData } = e.detail;

    if (mediaData) {
      this._mediaData = mediaData;
      this._needsFilterRecalculation = true;
      this._needsFilterUpdate = true;
    }
  }

  // ============================================================================
  // RECENT SITES MANAGEMENT
  // ============================================================================

  mapRecentSites(recentSites) {
    console.log('recentSites', recentSites);
    this._recents = recentSites.map((name) => (
      console.log('wtf name', name),
      {
        name,
        img: `/blocks/browse/da-sites/img/cards/da-${getRandom()}.jpg`,
        style: `da-card-style-${getRandom()}`,
      }
    ));
  }

  mapRecentOrgs(recentOrgs) {
    this._recents = recentOrgs.map((name) => (
      {
        name,
        img: `/blocks/browse/da-sites/img/cards/da-${getRandom()}.jpg`,
        style: `da-card-style-${getRandom()}`,
      }
    ));
  }

  getRecents() {
    const recentSites = JSON.parse(localStorage.getItem('da-sites')) || [];
    console.log('recentSites json', recentSites);
    const recentOrgs = JSON.parse(localStorage.getItem('da-orgs')) || [];
    if (recentSites.length > 0) {
      this.mapRecentSites(recentSites);
      console.log('recentSites', recentSites);
      localStorage.removeItem('da-orgs');
    } else if (recentOrgs.length > 0) {
      this.mapRecentOrgs(recentOrgs);
    }
  }

  async handleGo(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const { siteUrl } = Object.fromEntries(formData);
    console.log('siteUrl', siteUrl);
    if (!siteUrl) return;
    // const [, site, org] = siteUrl.split('/')[2].split('--');
    const { repo, org } = parseAemUrl(siteUrl);
    console.log('result', repo, org);
    const result = `/#/${org}/${repo}`;
    if (result) {
      window.location.href = `${window.location.href}${result}`;
    } else {
      this._urlError = true;
    }
  }

  // ============================================================================
  // EVENT HANDLERS - SEARCH & FILTERING
  // ============================================================================

  clearSearchQuery() {
    if (this._searchQuery) {
      this._searchQuery = '';
    }
  }

  handleSearch(e) {
    const { query, type, path } = e.detail;
    this._searchQuery = query;
    this._needsFilterRecalculation = true;

    // Handle smart navigation
    if (type === 'doc' && path) {
      this.handleDocNavigation(path);
    }
  }

  // eslint-disable-next-line no-unused-vars
  handleDocNavigation(path) {
    // Extract the actual document path from "doc:/path" format
    // const actualPath = path.replace(/^doc:\//, ''); // eslint-disable-line no-unused-vars
    // Note: Document navigation is now handled through search
    // console.log('Document navigation to:', actualPath); // eslint-disable-line no-console
  }

  handleViewChange(e) {
    this._currentView = e.detail.view;
  }

  handleFilter(e) {
    this._selectedFilterType = e.detail.type;
    this._needsFilterRecalculation = true;
    this.clearSearchQuery();
  }

  // ============================================================================
  // EVENT HANDLERS - MEDIA INTERACTIONS
  // ============================================================================

  async handleMediaClick(e) {
    const { media } = e.detail;
    if (!media) return;

    // Pre-filter usage data for the modal
    const usageData = this._mediaData
      ?.filter((item) => item.url === media.url && item.doc && item.doc.trim())
      .map((item) => ({
        doc: item.doc,
        alt: item.alt,
        type: item.type,
        firstUsedAt: item.firstUsedAt,
        lastUsedAt: item.lastUsedAt,
      })) || [];

    // Open modal via modal manager
    window.dispatchEvent(new CustomEvent('open-modal', {
      detail: {
        type: 'details',
        data: {
          media,
          usageData,
          org: this.org,
          repo: this.repo,
        },
      },
    }));
  }

  async handleMediaCopy(e) {
    const { media } = e.detail;
    if (!media) return;

    try {
      const result = await copyMediaToClipboard(media);

      // Show notification via modal manager
      window.dispatchEvent(new CustomEvent('show-notification', {
        detail: {
          ...result,
          type: 'success',
          open: true,
        },
      }));
    } catch (error) {
      // Show error notification via modal manager
      window.dispatchEvent(new CustomEvent('show-notification', {
        detail: {
          heading: 'Error',
          message: 'Failed to copy to clipboard.',
          type: 'danger',
          open: true,
        },
      }));
    }
  }

  handleMediaUsage(e) {
    const { media } = e.detail;

    // Pre-filter usage data for the modal
    const usageData = this._mediaData
      ?.filter((item) => item.url === media.url && item.doc && item.doc.trim())
      .map((item) => ({
        doc: item.doc,
        alt: item.alt,
        type: item.type,
        firstUsedAt: item.firstUsedAt,
        lastUsedAt: item.lastUsedAt,
      })) || [];

    // Open modal via modal manager
    window.dispatchEvent(new CustomEvent('open-modal', {
      detail: {
        type: 'details',
        data: {
          media,
          usageData,
          org: this.org,
          repo: this.repo,
        },
      },
    }));
  }

  handleAltTextUpdated(e) {
    const { media } = e.detail;

    if (this._mediaData) {
      const index = this._mediaData.findIndex((item) => item.url === media.url);
      if (index !== -1) {
        this._mediaData[index] = { ...this._mediaData[index], ...media };
        this._needsFilterRecalculation = true;
        this.requestUpdate();
      }
    }
  }

  // ============================================================================
  // EVENT HANDLERS - DOCUMENT MANAGEMENT
  // ============================================================================

  handleClearDocumentFilter() {
    this._needsFilterRecalculation = true;
    this.clearSearchQuery();
  }

  handleDocumentFilter(e) {
    const { type } = e.detail;
    this._selectedFilterType = type;
    this._needsFilterRecalculation = true;
    this.clearSearchQuery();
  }

  // ============================================================================
  // RENDERING METHODS
  // ============================================================================

  renderGo() {
    return html`
      <form @submit=${this.handleGo}>
        <input
            @keydown="${() => { this._urlError = false; }}"
            @change="${() => { this._urlError = false; }}"
            type="text" name="siteUrl"
            placeholder="https://main--site--org.aem.page"
            class="${this._urlError ? 'error' : nothing}"
        />
        <div class="da-form-btn-offset">
          <button aria-label="Go to site">
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
    return html`
      <li class="da-site-outer">
        <div class="da-site">
          <div class="da-site-front">
            <picture>
              <img src="${site.img}" width="480" height="672" alt="" />
            </picture>
            <div class="bg-overlay ${site.style}">
              <a href="#/${site.name}">
                <span>${site.name.split('/')[1]}</span>
                <span>${site.name.split('/')[0]}</span>
                <span class="da-site-card-action da-site-card-action-go">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
                      <path fill="currentColor" d="M22.91,16.38c.1-.24.1-.51,0-.76-.05-.12-.12-.23-.21-.32l-4.63-4.63c-.39-.39-1.01-.39-1.4,0-.39.39-.39,1.01,0,1.4l2.94,2.94h-9.62c-.55,0-.99.44-.99.99s.44.99.99.99h9.62l-2.94,2.94c-.39.39-.39,1.01,0,1.4.19.19.45.29.7.29s.51-.1.7-.29l4.63-4.63c.09-.09.16-.2.21-.32Z" />
                  </svg>
                </span>
              </a>
            </div>
          </div>
        </div>
      </li>
    `;
  }

  renderSites(sites) {
    return html`
      <ul class="da-sites-list">${sites.map((site) => this.renderSite(site))}</ul>
    `;
  }

  renderEmpty() {
    return html`
      <div class='da-site-container'>
        <h2 class="error-title">Recents</h2>
        <div class="da-no-site-well no-path">
          <img src="/blocks/browse/da-sites/img/site-icon-color.svg" width="78" height="60" alt=""/>
          <div class="da-no-site-text">
            <h3>You don’t have any recent sites.</h3>
            <p>Enter the URL for your site to get started.</p>
          </div>
          ${this.renderGo()}
        </div>
      </div>
    `;
  }

  renderCurrentView() {
    // Always render components - let them handle their own empty states
    switch (this._currentView) {
      case 'list':
        return html`
          <nx-media-list
            .mediaData=${this.filteredMediaData}
            .searchQuery=${this._searchQuery}
            @mediaClick=${this.handleMediaClick}
            @mediaCopy=${this.handleMediaCopy}
            @mediaUsage=${this.handleMediaUsage}
          ></nx-media-list>
        `;
      case 'grid':
      default:
        return html`
          <nx-media-grid
            .mediaData=${this.filteredMediaData}
            .searchQuery=${this._searchQuery}
            @mediaClick=${this.handleMediaClick}
            @mediaCopy=${this.handleMediaCopy}
            @mediaUsage=${this.handleMediaUsage}
          ></nx-media-grid>
        `;
    }
  }

  renderLibrary() {
    return html`
      <div class="media-library">
        <div class="top-bar">
          <nx-media-topbar
            .searchQuery=${this._searchQuery}
            .currentView=${this._currentView}
            .mediaData=${this._mediaData}
            .sitePath=${this.sitePath}
            @search=${this.handleSearch}
            @viewChange=${this.handleViewChange}
            @mediaDataUpdated=${this.handleMediaDataUpdated}
          ></nx-media-topbar>
        </div>

        <div class="content">
          ${this.renderCurrentView()}
        </div>

        <nx-media-sidebar
          .activeFilter=${this._selectedFilterType}
          .selectedDocument=${this.selectedDocument}
          .documentMediaBreakdown=${this.documentMediaBreakdown}
          .filterCounts=${this.filterCounts}
          @filter=${this.handleFilter}
          @clearDocumentFilter=${this.handleClearDocumentFilter}
          @documentFilter=${this.handleDocumentFilter}
        ></nx-media-sidebar>

        <nx-modal-manager></nx-modal-manager>
      </div>
    `;
  }

  renderRecents() {
    return html`
      <div class="da-site-container no-path">
        <div class="error-state">
          <div class="error-content">
            ${console.log('this._recents', this._recents)}
            <h2 class="error-title">Recents</h2>
            ${this.renderSites(this._recents)}
          </div>
        </div>
      </div>
    `;
  }

  render() {
    if (this.sitePath) return this.renderLibrary();
    if (this._recents) return this.renderRecents();
    return this.renderEmpty();
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

customElements.define(EL_NAME, NxMediaLibrary);

function setupMediaLibrary(el) {
  let cmp = document.querySelector(EL_NAME);
  if (!cmp) {
    cmp = document.createElement(EL_NAME);
    el.append(cmp);
  }

  cmp.sitePath = window.location.hash?.replace('#', '');
}

export default function init(el) {
  el.innerHTML = '';
  setupMediaLibrary(el);
  window.addEventListener('hashchange', (e) => {
    setupMediaLibrary(el, e);
  });
}
