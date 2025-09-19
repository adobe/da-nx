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
import './views/onboard/onboard.js';

const EL_NAME = 'nx-media-library';
const nx = `${new URL(import.meta.url).origin}/nx`;
const sl = await getStyle(`${nx}/public/sl/styles.css`);
const slComponents = await getStyle(`${nx}/public/sl/components.css`);
const styles = await getStyle(import.meta.url);

const ICONS = [
  `${nx}/public/icons/S2_Icon_Close_20_N.svg`,
];

class NxMediaLibrary extends LitElement {
  static properties = {
    sitePath: { state: true },
    _mediaData: { state: true },
    _error: { state: true },
    _searchQuery: { state: true },
    _selectedFilterType: { state: true },
    _filterCounts: { state: true },
    _currentView: { state: true },
  };

  constructor() {
    super();
    this._currentView = 'grid';
    this._selectedFilterType = 'all';
    this._needsFilterRecalculation = true;
    this._needsFilterUpdate = false;
    this._updateStartTime = 0;
    this._processedData = null;
    this._filteredMediaData = null;
    this._searchSuggestions = [];
    this._filterCounts = {};
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, slComponents, styles];

    getSvg({ parent: this.shadowRoot, paths: ICONS });
    window.addEventListener('alt-text-updated', this.handleAltTextUpdated);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._messageTimeout) {
      clearTimeout(this._messageTimeout);
    }
    window.removeEventListener('alt-text-updated', this.handleAltTextUpdated);
  }

  shouldUpdate(changedProperties) {
    const dataProps = ['_mediaData', '_error'];
    const filterProps = ['_searchQuery', '_selectedFilterType', '_filterCounts'];
    const uiProps = ['_currentView', 'sitePath'];
    const hasDataChange = dataProps.some((prop) => changedProperties.has(prop));
    const hasFilterChange = filterProps.some((prop) => changedProperties.has(prop));
    const hasUIChange = uiProps.some((prop) => changedProperties.has(prop));

    return hasDataChange || hasFilterChange || hasUIChange;
  }

  willUpdate(changedProperties) {
    if (changedProperties.has('_mediaData') && this._mediaData) {
      this._processedData = processMediaData(this._mediaData);
      this._needsFilterRecalculation = true;
      this._needsFilterUpdate = true;
    }

    if (changedProperties.has('_searchQuery')
        || changedProperties.has('_selectedFilterType')
    ) {
      this._needsFilterRecalculation = true;
    }
  }

  update(changedProperties) {
    if (changedProperties.has('sitePath')) {
      if (this.sitePath) {
        this._mediaData = null;
        this._error = null;
        this._searchQuery = '';
        this._selectedFilterType = 'all';
        this._filterCounts = {};
        this._processedData = null;
        this._filteredMediaData = null;
        this.initialize();
      }
    }
    super.update(changedProperties);
  }

  updated() {
    this.updateComplete.then(() => {
      if (this._needsFilterUpdate) {
        this.updateFilters();
        this._needsFilterUpdate = false;
      }
    });
  }

  get filteredMediaData() {
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

  get filterCounts() {
    return this._processedData?.filterCounts || {};
  }

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

  async initialize() {
    if (this.sitePath) {
      const [org, repo] = this.sitePath.split('/').slice(1, 3);
      if (org && repo) {
        await this.loadMediaData(org, repo);
      }
    }
  }

  async loadMediaData(org, repo) {
    try {
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
    this._filterCounts = this._processedData.filterCounts;
  }

  handleMediaDataUpdated(e) {
    const { mediaData } = e.detail;

    if (mediaData) {
      this._mediaData = mediaData;
      this._needsFilterRecalculation = true;
      this._needsFilterUpdate = true;
    }
  }

  handleSiteSelected(e) {
    const { sitePath } = e.detail;

    // Update the URL hash to navigate to the media library
    window.location.hash = sitePath;
  }

  render() {
    if (!this.sitePath) {
      return html`<nx-media-onboard @site-selected=${this.handleSiteSelected}></nx-media-onboard>`;
    }

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

  clearSearchQuery() {
    if (this._searchQuery) {
      this._searchQuery = '';
    }
  }

  handleSearch(e) {
    const { query, type, path } = e.detail;
    this._searchQuery = query;
    this._needsFilterRecalculation = true;

    if (type === 'doc' && path) {
      this.handleDocNavigation(path);
    }
  }

  handleDocNavigation() {
    // Document navigation handled through search
  }

  handleViewChange(e) {
    this._currentView = e.detail.view;
  }

  handleFilter(e) {
    this._selectedFilterType = e.detail.type;
    this._needsFilterRecalculation = true;
    this.clearSearchQuery();
  }

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

customElements.define(EL_NAME, NxMediaLibrary);

function setupMediaLibrary(el) {
  let cmp = document.querySelector(EL_NAME);
  if (!cmp) {
    cmp = document.createElement(EL_NAME);
    el.append(cmp);
  }

  const hash = window.location.hash?.replace('#', '');
  cmp.sitePath = hash;
}

export default function init(el) {
  el.innerHTML = '';
  setupMediaLibrary(el);
  window.addEventListener('hashchange', (e) => {
    setupMediaLibrary(el, e);
  });
}
