import { html, LitElement } from 'da-lit';
import getStyle from '../../utils/styles.js';
import { getDocumentMediaBreakdown, loadMediaSheet } from './utils/processing.js';
import { copyMediaToClipboard } from './utils/utils.js';
import { processMediaData, calculateFilteredMediaData, calculateFilteredMediaDataFromIndex } from './utils/filters.js';
import { daFetch } from '../../utils/daFetch.js';
import { DA_ORIGIN } from '../../public/utils/constants.js';
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

class NxMediaLibrary extends LitElement {
  static properties = {
    sitePath: { state: true },
    _mediaData: { state: true },
    _error: { state: true },
    _searchQuery: { state: true },
    _selectedFilterType: { state: true },
    _filterCounts: { state: true },
    _currentView: { state: true },
    _progressiveMediaData: { state: true },
    _isScanning: { state: true },
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
    this._filteredDataCache = null;
    this._lastFilterParams = null;
    this._progressiveMediaData = [];
    this._progressiveGroupingKeys = new Set();
    this._progressiveLimit = 500;
    this._isScanning = false;
    this._scanStartTime = null;
    this._realTimeStats = { pages: 0, media: 0, elapsed: 0 };
    this._statsInterval = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, slComponents, styles];

    this._boundHandleAltTextUpdated = this.handleAltTextUpdated.bind(this);
    this._boundHandleScanStart = this.handleScanStart.bind(this);
    this._boundHandleScanComplete = this.handleScanComplete.bind(this);
    this._boundHandleProgressiveDataUpdate = this.handleProgressiveDataUpdate.bind(this);
    window.addEventListener('alt-text-updated', this._boundHandleAltTextUpdated);
    window.addEventListener('scanStart', this._boundHandleScanStart);
    window.addEventListener('scanComplete', this._boundHandleScanComplete);
    window.addEventListener('progressiveDataUpdate', this._boundHandleProgressiveDataUpdate);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._messageTimeout) {
      clearTimeout(this._messageTimeout);
    }
    if (this._statsInterval) {
      clearInterval(this._statsInterval);
    }
    window.removeEventListener('alt-text-updated', this._boundHandleAltTextUpdated);
    window.removeEventListener('scanStart', this._boundHandleScanStart);
    window.removeEventListener('scanComplete', this._boundHandleScanComplete);
    window.removeEventListener('progressiveDataUpdate', this._boundHandleProgressiveDataUpdate);
  }

  shouldUpdate(changedProperties) {
    const dataProps = ['_mediaData', '_error', '_progressiveMediaData', '_isScanning'];
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

      const sidebar = this.shadowRoot.querySelector('nx-media-sidebar');
      if (sidebar) {
        sidebar.isLoading = !this._processedData;
      }
    });
  }

  get filteredMediaData() {
    const currentParams = {
      filterType: this._selectedFilterType,
      searchQuery: this._searchQuery,
      selectedDocument: this.selectedDocument,
      dataLength: this._mediaData?.length || 0,
    };

    if (this._filteredDataCache
        && this._lastFilterParams
        && JSON.stringify(this._lastFilterParams) === JSON.stringify(currentParams)) {
      return this._filteredDataCache;
    }

    let filteredData;
    if (!this._processedData) {
      filteredData = calculateFilteredMediaData(
        this._mediaData,
        this._selectedFilterType,
        this._searchQuery,
        this.selectedDocument,
      );
    } else {
      filteredData = calculateFilteredMediaDataFromIndex(
        this._mediaData,
        this._processedData,
        this._selectedFilterType,
        this._searchQuery,
        this.selectedDocument,
      );
    }

    const deduplicatedData = [];
    const urlToItemMap = new Map();

    filteredData.forEach((item) => {
      if (item.url) {
        const usageCount = this._mediaData
          ? this._mediaData.filter((mediaItem) => {
            const isMatchingUrl = mediaItem.url === item.url;
            const hasDoc = mediaItem.doc && mediaItem.doc.trim();
            return isMatchingUrl && hasDoc;
          }).length
          : 0;
        const itemWithUsage = { ...item, usageCount };

        if (!urlToItemMap.has(item.url)) {
          urlToItemMap.set(item.url, itemWithUsage);
        } else {
          const existingItem = urlToItemMap.get(item.url);
          if (usageCount > existingItem.usageCount) {
            urlToItemMap.set(item.url, itemWithUsage);
          }
        }
      }
    });

    deduplicatedData.push(...urlToItemMap.values());

    this._filteredDataCache = deduplicatedData;
    this._lastFilterParams = currentParams;

    return deduplicatedData;
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
    let displayData;
    if (this._isScanning && this._progressiveMediaData.length > 0) {
      const existingKeys = new Set(
        this.filteredMediaData.map((item) => this.getGroupingKey(item.url)),
      );
      const uniqueProgressiveData = this._progressiveMediaData.filter(
        (item) => !existingKeys.has(this.getGroupingKey(item.url)),
      );
      displayData = [...this.filteredMediaData, ...uniqueProgressiveData];
    } else {
      displayData = this.filteredMediaData;
    }

    if (this._isScanning && this._progressiveMediaData.length === 0
        && this.filteredMediaData.length === 0) {
      return html`
        <div class="scanning-state">
          <div class="scanning-spinner"></div>
          <h3>Discovering Media</h3>
        </div>
      `;
    }

    switch (this._currentView) {
      case 'list':
        return html`
          <nx-media-list
            .mediaData=${displayData}
            .searchQuery=${this._searchQuery}
            .isScanning=${this._isScanning}
            @mediaClick=${this.handleMediaClick}
            @mediaCopy=${this.handleMediaCopy}
            @mediaUsage=${this.handleMediaUsage}
          ></nx-media-list>
        `;
      case 'grid':
      default:
        return html`
          <nx-media-grid
            .mediaData=${displayData}
            .searchQuery=${this._searchQuery}
            .isScanning=${this._isScanning}
            @mediaClick=${this.handleMediaClick}
            @mediaCopy=${this.handleMediaCopy}
            @mediaUsage=${this.handleMediaUsage}
          ></nx-media-grid>
        `;
    }
  }

  handleSearch(e) {
    const { query, type, path } = e.detail;
    this._searchQuery = query;
    this._needsFilterRecalculation = true;
    this._filteredDataCache = null;
    this._lastFilterParams = null;

    if (type === 'doc' && path) {
      this.handleDocNavigation(path);
    }
  }

  handleViewChange(e) {
    this._currentView = e.detail.view;
  }

  handleFilter(e) {
    this._selectedFilterType = e.detail.type;
    this._needsFilterRecalculation = true;
    this._filteredDataCache = null;
    this._lastFilterParams = null;
    this._searchQuery = '';
  }

  async handleMediaClick(e) {
    const { media } = e.detail;
    if (!media) return;

    const usageData = this._mediaData
      ?.filter((item) => item.url === media.url && item.doc && item.doc.trim())
      .map((item) => ({
        doc: item.doc,
        alt: item.alt,
        type: item.type,
        firstUsedAt: item.firstUsedAt,
        lastUsedAt: item.lastUsedAt,
      })) || [];

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

      window.dispatchEvent(new CustomEvent('show-notification', {
        detail: {
          ...result,
          type: 'success',
          open: true,
        },
      }));
    } catch (error) {
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

    const usageData = this._mediaData
      ?.filter((item) => item.url === media.url && item.doc && item.doc.trim())
      .map((item) => ({
        doc: item.doc,
        alt: item.alt,
        type: item.type,
        firstUsedAt: item.firstUsedAt,
        lastUsedAt: item.lastUsedAt,
      })) || [];

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
    this._searchQuery = '';
  }

  handleDocumentFilter(e) {
    const { type } = e.detail;
    this._selectedFilterType = type;
    this._needsFilterRecalculation = true;
    this._searchQuery = '';
  }

  startProgressiveScan() {
    this._isScanning = true;
    this._scanStartTime = Date.now();
    this._progressiveMediaData = [];
    this._progressiveGroupingKeys.clear();
    this._realTimeStats = { pages: 0, media: 0, elapsed: 0 };

    this._statsInterval = setInterval(() => {
      this._realTimeStats.elapsed = ((Date.now() - this._scanStartTime) / 1000).toFixed(1);
      this.requestUpdate();
    }, 100);
  }

  stopProgressiveScan() {
    this._isScanning = false;
    if (this._statsInterval) {
      clearInterval(this._statsInterval);
      this._statsInterval = null;
    }
  }

  async handleScanStart() {
    let hasExistingData = false;
    try {
      if (this.sitePath) {
        const [org, repo] = this.sitePath.split('/').slice(1, 3);
        if (org && repo) {
          const response = await daFetch(`${DA_ORIGIN}/source/${org}/${repo}/.da/mediaindex/media.json`);
          hasExistingData = response.ok;
        }
      }
    } catch (error) {
      // Ignore error
    }

    const hasCurrentData = (this._mediaData && this._mediaData.length > 0)
                          || (this.filteredMediaData && this.filteredMediaData.length > 0);

    if (hasExistingData || hasCurrentData) {
      this._progressiveMediaData = [];
      this._progressiveGroupingKeys.clear();
      this._realTimeStats = { pages: 0, media: 0, elapsed: 0 };
      this._scanStartTime = Date.now();
    } else {
      this.startProgressiveScan();
    }
  }

  handleScanComplete() {
    this.stopProgressiveScan();
  }

  handleProgressiveDataUpdate(e) {
    const { mediaItems } = e.detail;
    this.updateProgressiveData(mediaItems);
  }

  updateProgressiveData(mediaItems) {
    if (!mediaItems || mediaItems.length === 0) return;

    let hasUpdates = false;

    mediaItems.forEach((newItem) => {
      const groupingKey = this.getGroupingKey(newItem.url);
      const existingItem = this._progressiveMediaData.find(
        (item) => this.getGroupingKey(item.url) === groupingKey,
      );

      if (existingItem) {
        existingItem.usageCount = (existingItem.usageCount || 0) + 1;
        hasUpdates = true;
      }
    });

    const newUniqueItems = mediaItems.filter((newItem) => {
      const groupingKey = this.getGroupingKey(newItem.url);
      return !this._progressiveMediaData.some(
        (item) => this.getGroupingKey(item.url) === groupingKey,
      );
    }).map((item) => ({
      ...item,
      usageCount: 1,
    }));

    if (newUniqueItems.length > 0 || hasUpdates) {
      this._progressiveMediaData = [...this._progressiveMediaData, ...newUniqueItems];
      this._realTimeStats.media = this._progressiveMediaData.length;
    }

    if (this._progressiveMediaData.length > this._progressiveLimit) {
      this._progressiveMediaData = this._progressiveMediaData.slice(-this._progressiveLimit);
    }

    this.requestUpdate();
  }

  getGroupingKey(url) {
    if (!url) return '';
    return url.split('?')[0];
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
