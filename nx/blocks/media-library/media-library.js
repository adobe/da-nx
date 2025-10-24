import { html, LitElement } from 'da-lit';
import getStyle from '../../utils/styles.js';
import { loadMediaSheet } from './utils/processing.js';
import { copyMediaToClipboard, validateSitePath, saveRecentSite } from './utils/utils.js';
import {
  processMediaData,
  applyFilter,
  filterBySearch,
  getGroupingKey,
  getDocumentFilteredItems,
  getFolderFilteredItems,
  parseColonSyntax,
  getFilterLabel,
  computeResultSummary,
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
import getSvg from '../../public/utils/svg.js';

const EL_NAME = 'nx-media-library';
const nx = `${new URL(import.meta.url).origin}/nx`;
const sl = await getStyle(`${nx}/public/sl/styles.css`);
const slComponents = await getStyle(`${nx}/public/sl/components.css`);
const topbarStyles = await getStyle(`${nx}/blocks/media-library/views/topbar/topbar.css`);
const styles = await getStyle(import.meta.url);

const SCAN_ICONS = [`${nx}/public/icons/S2_Icon_Refresh_20_N.svg`];

class NxMediaLibrary extends LitElement {
  static properties = {
    sitePath: { state: true },
    _mediaData: { state: true },
    _rawMediaData: { state: true },
    _usageIndex: { state: true },
    _error: { state: true },
    _searchQuery: { state: true },
    _selectedFilterType: { state: true },
    _currentView: { state: true },
    _progressiveMediaData: { state: true },
    _isScanning: { state: true },
    _scanProgress: { state: true },
    _resultSummary: { state: true },
    _isValidating: { state: true },
    _sitePathValid: { state: true },
    _validationError: { state: true },
    _validationSuggestion: { state: true },
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
    this._filteredDataCache = null;
    this._lastFilterParams = null;
    this._lastProcessedData = null;
    this._progressiveMediaData = [];
    this._progressiveGroupingKeys = new Set();
    this._progressiveLimit = 500;
    this._isScanning = false;
    this._scanProgress = { pages: 0, media: 0, duration: null, hasChanges: null };
    this._scanStartTime = null;
    this._scanCompleted = false;
    this._scanInProgress = false;
    this._isProcessingData = false;
    this._realTimeStats = { pages: 0, media: 0, elapsed: 0 };
    this._statsInterval = null;
    this._selectedFolder = null;
    this._resultSummary = '';
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, slComponents, topbarStyles, styles];
    getSvg({ parent: this.shadowRoot, paths: SCAN_ICONS });

    this._boundHandleAltTextUpdated = this.handleAltTextUpdated.bind(this);
    this._boundHandleMediaDataUpdated = this.handleMediaDataUpdated.bind(this);
    window.addEventListener('alt-text-updated', this._boundHandleAltTextUpdated);
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
    window.removeEventListener('mediaDataUpdated', this._boundHandleMediaDataUpdated);
  }

  shouldUpdate(changedProperties) {
    const dataProps = ['_mediaData', '_error', '_progressiveMediaData', '_isScanning'];
    const filterProps = ['_searchQuery', '_selectedFilterType'];
    const uiProps = ['_currentView', 'sitePath'];
    const scanProps = ['_scanProgress'];
    const validationProps = ['_isValidating', '_sitePathValid', '_validationError'];
    const hasDataChange = dataProps.some((prop) => changedProperties.has(prop));
    const hasFilterChange = filterProps.some((prop) => changedProperties.has(prop));
    const hasUIChange = uiProps.some((prop) => changedProperties.has(prop));
    const hasScanChange = scanProps.some((prop) => changedProperties.has(prop));
    const hasValidationChange = validationProps.some((prop) => changedProperties.has(prop));

    return hasDataChange || hasFilterChange || hasUIChange || hasScanChange || hasValidationChange;
  }

  willUpdate(changedProperties) {
    if (changedProperties.has('_mediaData') && this._mediaData) {
      this._needsFilterRecalculation = true;
      this._needsFilterUpdate = true;
    }

    if (changedProperties.has('_searchQuery')
        || changedProperties.has('_selectedFilterType')
    ) {
      this._needsFilterRecalculation = true;
    }

    if (changedProperties.has('_mediaData')
        || changedProperties.has('_searchQuery')
        || changedProperties.has('_selectedFilterType')
    ) {
      this._resultSummary = computeResultSummary(
        this._mediaData,
        this.filteredMediaData,
        this._searchQuery,
        this._selectedFilterType,
      );
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
      }
    }
    super.update(changedProperties);
  }

  updated(changedProperties) {
    if (changedProperties.has('sitePath') && this.sitePath) {
      this.initialize();
    }
  }

  get filteredMediaData() {
    if (!this._mediaData || this._mediaData.length === 0) {
      return [];
    }

    if (this._selectedFilterType && this._selectedFilterType.startsWith('document')
        && this._selectedFilterType !== 'documents' && this._processedData) {
      return getDocumentFilteredItems(
        this._processedData,
        this._mediaData,
        this.selectedDocument,
        this._selectedFilterType,
      );
    }

    const uniqueItems = [];
    const seenKeys = new Set();

    this._mediaData.forEach((item) => {
      const groupingKey = getGroupingKey(item.url);
      if (!seenKeys.has(groupingKey)) {
        seenKeys.add(groupingKey);

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

    let dataWithUsageCounts = uniqueItems;
    if (this._selectedFolder) {
      dataWithUsageCounts = getFolderFilteredItems(
        uniqueItems,
        this._selectedFolder,
        this._usageIndex,
      );
    }

    let finalData = dataWithUsageCounts;
    if (this._searchQuery && this._searchQuery.trim()) {
      finalData = filterBySearch(dataWithUsageCounts, this._searchQuery);
    }

    if (this._selectedFilterType && this._selectedFilterType !== 'all') {
      return applyFilter(
        finalData,
        this._selectedFilterType,
        this.selectedDocument,
      );
    }

    return finalData;
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
    if (!this.sitePath) return;

    this._isValidating = true;
    this._sitePathValid = false;
    this._error = null;
    this.requestUpdate();

    try {
      const validation = await validateSitePath(this.sitePath);

      this._isValidating = false;

      if (!validation.valid) {
        this._validationError = validation.error;
        this._validationSuggestion = validation.suggestion;
        this._sitePathValid = false;
        this._error = validation.error;
        this.requestUpdate();
        return;
      }

      this._sitePathValid = true;
      this._validationError = null;
      this._validationSuggestion = null;

      this.requestUpdate();

      saveRecentSite(this.sitePath);
      this.loadMediaData();
    } catch (error) {
      this._isValidating = false;
      this._validationError = error.message;
      this._sitePathValid = false;
      this._error = error.message;
      this.requestUpdate();
    }
  }

  buildDataStructures(mediaData) {
    const uniqueItemsMap = new Map();
    const usageIndex = new Map();

    mediaData.forEach((item) => {
      if (!item.url) return;

      const groupingKey = getGroupingKey(item.url);

      if (!uniqueItemsMap.has(groupingKey)) {
        uniqueItemsMap.set(groupingKey, { ...item, usageCount: 1 });
      } else {
        const existingItem = uniqueItemsMap.get(groupingKey);
        existingItem.usageCount += 1;
      }

      if (!usageIndex.has(groupingKey)) {
        usageIndex.set(groupingKey, []);
      }

      usageIndex.get(groupingKey).push({
        doc: item.doc,
        alt: item.alt,
        type: item.type,
        firstUsedAt: item.firstUsedAt,
        lastUsedAt: item.lastUsedAt,
        hash: item.hash,
      });
    });

    return {
      uniqueItems: Array.from(uniqueItemsMap.values()),
      usageIndex,
    };
  }

  async loadMediaData() {
    try {
      const mediaData = await loadMediaSheet(this.sitePath);

      if (mediaData && mediaData.length > 0) {
        this._rawMediaData = mediaData;

        const { uniqueItems, usageIndex } = this.buildDataStructures(mediaData);
        this._mediaData = uniqueItems;
        this._usageIndex = usageIndex;

        this._processedData = await processMediaData(mediaData);
        this._needsFilterRecalculation = true;

        this._filteredDataCache = null;
        this._lastFilterParams = null;
        this._lastProcessedData = null;
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[MAIN] Failed to load media data:', error);
    }
  }

  async handleMediaDataUpdated(e) {
    const { mediaData } = e.detail;

    if (mediaData && mediaData.length > 0) {
      this._rawMediaData = mediaData;

      const { uniqueItems, usageIndex } = this.buildDataStructures(mediaData);
      this._mediaData = uniqueItems;
      this._usageIndex = usageIndex;

      this._processedData = await processMediaData(mediaData);
      this._needsFilterRecalculation = true;
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
      this._selectedFilterType = 'documentTotal';
      this._needsFilterRecalculation = true;
      this._filteredDataCache = null;
      this._lastFilterParams = null;
      this.requestUpdate();
    }
  }

  handleFolderNavigation(path) {
    if (path) {
      this._selectedFolder = path;
      this._selectedFilterType = 'all';
      this._needsFilterRecalculation = true;
      this._filteredDataCache = null;
      this._lastFilterParams = null;
      this.requestUpdate();
    }
  }

  renderErrorState() {
    return html`
      <div class="error-state">
        <div class="error-content">
          <p>${this._validationError}</p>
          <a href="#" @click=${(e) => { e.preventDefault(); window.location.hash = ''; }}>
            Go back to site selection
          </a>
        </div>
      </div>
    `;
  }

  render() {
    if (!this.sitePath) {
      return html`<nx-media-onboard @site-selected=${this.handleSiteSelected}></nx-media-onboard>`;
    }

    if (this._isValidating) {
      return html`
        <div class="validation-state">
          <div class="validation-content">
            <div class="spinner"></div>
            <p>Initializing...</p>
          </div>
        </div>
      `;
    }

    if (!this._sitePathValid && this._validationError) {
      return this.renderErrorState();
    }

    return html`
      <div class="media-library">
        <div class="sidebar">
          <nx-media-sidebar
            .activeFilter=${this._selectedFilterType}
            .currentView=${this._currentView}
            .isScanning=${this._isScanning}
            .scanProgress=${this._scanProgress}
            @filter=${this.handleFilter}
            @viewChange=${this.handleViewChange}
          ></nx-media-sidebar>
        </div>

        <div class="top-bar">
          <nx-media-topbar
            .searchQuery=${this._searchQuery}
            .currentView=${this._currentView}
            .mediaData=${this._rawMediaData || this._mediaData}
            .resultSummary=${this._resultSummary}
            @search=${this.handleSearch}
            @clear-search=${this.handleClearSearch}
          ></nx-media-topbar>
        </div>

        <div class="content">
          ${this.renderCurrentView()}
        </div>

        <nx-modal-manager></nx-modal-manager>

        <nx-media-scan
          .sitePath=${this.sitePath}
          @scanStart=${this.handleScanStart}
          @scanProgress=${this.handleScanProgress}
          @scanComplete=${this.handleScanComplete}
          @scanError=${this.handleScanError}
          @progressiveDataUpdate=${this.handleProgressiveDataUpdate}
          @mediaDataUpdated=${this.handleMediaDataUpdated}
          style="display: none;"
        ></nx-media-scan>
      </div>
    `;
  }

  renderCurrentView() {
    const hasData = this._mediaData && this._mediaData.length > 0;
    const hasFilteredData = this.filteredMediaData && this.filteredMediaData.length > 0;
    const hasProgressiveData = this._progressiveMediaData && this._progressiveMediaData.length > 0;

    if (this._isScanning && !hasData && !hasProgressiveData) {
      return this.renderScanningState();
    }

    if (hasData && !hasFilteredData && !this._isScanning) {
      return this.renderEmptyState();
    }

    if (!hasData && !this._isScanning) {
      return this.renderEmptyState();
    }

    let displayData;
    if (this._isScanning && this._progressiveMediaData.length > 0) {
      displayData = this._progressiveMediaData;
    } else {
      displayData = this.filteredMediaData;
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
      const colonSyntax = parseColonSyntax(query);
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

  handleClearSearch() {
    this._searchQuery = '';
    this._selectedDocument = null;
    this._selectedFolder = null;
    this._selectedFilterType = 'all';
    this._needsFilterRecalculation = true;
    this._filteredDataCache = null;
    this._lastFilterParams = null;
    this.requestUpdate();
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
          isScanning: this._isScanning,
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
          message: 'Failed to copy Resource.',
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
          isScanning: this._isScanning,
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

  renderEmptyState() {
    const filterLabel = getFilterLabel(this._selectedFilterType, 0);
    let message = `No ${filterLabel} found`;

    if (this._searchQuery) {
      const colonSyntax = parseColonSyntax(this._searchQuery);

      if (colonSyntax) {
        const { field, value } = colonSyntax;

        if (field === 'folder') {
          const folderPath = value || '/';
          message = `No ${filterLabel} in ${folderPath}`;
        } else if (field === 'doc') {
          const docPath = value.replace(/\.html$/, '');
          message = `No ${filterLabel} in ${docPath}`;
        } else {
          message = `No ${filterLabel} matching "${this._searchQuery}"`;
        }
      } else {
        message = `No ${filterLabel} matching "${this._searchQuery}"`;
      }
    }

    return html`
      <div class="empty-state">
        <h3>${message}</h3>
        <p>Try a different search or type selection</p>
      </div>
    `;
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
    this._scanCompleted = false;
    this._scanInProgress = true;
    this._isScanning = true;
    this._scanProgress = { pages: 0, media: 0, duration: null, hasChanges: null };
    this._scanStartTime = Date.now();

    this.startProgressiveScan();
  }

  handleScanProgress(e) {
    const { progress } = e.detail;
    this._scanProgress = {
      pages: progress.pages || 0,
      media: progress.media || 0,
      duration: progress.duration || null,
      hasChanges: progress.hasChanges !== undefined ? progress.hasChanges : null,
    };
  }

  handleScanError(e) {
    this._isScanning = false;
    console.error('Scan error:', e.detail.error); // eslint-disable-line no-console
  }

  async handleScanComplete() {
    this.stopProgressiveScan();

    if (this._isProcessingData) {
      return;
    }

    const previousDataLength = this._mediaData?.length || 0;

    this._progressiveMediaData = [];
    this._progressiveGroupingKeys.clear();

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

            const duration = ((Date.now() - this._scanStartTime) / 1000).toFixed(1);

            if (mediaData && mediaData.length > 0) {
              const { uniqueItems, usageIndex } = this.buildDataStructures(mediaData);
              const newDataLength = uniqueItems.length;
              const hasChanges = newDataLength !== previousDataLength;

              if (hasChanges) {
                this._rawMediaData = mediaData;
                this._usageIndex = usageIndex;
                this._mediaData = uniqueItems;
                this._processedData = await processMediaData(mediaData);
                this._needsFilterRecalculation = true;
                this._filteredDataCache = null;
                this._lastFilterParams = null;
              }

              this._scanProgress = {
                ...this._scanProgress,
                media: newDataLength,
                duration: `${duration}s`,
                hasChanges,
              };

              this._isScanning = false;
              this.requestUpdate('_scanProgress');
            } else {
              this._scanProgress = {
                ...this._scanProgress,
                media: 0,
                duration: `${duration}s`,
                hasChanges: false,
              };
              this._isScanning = false;
              this.requestUpdate('_scanProgress');
            }
          }
        }
      }
    } catch (error) {
      console.error('[MEDIA-LIB] Error in handleScanComplete:', error); // eslint-disable-line no-console
    } finally {
      this._isProcessingData = false;
      this._isScanning = false;
    }
  }

  handleProgressiveDataUpdate(e) {
    const { mediaItems } = e.detail;
    this._realTimeStats.media += mediaItems.length;
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
  document.title = 'Media Library';
  el.innerHTML = '';
  setupMediaLibrary(el);
  window.addEventListener('hashchange', (e) => {
    setupMediaLibrary(el, e);
  });
}
