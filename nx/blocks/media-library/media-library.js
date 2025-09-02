import { html, LitElement } from 'da-lit';
import getStyle from '../../utils/styles.js';
import getSvg from '../../public/utils/svg.js';
import { getDocumentMediaBreakdown, loadMediaSheet } from './utils/processing.js';
import { copyMediaToClipboard } from './utils/utils.js';
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

class NxMediaLibrary extends LitElement {
  static properties = {
    // GROUP 1: Core Data Properties
    sitePath: { attribute: false },
    _mediaData: { state: true },
    _error: { state: true },

    // GROUP 2: Filter & Search Properties
    _searchQuery: { state: true },
    _selectedFilterType: { state: true },
    _filterCounts: { state: true },

    // GROUP 3: UI State Properties
    _currentView: { state: true },
  };

  constructor() {
    super();
    this._currentView = 'grid';
    this._selectedFilterType = 'all';
    this._needsFilterRecalculation = true;
    this._needsFilterUpdate = false;
    this._updateStartTime = 0;

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

  shouldUpdate(changedProperties) {
    // Only update for meaningful property changes
    const dataProps = ['_mediaData', '_error'];
    const filterProps = ['_searchQuery', '_selectedFilterType', '_filterCounts'];
    const uiProps = ['_currentView'];
    const hasDataChange = dataProps.some((prop) => changedProperties.has(prop));
    const hasFilterChange = filterProps.some((prop) => changedProperties.has(prop));
    const hasUIChange = uiProps.some((prop) => changedProperties.has(prop));

    return hasDataChange || hasFilterChange || hasUIChange;
  }

  willUpdate(changedProperties) {
    // Single-pass data processing when media data changes
    if (changedProperties.has('_mediaData') && this._mediaData) {
      this._processedData = processMediaData(this._mediaData);
      this._needsFilterRecalculation = true;
      this._needsFilterUpdate = true;
    }

    // Prepare filter recalculation for search/filter changes
    if (changedProperties.has('_searchQuery')
        || changedProperties.has('_selectedFilterType')
    ) {
      this._needsFilterRecalculation = true;
    }
  }

  update(changedProperties) {
    // Handle sitePath changes for timestamp management
    if (changedProperties.has('sitePath') && this.sitePath) {
      this.initialize();
    }
    super.update(changedProperties);
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
      const mediaData = await loadMediaSheet(org, repo);

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
  // RENDERING METHODS
  // ============================================================================

  render() {
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
