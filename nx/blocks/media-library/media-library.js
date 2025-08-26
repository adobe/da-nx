import { html, LitElement } from 'da-lit';
import getStyle from '../../utils/styles.js';
import getSvg from '../../public/utils/svg.js';
import runScan, { checkMediaSheetModified } from './utils/processing.js';
import { copyMediaToClipboard } from './utils/utils.js';
import { loadMediaSheet } from './utils/processing.js';
import { getDocumentMediaBreakdown, aggregateMediaData } from './utils/processing.js';
import { applyFilter, processMediaData, filterBySearch } from './utils/filters.js';
import '../../public/sl/components.js';
import './views/topbar/topbar.js';
import './views/sidebar/sidebar.js';
import './views/grid/grid.js';
import './views/folder/folder.js';
import './views/list/list.js';
import './views/mediainfo/mediainfo.js';

const EL_NAME = 'nx-media-library';
const nx = `${new URL(import.meta.url).origin}/nx`;
const sl = await getStyle(`${nx}/public/sl/styles.css`);
const slComponents = await getStyle(`${nx}/public/sl/components.css`);
const styles = await getStyle(import.meta.url);

// Configuration constants
const CONFIG = {
  POLLING_INTERVAL: 60000, // 1 minute
  MESSAGE_DURATION: 3000, // 3 seconds
  SLOW_UPDATE_THRESHOLD: 16, // 1 frame at 60fps
};

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
    _folderFilterPaths: { state: true },
    _filterCounts: { state: true },

    // GROUP 3: UI State Properties
    _currentView: { state: true },
    _folderOpen: { state: true },
    _infoModal: { state: true },
    _message: { state: true },

    // GROUP 4: Scan Status Properties
    scanProgress: { state: true },
    _isScanning: { state: true },
  };

  constructor() {
    super();
    this._currentView = 'grid';
    this._folderOpen = false;
    this._infoModal = null;
    this._selectedFilterType = 'all';
    this._folderFilterPaths = [];
    this._message = null;
    this._pollingStarted = false;
    this._needsFilterRecalculation = true;
    this._needsFilterUpdate = false;
    this._updateStartTime = 0;

    // Single-pass processing results
    this._processedData = null;
    this._filteredMediaData = null;
    this._searchSuggestions = [];

    // Non-reactive scan properties - don't trigger main component re-renders
    this.scanProgress = { pages: 0, media: 0, duration: null, hasChanges: null };
    this._isScanning = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, slComponents, styles];

    getSvg({ parent: this.shadowRoot, paths: ICONS });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._pollingInterval) {
      clearInterval(this._pollingInterval);
    }
    if (this._messageTimeout) {
      clearTimeout(this._messageTimeout);
    }
  }

  // ============================================================================
  // LIFECYCLE OPTIMIZATION
  // ============================================================================

  shouldUpdate(changedProperties) {
    // Performance monitoring
    this._updateStartTime = performance.now();

    // Only update for meaningful property changes
    const dataProps = ['_mediaData', '_error'];
    const filterProps = ['_searchQuery', '_selectedFilterType', '_folderFilterPaths', '_filterCounts'];
    const uiProps = ['_currentView', '_folderOpen', '_infoModal', '_message'];

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
        || changedProperties.has('_folderFilterPaths')) {
      this._needsFilterRecalculation = true;
    }
  }

  update(changedProperties) {
    // Handle sitePath changes for initialization
    if (changedProperties.has('sitePath') && this.sitePath) {
      this.initialize();
    }

    super.update(changedProperties);
  }

  updated(changedProperties) {
    // Performance monitoring
    const updateTime = performance.now() - this._updateStartTime;
    if (updateTime > CONFIG.SLOW_UPDATE_THRESHOLD) { // Longer than one frame
      console.warn(`Slow media-library update: ${updateTime.toFixed(2)}ms`, Array.from(changedProperties.keys()));
    }

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
    this.calculateFilteredMediaData();
    return this._filteredMediaData || [];
  }

  get selectedDocument() {
    if (this._folderFilterPaths && this._folderFilterPaths.length > 0) {
      return this._folderFilterPaths[0];
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

  // ============================================================================
  // DATA PROCESSING METHODS
  // ============================================================================

  calculateFilteredMediaData() {
    if (!this._mediaData) {
      this._filteredMediaData = [];
      return;
    }

    let filtered = aggregateMediaData(this._mediaData);

    // Apply filter using configuration
    filtered = applyFilter(filtered, this._selectedFilterType);

    if (this._folderFilterPaths.length > 0) {
      const hasMatchingPath = (item) => {
        // Skip folder filtering for items with no document path
        if (!item.doc || !item.doc.trim()) {
          return true;
        }

        const matches = this._folderFilterPaths.some(
          (path) => {
            // Normalize paths for comparison
            const itemPath = item.doc.replace(/^\//, '');
            const filterPath = path.replace(/^\//, '');
            return itemPath.startsWith(filterPath);
          },
        );
        return matches;
      };

      filtered = filtered.filter(hasMatchingPath);
    }

    // Apply search filter using consolidated logic
    if (this._searchQuery && this._searchQuery.trim()) {
      filtered = filterBySearch(filtered, this._searchQuery);
    }

    filtered.sort((a, b) => {
      // Sort by recently used first, then alphabetical
      const lastUsedA = new Date(a.lastUsedAt || 0);
      const lastUsedB = new Date(b.lastUsedAt || 0);
      const timeDiff = lastUsedB - lastUsedA;

      if (timeDiff !== 0) return timeDiff;

      // Fallback to alphabetical
      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });

    this._filteredMediaData = filtered;
  }

  // ============================================================================
  // INITIALIZATION & DATA LOADING
  // ============================================================================

  startPolling() {
    this._pollingInterval = setInterval(async () => {
      if (this.sitePath) {
        const [org, repo] = this.sitePath.split('/').slice(1, 3);
        if (org && repo) {
          // Check if media.json has been modified before loading
          const { hasChanged } = await checkMediaSheetModified(org, repo);

          if (hasChanged) {
            await this.loadMediaData(org, repo);
          }
        }
      }
    }, CONFIG.POLLING_INTERVAL);
  }

  async initialize() {
    const [org, repo] = this.sitePath?.split('/').slice(1, 3) || [];

    if (!(org && repo)) {
      return;
    }

    await this.loadMediaData(org, repo);
    this.startBackgroundScan(org, repo);
    if (!this._pollingStarted) {
      this.startPolling();
      this._pollingStarted = true;
    }
  }

  async startBackgroundScan(org, repo) {
    this._isScanning = true;

    // Reset scan progress for new scan
    this.scanProgress = { pages: 0, media: 0, duration: null, hasChanges: null };

    // Update topbar directly when scan starts
    const topbarElement = this.shadowRoot.querySelector('nx-media-topbar');
    if (topbarElement) {
      topbarElement.isScanning = this._isScanning;
      topbarElement.scanProgress = this.scanProgress;
      topbarElement.requestUpdate();
    }

    try {
      const result = await runScan(this.sitePath, this.updateScanProgress.bind(this));

      // Update scan results to show to user
      this.scanProgress.duration = result.duration;
      this.scanProgress.hasChanges = result.hasChanges;

      // Only reload data if the scan found actual changes
      if (result.hasChanges) {
        await this.loadMediaData(org, repo);
        
        // Reset polling cycle after loading data to prevent duplicate calls
        if (this._pollingInterval) {
          clearInterval(this._pollingInterval);
          this.startPolling();
        }
      }
    } catch (error) {
      if (error.message && error.message.includes('Scan already in progress')) {
        // Scan already in progress, ignore
      } else {
        console.error('Scan failed:', error); // eslint-disable-line no-console
      }
    } finally {
      this._isScanning = false;
      // Update topbar directly with final scan results
      const finalTopbar = this.shadowRoot.querySelector('nx-media-topbar');
      if (finalTopbar) {
        finalTopbar.isScanning = this._isScanning;
        finalTopbar.scanProgress = this.scanProgress;
        finalTopbar.requestUpdate();
      }
    }
  }

  updateScanProgress(type, totalScanned) {
    if (type === 'page') {
      this.scanProgress = { ...this.scanProgress, pages: totalScanned };
    }
    if (type === 'media') {
      this.scanProgress = { ...this.scanProgress, media: totalScanned };
    }

    // Update topbar directly without triggering main component re-render
    const topbar = this.shadowRoot.querySelector('nx-media-topbar');
    if (topbar) {
      topbar.isScanning = this._isScanning;
      topbar.scanProgress = this.scanProgress;
      topbar.requestUpdate();
    }
  }

  async loadMediaData(org, repo) {
    try {
      const mediaData = await loadMediaSheet(org, repo);

      if (mediaData === null) {
        // Media.json unchanged, keeping existing data
      } else if (mediaData) {
        this._mediaData = mediaData;
        this._needsFilterRecalculation = true;
        this._needsFilterUpdate = true;
      }
    } catch (error) {
      console.error('Failed to load media data:', error); // eslint-disable-line no-console
    }
  }

  updateFilters() {
    if (!this._processedData) return;
    // Use pre-calculated filter counts from single-pass processing
    this._filterCounts = this._processedData.filterCounts;
  }

  // ============================================================================
  // RENDERING METHODS
  // ============================================================================

  render() {
    return html`
      <div class="media-library">
        <nx-media-topbar
          .searchQuery=${this._searchQuery}
          .currentView=${this._currentView}
          .folderFilterPaths=${this._folderFilterPaths}
          .searchSuggestions=${this._processedData?.searchSuggestions || []}
          .isScanning=${this._isScanning}
          .scanProgress=${this.scanProgress}
          @search=${this.handleSearch}
          @viewChange=${this.handleViewChange}
          @openFolderDialog=${this.handleOpenFolderDialog}
          @clearFolderFilter=${this.handleClearFolderFilter}
        ></nx-media-topbar>

        <div class="content">
          ${this.renderCurrentView()}
        </div>

        <nx-media-sidebar
          .mediaData=${this._mediaData}
          .activeFilter=${this._selectedFilterType}
          .selectedDocument=${this.selectedDocument}
          .documentMediaBreakdown=${this.documentMediaBreakdown}
          .folderFilterPaths=${this._folderFilterPaths}
          .filterCounts=${this._processedData?.filterCounts || {}}
          @filter=${this.handleFilter}
          @clearDocumentFilter=${this.handleClearDocumentFilter}
          @documentFilter=${this.handleDocumentFilter}
          @clearFolderFilter=${this.handleClearFolderFilter}
        ></nx-media-sidebar>

        ${this._folderOpen ? html`
          <nx-media-folder-dialog
            .isOpen=${this._folderOpen}
            .selectedPaths=${this._folderFilterPaths}
            .mediaData=${this._mediaData}
            @close=${this.handleFolderDialogClose}
            @apply=${this.handleFolderFilterApply}
            @filterChange=${this.handleFolderFilterChange}
          ></nx-media-folder-dialog>
        ` : ''}

        ${this._infoModal ? html`
          <nx-media-info
            .media=${this._infoModal}
            .isOpen=${true}
            .usageData=${this._processedData?.usageMap?.get(this._infoModal.url)?.usageDetails || []}
            .org=${this.org}
            .repo=${this.repo}
            @close=${this.handleInfoModalClose}
            @altTextUpdated=${this.handleAltTextUpdated}
          ></nx-media-info>
        ` : ''}

        ${this._message ? html`
          <sl-alert
            variant=${this._message.type || 'primary'}
            closable
            .open=${this._message.open}
            @sl-hide=${this.handleToastClose}
          >
            <sl-icon slot="icon" name=${this._message.icon || 'info-circle'}></sl-icon>
            <strong>${this._message.heading || 'Info'}</strong><br>
            ${this._message.message}
          </sl-alert>
        ` : ''}
      </div>
    `;
  }

  renderCurrentView() {
    // Prevent components from rendering before data loads
    if (!this._mediaData) {
      return html``;
    }

    switch (this._currentView) {
      case 'list':
        return html`
          <nx-media-list
            .mediaData=${this.filteredMediaData}
            .searchQuery=${this._searchQuery}
            @mediaClick=${this.handleMediaClick}
            @mediaInfo=${this.handleMediaInfo}
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
            @mediaInfo=${this.handleMediaInfo}
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

  // NEW METHOD
  handleDocNavigation(path) {
    // Set folder filter to this path
    this._folderFilterPaths = [path];

    // Only notify folder dialog if it's already open
    if (this._folderOpen) {
      this.dispatchEvent(new CustomEvent('navigateToPath', {
        detail: { path },
        bubbles: true,
        composed: true,
      }));
    }
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

    try {
      const result = await copyMediaToClipboard(media);
      this.setMessage({ ...result, open: true });
    } catch (error) {
      this.setMessage({ heading: 'Error', message: 'Failed to copy to clipboard.', open: true });
    }
  }

  handleMediaInfo(e) {
    const { media } = e.detail;
    this._infoModal = media;
  }

  handleMediaUsage(e) {
    const { media } = e.detail;
    this._infoModal = media;
  }

  handleInfoModalClose() {
    this._infoModal = null;
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
  // EVENT HANDLERS - FOLDER & DOCUMENT MANAGEMENT
  // ============================================================================

  handleOpenFolderDialog() {
    this._folderOpen = true;
  }

  handleFolderFilterApply(e) {
    const { paths } = e.detail;
    this._folderFilterPaths = paths;
    this._needsFilterRecalculation = true;
    this._folderOpen = false;
    this.clearSearchQuery();
  }

  handleFolderDialogClose() {
    this._folderOpen = false;
  }

  handleFolderFilterChange(e) {
    const { paths } = e.detail;
    this._folderFilterPaths = paths;
    this._needsFilterRecalculation = true;
    this.clearSearchQuery();
  }

  handleClearFolderFilter() {
    this._folderFilterPaths = [];
    this._needsFilterRecalculation = true;
    this.clearSearchQuery();
    const folderDialog = this.shadowRoot.querySelector('nx-media-folder-dialog');
    if (folderDialog) {
      folderDialog.selectedPaths = new Set();
    }
  }

  handleClearDocumentFilter() {
    this._folderFilterPaths = [];
    this._needsFilterRecalculation = true;
    this.clearSearchQuery();
    const folderDialog = this.shadowRoot.querySelector('nx-media-folder-dialog');
    if (folderDialog) {
      folderDialog.selectedPaths = new Set();
    }
  }

  handleDocumentFilter(e) {
    const { type } = e.detail;
    this._selectedFilterType = type;
    this._needsFilterRecalculation = true;
    this.clearSearchQuery();
  }

  // ============================================================================
  // EVENT HANDLERS - SCAN & STATUS MANAGEMENT
  // ============================================================================

  handleClearScanStatus() {
    this.scanProgress = { pages: 0, media: 0, duration: null, hasChanges: null };
    // Update topbar directly
    const clearTopbar = this.shadowRoot.querySelector('nx-media-topbar');
    if (clearTopbar) {
      clearTopbar.isScanning = this._isScanning;
      clearTopbar.scanProgress = this.scanProgress;
      clearTopbar.requestUpdate();
    }
  }

  setMessage(message, duration = CONFIG.MESSAGE_DURATION) {
    this._message = message;

    if (this._messageTimeout) {
      clearTimeout(this._messageTimeout);
    }

    this._messageTimeout = setTimeout(() => {
      this._message = null;
      this._messageTimeout = null;
    }, duration);
  }

  handleToastClose() {
    this._message = null;
    if (this._messageTimeout) {
      clearTimeout(this._messageTimeout);
      this._messageTimeout = null;
    }
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
