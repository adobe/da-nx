import { html, LitElement } from 'da-lit';
import getStyle from '../../utils/styles.js';
import { getDocumentMediaBreakdown, loadMediaSheet } from './utils/processing.js';
import { copyMediaToClipboard } from './utils/utils.js';
import {
  processMediaData,
  applyFilter,
  filterBySearch,
  getGroupingKey,
  getDocumentFilteredItems,
  getFolderFilteredItems,
} from './utils/filters.js';
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
    _rawMediaData: { state: true },
    _usageIndex: { state: true },
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
    this._lastProcessedData = null;
    this._progressiveMediaData = [];
    this._progressiveGroupingKeys = new Set();
    this._progressiveLimit = 500;
    this._isScanning = false;
    this._scanStartTime = null;
    this._scanCompleted = false;
    this._scanInProgress = false;
    this._isProcessingData = false;
    this._realTimeStats = { pages: 0, media: 0, elapsed: 0 };
    this._statsInterval = null;
    this._selectedFolder = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, slComponents, styles];

    this._boundHandleAltTextUpdated = this.handleAltTextUpdated.bind(this);
    this._boundHandleScanStart = this.handleScanStart.bind(this);
    this._boundHandleScanComplete = this.handleScanComplete.bind(this);
    this._boundHandleProgressiveDataUpdate = this.handleProgressiveDataUpdate.bind(this);
    this._boundHandleMediaDataUpdated = this.handleMediaDataUpdated.bind(this);
    window.addEventListener('alt-text-updated', this._boundHandleAltTextUpdated);
    window.addEventListener('scanStart', this._boundHandleScanStart);
    window.addEventListener('scanComplete', this._boundHandleScanComplete);
    window.addEventListener('progressiveDataUpdate', this._boundHandleProgressiveDataUpdate);
    window.addEventListener('mediaDataUpdated', this._boundHandleMediaDataUpdated);
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
    window.removeEventListener('mediaDataUpdated', this._boundHandleMediaDataUpdated);
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
      // Simple data change - no complex processing
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

      // Sidebar isLoading state is now handled via template binding
    });
  }

  get filteredMediaData() {
    if (!this._mediaData || this._mediaData.length === 0) {
      return [];
    }

    // For document filtering, use optimized approach with processed data
    if (this._selectedFilterType && this._selectedFilterType.startsWith('document') && this._processedData) {
      return getDocumentFilteredItems(
        this._processedData,
        this._mediaData,
        this.selectedDocument,
        this._selectedFilterType,
      );
    }

    // Create unique items with usage counts from processed data
    const uniqueItems = [];
    const seenKeys = new Set();

    this._mediaData.forEach((item) => {
      const groupingKey = getGroupingKey(item.url);
      if (!seenKeys.has(groupingKey)) {
        seenKeys.add(groupingKey);

        // Ensure usage count is set correctly
        let usageCount = item.usageCount || 1;
        if (this._processedData && this._processedData.usageData
          && this._processedData.usageData[groupingKey]) {
          usageCount = this._processedData.usageData[groupingKey].count;
        }

        uniqueItems.push({
          ...item,
          usageCount,
        });
      }
    });

    // Apply folder filtering if a folder is selected
    let dataWithUsageCounts = uniqueItems;
    if (this._selectedFolder) {
      dataWithUsageCounts = getFolderFilteredItems(
        uniqueItems,
        this._selectedFolder,
        this._usageIndex,
      );
    }

    // Apply search filtering if there's a search query
    let finalData = dataWithUsageCounts;
    if (this._searchQuery && this._searchQuery.trim()) {
      finalData = filterBySearch(dataWithUsageCounts, this._searchQuery);
    }

    // Apply filter if not 'all'
    if (this._selectedFilterType && this._selectedFilterType !== 'all') {
      return applyFilter(
        finalData,
        this._selectedFilterType,
        this.selectedDocument,
      );
    }

    return finalData;
  }

  getFolderFilteredItems(data) {
    if (!this._selectedFolder || !data) {
      return data;
    }

    if (this._usageIndex && this._usageIndex.size > 0) {
      const mediaUrlsInFolder = new Set();
      const folderUsageCounts = new Map();

      this._usageIndex.forEach((usageEntries, groupingKey) => {
        usageEntries.forEach((entry) => {
          if (!entry.doc) return;

          let isInFolder = false;
          if (this._selectedFolder === '/' || this._selectedFolder === '') {
            if (!entry.doc.includes('/', 1)) {
              isInFolder = true;
            }
          } else {
            const cleanPath = entry.doc.replace(/\.html$/, '');
            const parts = cleanPath.split('/');

            if (parts.length > 2) {
              const folderPath = parts.slice(0, -1).join('/');
              const searchPath = this._selectedFolder.startsWith('/') ? this._selectedFolder : `/${this._selectedFolder}`;
              if (folderPath === searchPath) {
                isInFolder = true;
              }
            }
          }

          if (isInFolder) {
            const mediaItem = data.find((item) => getGroupingKey(item.url) === groupingKey);
            if (mediaItem) {
              mediaUrlsInFolder.add(mediaItem.url);
              const currentCount = folderUsageCounts.get(mediaItem.url) || 0;
              folderUsageCounts.set(mediaItem.url, currentCount + 1);
            }
          }
        });
      });

      const filteredData = data.filter((item) => mediaUrlsInFolder.has(item.url));

      filteredData.forEach((item) => {
        const folderCount = folderUsageCounts.get(item.url) || 0;
        item.folderUsageCount = folderCount;
      });

      return filteredData;
    }

    if (this._rawMediaData && this._rawMediaData.length > 0) {
      const mediaUrlsInFolder = new Set();
      const folderUsageCounts = new Map();

      this._rawMediaData.forEach((item) => {
        if (!item.doc) return;

        let isInFolder = false;
        if (this._selectedFolder === '/' || this._selectedFolder === '') {
          if (!item.doc.includes('/', 1)) {
            isInFolder = true;
          }
        } else {
          const cleanPath = item.doc.replace(/\.html$/, '');
          const parts = cleanPath.split('/');

          if (parts.length > 2) {
            const folderPath = parts.slice(0, -1).join('/');
            const searchPath = this._selectedFolder.startsWith('/') ? this._selectedFolder : `/${this._selectedFolder}`;
            if (folderPath === searchPath) {
              isInFolder = true;
            }
          }
        }

        if (isInFolder) {
          mediaUrlsInFolder.add(item.url);
          const currentCount = folderUsageCounts.get(item.url) || 0;
          folderUsageCounts.set(item.url, currentCount + 1);
        }
      });

      const filteredData = data.filter((item) => mediaUrlsInFolder.has(item.url));

      filteredData.forEach((item) => {
        const folderCount = folderUsageCounts.get(item.url) || 0;
        item.folderUsageCount = folderCount;
      });

      return filteredData;
    }

    return data.filter((item) => {
      if (!item.doc) return false;

      if (this._selectedFolder === '/' || this._selectedFolder === '') {
        return !item.doc.includes('/', 1);
      }

      const cleanPath = item.doc.replace(/\.html$/, '');
      const parts = cleanPath.split('/');

      if (parts.length > 2) {
        const folderPath = parts.slice(0, -1).join('/');
        const searchPath = this._selectedFolder.startsWith('/') ? this._selectedFolder : `/${this._selectedFolder}`;
        return folderPath === searchPath;
      }

      return false;
    });
  }

  get selectedDocument() {
    if (this._selectedDocument) {
      return this._selectedDocument;
    }

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
        // Store raw data for suggestions
        this._rawMediaData = mediaData;

        // Build usage index for O(1) lookups
        this._usageIndex = this.buildUsageIndex(mediaData);

        // Process raw data first to calculate usage counts
        this._processedData = await processMediaData(mediaData);
        // Then deduplicate the data using the same grouping logic
        const uniqueItems = [];
        const seenKeys = new Set();

        mediaData.forEach((item) => {
          const groupingKey = getGroupingKey(item.url);
          if (!seenKeys.has(groupingKey)) {
            seenKeys.add(groupingKey);
            uniqueItems.push(item);
          }
        });

        this._mediaData = uniqueItems;
        this._needsFilterRecalculation = true;
        this._needsFilterUpdate = true;

        this.updateFilters();

        this._filteredDataCache = null;
        this._lastFilterParams = null;
        this._lastProcessedData = null;
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

  async handleMediaDataUpdated(e) {
    const { mediaData } = e.detail;

    // Process the data for usage counts and filters
    if (mediaData && mediaData.length > 0) {
      // Store raw data for suggestions
      this._rawMediaData = mediaData;

      // Build usage index for O(1) lookups
      this._usageIndex = this.buildUsageIndex(mediaData);

      // Deduplicate the data using the same grouping logic
      const uniqueItems = [];
      const seenKeys = new Set();

      mediaData.forEach((item) => {
        const groupingKey = getGroupingKey(item.url);
        if (!seenKeys.has(groupingKey)) {
          seenKeys.add(groupingKey);
          uniqueItems.push(item);
        }
      });

      this._mediaData = uniqueItems;
      this._processedData = await processMediaData(uniqueItems);
      this._needsFilterRecalculation = true;
      this._needsFilterUpdate = true;

      // Update filter counts
      this.updateFilters();

      // Clear any cached data
      this._filteredDataCache = null;
      this._lastFilterParams = null;
      this._lastProcessedData = null;
    }
  }

  handleSiteSelected(e) {
    const { sitePath } = e.detail;

    window.location.hash = sitePath;
  }

  handleDocNavigation(path) {
    if (path) {
      this._selectedDocument = path;
      this._selectedFilterType = 'documentTotal'; // Set to document filter to show all media for this document
      this._searchQuery = ''; // Clear search query to avoid interference
      this._needsFilterRecalculation = true;
      this._filteredDataCache = null;
      this._lastFilterParams = null;
      this.requestUpdate();
    }
  }

  handleFolderNavigation(path) {
    if (path) {
      this._selectedFolder = path;
      this._selectedFilterType = 'all'; // Reset to all filter for folder search
      this._searchQuery = ''; // Clear search query to avoid interference
      this._needsFilterRecalculation = true;
      this._filteredDataCache = null;
      this._lastFilterParams = null;
      this.requestUpdate();
    }
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
            .mediaData=${this._rawMediaData || this._mediaData}
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
          .isLoading=${!this._processedData}
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
    if (this._isScanning) {
      if (this._progressiveMediaData.length > 0) {
        displayData = this._progressiveMediaData;
      } else if (this.filteredMediaData.length > 0) {
        // During incremental scan, show existing data while waiting for progressive data
        displayData = this.filteredMediaData;
      } else {
        return this.renderScanningState();
      }
    } else {
      displayData = this.filteredMediaData;
    }

    if (this._isScanning && this._progressiveMediaData.length === 0
        && this.filteredMediaData.length === 0) {
      return this.renderScanningState();
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

    if (!query || !query.trim()) {
      this._selectedDocument = null;
      this._selectedFolder = null;
      this._selectedFilterType = 'all';
      this.requestUpdate();
      return;
    }

    let searchType = type;
    let searchPath = path;

    if (!searchType || !searchPath) {
      const colonSyntax = this.parseColonSyntax(query);
      if (colonSyntax) {
        searchType = colonSyntax.field;
        searchPath = colonSyntax.value;
      }
    }

    if (searchType === 'doc' && searchPath) {
      this.handleDocNavigation(searchPath);
    } else if (searchType === 'folder' && searchPath !== undefined) {
      this.handleFolderNavigation(searchPath);
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

    const groupingKey = getGroupingKey(media.url);
    const usageData = this._usageIndex?.get(groupingKey) || [];

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

    const groupingKey = getGroupingKey(media.url);
    const usageData = this._usageIndex?.get(groupingKey) || [];

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

  renderScanningState() {
    return html`
      <div class="scanning-state">
        <div class="scanning-spinner"></div>
        <h3>Discovering Media</h3>
      </div>
    `;
  }

  renderLoadingState() {
    return html`
      <div class="scanning-state">
        <div class="scanning-spinner"></div>
        <h3>Loading Media Library</h3>
        <p>Processing existing media data...</p>
      </div>
    `;
  }

  startProgressiveScan() {
    this._isScanning = true;
    this._scanStartTime = Date.now();

    // Only clear progressive data if no existing data
    if (this._progressiveMediaData.length === 0) {
      this._progressiveMediaData = [];
      this._progressiveGroupingKeys.clear();
    }

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
    this._scanCompleted = false;
    this._scanInProgress = true;

    this.startProgressiveScan();
  }

  async handleScanComplete() {
    this.stopProgressiveScan();

    if (this._isProcessingData) {
      return;
    }

    this._progressiveMediaData = [];
    this._progressiveGroupingKeys.clear();
    this._mediaData = null;
    this._processedData = null;
    this._filteredDataCache = null;
    this._lastFilterParams = null;

    this._scanCompleted = true;
    this._scanInProgress = false;
    this._isProcessingData = true;

    try {
      if (this.sitePath) {
        const [org, repo] = this.sitePath.split('/').slice(1, 3);
        if (org && repo) {
          await new Promise((resolve) => {
            setTimeout(resolve, 500);
          });

          const response = await daFetch(`${DA_ORIGIN}/source/${org}/${repo}/.da/mediaindex/media.json`);
          if (response.ok) {
            const responseData = await response.json();
            const mediaData = responseData.data || responseData || [];

            if (mediaData && mediaData.length > 0) {
              // Store raw data for suggestions
              this._rawMediaData = mediaData;

              // Build usage index for O(1) lookups
              this._usageIndex = this.buildUsageIndex(mediaData);

              // Deduplicate the data using the same grouping logic
              const uniqueItems = [];
              const seenKeys = new Set();

              mediaData.forEach((item) => {
                const groupingKey = getGroupingKey(item.url);
                if (!seenKeys.has(groupingKey)) {
                  seenKeys.add(groupingKey);
                  uniqueItems.push(item);
                }
              });

              this._mediaData = uniqueItems;
              this._processedData = await processMediaData(uniqueItems);
              this._needsFilterRecalculation = true;
              this._needsFilterUpdate = true;

              this.updateFilters();

              this.requestUpdate();
            }
          }
        }
      }
    } catch (error) {
      // Error loading media.json - keep current state
    } finally {
      this._isProcessingData = false;
    }
  }

  handleProgressiveDataUpdate(e) {
    const { mediaItems } = e.detail;
    this.updateProgressiveData(mediaItems);
  }

  updateProgressiveData(mediaItems) {
    if (!mediaItems || mediaItems.length === 0) return;

    let hasUpdates = false;

    mediaItems.forEach((newItem) => {
      const groupingKey = getGroupingKey(newItem.url);
      const existingItem = this._progressiveMediaData.find(
        (item) => getGroupingKey(item.url) === groupingKey,
      );

      if (existingItem) {
        existingItem.usageCount = (existingItem.usageCount || 0) + 1;
        hasUpdates = true;
      }
    });

    const newUniqueItems = mediaItems.filter((newItem) => {
      const groupingKey = getGroupingKey(newItem.url);
      return !this._progressiveMediaData.some(
        (item) => getGroupingKey(item.url) === groupingKey,
      );
    }).map((item) => ({
      ...item,
      usageCount: 1,
    }));

    if (newUniqueItems.length > 0 || hasUpdates) {
      this._progressiveMediaData = [...this._progressiveMediaData, ...newUniqueItems];
      this._realTimeStats.media = this._progressiveMediaData.length;
    }

    this.requestUpdate();
  }

  parseColonSyntax(query) {
    if (!query) return null;

    const colonMatch = query.match(/^([a-zA-Z]+):(.*)$/);
    if (colonMatch) {
      const [, field, value] = colonMatch;
      return {
        field: field.toLowerCase(),
        value: value.trim().toLowerCase(),
        originalQuery: query,
      };
    }

    if (query.startsWith('/') || query.includes('/')) {
      return {
        field: 'folder',
        value: query.toLowerCase().trim(),
        originalQuery: query,
      };
    }

    return null;
  }

  buildUsageIndex(rawData) {
    const usageIndex = new Map();

    if (!rawData || rawData.length === 0) {
      return usageIndex;
    }

    rawData.forEach((item) => {
      if (!item.url) return;

      const groupingKey = getGroupingKey(item.url);

      if (!usageIndex.has(groupingKey)) {
        usageIndex.set(groupingKey, []);
      }

      usageIndex.get(groupingKey).push({
        doc: item.doc,
        alt: item.alt,
        type: item.type,
        ctx: item.ctx,
        firstUsedAt: item.firstUsedAt,
        lastUsedAt: item.lastUsedAt,
        hash: item.hash,
      });
    });

    return usageIndex;
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
