import { html, LitElement } from 'da-lit';
import getStyle from '../../utils/styles.js';
import { loadMediaSheet, buildDataStructures } from './utils/processing.js';
import {
  copyMediaToClipboard,
  validateSitePath,
  saveRecentSite,
  getBasePath,
  resolveAbsolutePath,
  ensureAuthenticated,
  sortMediaData,
} from './utils/utils.js';
import {
  processMediaData,
  getGroupingKey,
  parseColonSyntax,
  getFilterLabel,
  computeResultSummary,
  createMediaFilterPipeline,
} from './utils/filters.js';
import { loadPinnedFolders, savePinnedFolders } from './utils/pin-folders.js';
import { getAppState, updateAppState, subscribeToAppState, FILTER_TYPES } from './utils/state.js';
import { initializeScanService, cleanupScanService } from './utils/scan-service.js';
import '../../public/sl/components.js';
import './views/topbar/topbar.js';
import './views/sidebar/sidebar.js';
import './views/grid/grid.js';
import './views/mediainfo/mediainfo.js';
import './views/onboard/onboard.js';

const EL_NAME = 'nx-media-library';
const nx = `${new URL(import.meta.url).origin}/nx`;
const sl = await getStyle(`${nx}/public/sl/styles.css`);
const slComponents = await getStyle(`${nx}/public/sl/components.css`);
const topbarStyles = await getStyle(`${nx}/blocks/media-library/views/topbar/topbar.css`);
const styles = await getStyle(import.meta.url);

class NxMediaLibrary extends LitElement {
  static properties = {
    sitePath: { state: true },
    _appState: { state: true },
  };

  constructor() {
    super();
    this._appState = getAppState();
    this._filteredDataCache = null;
    this._unsubscribe = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, slComponents, topbarStyles, styles];
    window.addEventListener('show-notification', this.handleShowNotification);
    window.addEventListener('scanStart', this.handleScanStart);
    window.addEventListener('scanProgress', this.handleScanProgress);
    window.addEventListener('scanComplete', this.handleScanComplete);
    window.addEventListener('scanError', this.handleScanError);
    window.addEventListener('progressiveDataUpdate', this.handleProgressiveDataUpdate);
    window.addEventListener('mediaDataUpdated', this.handleMediaDataUpdated);

    this._unsubscribe = subscribeToAppState((state) => {
      this._appState = state;
      this.requestUpdate();
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._messageTimeout) {
      clearTimeout(this._messageTimeout);
    }
    if (this._notificationTimeout) {
      clearTimeout(this._notificationTimeout);
    }
    window.removeEventListener('show-notification', this.handleShowNotification);
    window.removeEventListener('scanStart', this.handleScanStart);
    window.removeEventListener('scanProgress', this.handleScanProgress);
    window.removeEventListener('scanComplete', this.handleScanComplete);
    window.removeEventListener('scanError', this.handleScanError);
    window.removeEventListener('progressiveDataUpdate', this.handleProgressiveDataUpdate);
    window.removeEventListener('mediaDataUpdated', this.handleMediaDataUpdated);

    if (this._unsubscribe) {
      this._unsubscribe();
    }
    cleanupScanService();
  }

  willUpdate(changedProperties) {
    if (changedProperties.has('_appState')) {
      const oldState = changedProperties.get('_appState') || {};
      const newState = this._appState;

      if (oldState.searchQuery !== newState.searchQuery
          || oldState.selectedFilterType !== newState.selectedFilterType
          || oldState.selectedFolder !== newState.selectedFolder
          || oldState.selectedDocument !== newState.selectedDocument
          || oldState.mediaData !== newState.mediaData
          || oldState.rawMediaData !== newState.rawMediaData
          || oldState.processedData !== newState.processedData
      ) {
        this._filteredDataCache = null;

        const resultSummary = computeResultSummary(
          newState.mediaData,
          this.filteredMediaData,
          newState.searchQuery,
          newState.selectedFilterType,
        );

        if (resultSummary !== newState.resultSummary) {
          updateAppState({ resultSummary });
        }
      }
    }
  }

  update(changedProperties) {
    if (changedProperties.has('sitePath')) {
      if (this.sitePath) {
        updateAppState({
          mediaData: [],
          processedData: null,
        });
        this.resetSearchState();
      }
    }
    super.update(changedProperties);
  }

  updated(changedProperties) {
    if (changedProperties.has('sitePath') && this.sitePath) {
      this.initialize();
    }
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

  get filteredMediaData() {
    if (this._filteredDataCache !== null) {
      return this._filteredDataCache;
    }

    if (!this._appState.mediaData || this._appState.mediaData.length === 0) {
      this._filteredDataCache = [];
      return this._filteredDataCache;
    }

    this._filteredDataCache = createMediaFilterPipeline(
      this._appState.rawMediaData || this._appState.mediaData,
      {
        searchQuery: this._appState.searchQuery,
        selectedDocument: this._appState.selectedDocument,
        selectedFolder: this._appState.selectedFolder,
        selectedFilterType: this._appState.selectedFilterType,
        usageIndex: this._appState.usageIndex,
        processedData: this._appState.processedData,
      },
    );

    return this._filteredDataCache;
  }

  get resultSummary() {
    return computeResultSummary(
      this._appState.mediaData,
      this.filteredMediaData,
      this._appState.searchQuery,
      this._appState.selectedFilterType,
    );
  }

  mergeDataForDisplay(existingData, newItems) {
    if (!newItems || newItems.length === 0) return existingData;

    const updatedData = [...existingData];
    const seenKeys = new Set(
      existingData.map((item) => getGroupingKey(item.url)),
    );

    newItems.forEach((newItem) => {
      const groupingKey = getGroupingKey(newItem.url);
      const existingIndex = updatedData.findIndex(
        (item) => getGroupingKey(item.url) === groupingKey,
      );

      if (existingIndex !== -1) {
        // Update existing item with new timestamp but keep original usageCount
        updatedData[existingIndex] = {
          ...updatedData[existingIndex],
          ...newItem,
          usageCount: updatedData[existingIndex].usageCount,
        };
      } else if (!seenKeys.has(groupingKey)) {
        // Add new item
        updatedData.push({ ...newItem, usageCount: 1 });
        seenKeys.add(groupingKey);
      }
    });

    return updatedData;
  }

  async initialize() {
    if (!this.sitePath) return;

    updateAppState({
      sitePath: this.sitePath,
      org: this.org,
      repo: this.repo,
      isValidating: true,
      sitePathValid: false,
      validationError: null,
    });

    try {
      const isAuthenticated = await ensureAuthenticated();
      if (!isAuthenticated) return;

      const validation = await validateSitePath(this.sitePath);

      updateAppState({ isValidating: false });

      if (!validation.valid) {
        updateAppState({
          validationError: validation.error,
          validationSuggestion: validation.suggestion,
          sitePathValid: false,
        });
        return;
      }

      updateAppState({
        sitePathValid: true,
        validationError: null,
        validationSuggestion: null,
      });

      saveRecentSite(this.sitePath);
      this.loadMediaData();
      initializeScanService(this.sitePath);
    } catch (error) {
      updateAppState({
        isValidating: false,
        validationError: error.message,
        sitePathValid: false,
      });
    }
  }

  async loadMediaData() {
    try {
      const isAuthenticated = await ensureAuthenticated();
      if (!isAuthenticated) return;

      const mediaData = await loadMediaSheet(this.sitePath);
      await this.setMediaData(mediaData);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[MEDIA-LIB:loadMediaData]', error);
      updateAppState({
        validationError: 'Failed to load media data. Please ensure you are signed in.',
        sitePathValid: false,
      });
    }
  }

  async setMediaData(rawData) {
    if (!rawData || rawData.length === 0) return;

    const basePath = getBasePath();
    const filteredMediaData = basePath
      ? rawData.filter((item) => !item.doc || item.doc === '' || item.doc.startsWith(basePath))
      : rawData;

    const { uniqueItems, usageIndex, folderPaths } = buildDataStructures(filteredMediaData);
    const processedData = await processMediaData(filteredMediaData);

    updateAppState({
      rawMediaData: filteredMediaData,
      mediaData: uniqueItems,
      usageIndex,
      folderPathsCache: folderPaths,
      processedData,
    });

    this._filteredDataCache = null;
  }

  render() {
    if (!this.sitePath) {
      return html`<nx-media-onboard @site-selected=${this.handleSiteSelected}></nx-media-onboard>`;
    }

    if (this._appState.isValidating) {
      return html`
        <div class="validation-state">
          <div class="validation-content">
            <div class="spinner"></div>
            <p>Initializing...</p>
          </div>
        </div>
      `;
    }

    if (!this._appState.sitePathValid && this._appState.validationError) {
      return this.renderErrorState();
    }

    return html`
      <div class="media-library">
        <div class="sidebar">
          <nx-media-sidebar
            @filter=${this.handleFilter}
          ></nx-media-sidebar>
        </div>

        <div class="top-bar">
          <nx-media-topbar
            @search=${this.handleSearch}
            @clear-search=${this.handleClearSearch}
            @pin-search=${this.handlePinFolder}
          ></nx-media-topbar>
        </div>

        <div class="content">
          ${this.renderCurrentView()}
        </div>

        <nx-media-info @altTextUpdated=${this.handleAltTextUpdated}></nx-media-info>

        ${this._appState.notification ? html`
          <div class="da-notification-status">
            <div class="toast-notification ${this._appState.notification.type || 'success'}">
              <p class="da-notification-status-title">${this._appState.notification.heading || 'Info'}</p>
              <p class="da-notification-status-description">${this._appState.notification.message}</p>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  renderCurrentView() {
    const hasData = this._appState.mediaData?.length > 0;
    const filteredData = this.filteredMediaData;
    const hasFilteredData = filteredData?.length > 0;
    const hasProgressiveData = this._appState.progressiveMediaData?.length > 0;

    if (this._appState.isScanning && !hasData && !hasProgressiveData) {
      return this.renderScanningState();
    }

    if (!hasData && !this._appState.isScanning) {
      return this.renderEmptyState();
    }

    if (hasData && !hasFilteredData && !this._appState.isScanning) {
      return this.renderEmptyState();
    }

    let displayData = filteredData;
    if (this._appState.isScanning && hasProgressiveData) {
      const mergedData = this.mergeDataForDisplay(
        filteredData,
        this._appState.progressiveMediaData,
      );
      displayData = sortMediaData(mergedData);
    }

    return html`
      <nx-media-grid
        .mediaData=${displayData}
        @mediaClick=${this.handleMediaClick}
        @mediaCopy=${this.handleMediaCopy}
      ></nx-media-grid>
    `;
  }

  renderErrorState() {
    return html`
      <div class="error-state">
        <div class="error-content">
          <p>${this._appState.validationError}</p>
        </div>
      </div>
    `;
  }

  renderScanningState() {
    return html`
      <div class="scanning-state">
        <div class="scanning-spinner"></div>
        <h3>Discovering Media</h3>
      </div>
    `;
  }

  renderEmptyState() {
    const filterLabel = getFilterLabel(this._appState.selectedFilterType, 0);
    let message = `No ${filterLabel} found`;

    if (this._appState.searchQuery) {
      const colonSyntax = parseColonSyntax(this._appState.searchQuery);

      if (colonSyntax) {
        const { field, value } = colonSyntax;

        if (field === 'folder') {
          const folderPath = value || '/';
          message = `No ${filterLabel} in ${folderPath}`;
        } else if (field === 'doc') {
          const docPath = value.replace(/\.html$/, '');
          message = `No ${filterLabel} in ${docPath}`;
        } else {
          message = `No ${filterLabel} matching "${this._appState.searchQuery}"`;
        }
      } else {
        message = `No ${filterLabel} matching "${this._appState.searchQuery}"`;
      }
    }

    return html`
      <div class="empty-state">
        <h3>${message}</h3>
        <p>Try a different search or type selection</p>
      </div>
    `;
  }

  handleSiteSelected(e) {
    const { sitePath } = e.detail;

    window.location.hash = sitePath;
  }

  handleDocNavigation(path) {
    if (path) {
      updateAppState({
        selectedDocument: resolveAbsolutePath(path),
        selectedFilterType: FILTER_TYPES.DOCUMENT_TOTAL,
      });
    }
  }

  handleFolderNavigation(path) {
    if (path) {
      updateAppState({
        selectedFolder: resolveAbsolutePath(path, true),
        selectedFilterType: FILTER_TYPES.ALL,
      });
    }
  }

  handlePinFolder(e) {
    const { folder } = e.detail || {};
    if (!folder) return;

    const pinnedFolders = loadPinnedFolders(this.org, this.repo);

    const fullPath = `/${this.org}/${this.repo}${folder}`;
    const alreadyPinned = pinnedFolders.some((pf) => pf.path === fullPath);

    if (alreadyPinned) {
      this.showNotification('Already Pinned!', `Folder :${folder} is already pinned`, 'danger');
      return;
    }

    const pinnedFolder = { path: fullPath };

    const updatedPinnedFolders = [...pinnedFolders, pinnedFolder];
    savePinnedFolders(updatedPinnedFolders, this.org, this.repo);

    this.showNotification('Folder Pinned', `Folder :${folder} pinned`);
  }

  handleSearch(e) {
    const { query, type, path } = e.detail;

    if (!query || !query.trim()) {
      updateAppState({
        searchQuery: '',
        selectedDocument: null,
        selectedFolder: null,
        selectedFilterType: FILTER_TYPES.ALL,
      });
      return;
    }

    let searchType = type;
    let searchPath = path;

    if (!searchType || !searchPath) {
      const colonSyntax = parseColonSyntax(query);
      if (colonSyntax) {
        searchType = colonSyntax.field;
        searchPath = colonSyntax.value;
      } else if (query.startsWith('/')) {
        searchType = 'folder';
        searchPath = query;
      }
    }

    if (searchType === 'doc' && searchPath) {
      updateAppState({ searchQuery: '', selectedFolder: null });
      this.handleDocNavigation(searchPath);
    } else if (searchType === 'folder' && searchPath !== undefined) {
      updateAppState({ searchQuery: '', selectedDocument: null });
      this.handleFolderNavigation(searchPath);
    } else {
      updateAppState({
        searchQuery: query,
        selectedFolder: null,
        selectedDocument: null,
      });
    }
  }

  handleClearSearch() {
    this.resetSearchState();
  }

  handleFilter(e) {
    updateAppState({ selectedFilterType: e.detail.type });
  }

  resetSearchState() {
    updateAppState({
      searchQuery: '',
      selectedFilterType: FILTER_TYPES.ALL,
      selectedFolder: null,
      selectedDocument: null,
    });
  }

  async handleMediaClick(e) {
    const { media } = e.detail;
    if (!media) return;

    const groupingKey = getGroupingKey(media.url);
    const usageData = this._appState.usageIndex?.get(groupingKey) || [];

    const mediaInfo = this.shadowRoot.querySelector('nx-media-info');
    mediaInfo?.show({
      media,
      usageData,
      org: this.org,
      repo: this.repo,
      isScanning: this._appState.isScanning,
    });
  }

  async handleMediaCopy(e) {
    const { media } = e.detail;
    if (!media) return;

    try {
      const result = await copyMediaToClipboard(media);
      const isError = result.heading === 'Error';
      this.showNotification(result.heading, result.message, isError ? 'danger' : 'success');
    } catch (error) {
      this.showNotification('Error', 'Failed to copy Resource.', 'danger');
    }
  }

  handleAltTextUpdated(e) {
    const { media } = e.detail;

    if (this._appState.mediaData) {
      updateAppState({
        mediaData: this._appState.mediaData.map((item) => (
          item.url === media.url ? { ...item, ...media } : item)),
      });
    }
  }

  handleScanStart = async () => {
    updateAppState({
      isScanning: true,
      scanProgress: this.createScanProgress(),
      scanStartTime: Date.now(),
      progressiveMediaData: [],
    });
  };

  handleScanProgress = (e) => {
    const { progress } = e.detail;
    updateAppState({
      scanProgress: this.createScanProgress(
        progress.pages || 0,
        progress.mediaFiles || 0,
        progress.mediaReferences || 0,
        progress.duration,
        progress.hasChanges !== undefined ? progress.hasChanges : null,
      ),
    });
  };

  handleScanComplete = async (e) => {
    if (this._isProcessingData) {
      return;
    }

    updateAppState({ progressiveMediaData: [] });
    this._isProcessingData = true;

    try {
      if (this.sitePath) {
        // Wait for backend to finish writing media.json after scan completes
        await new Promise((resolve) => {
          setTimeout(resolve, 500);
        });

        const mediaData = await loadMediaSheet(this.sitePath);

        if (mediaData && mediaData.length > 0) {
          const duration = ((Date.now() - this._appState.scanStartTime) / 1000).toFixed(1);
          const scanResult = e?.detail || {};
          const hasChanges = scanResult.hasChanges !== undefined
            ? scanResult.hasChanges
            : false;

          if (hasChanges) {
            await this.setMediaData(mediaData);
          }

          const mediaCount = this._appState.mediaData?.length || 0;

          updateAppState({
            scanProgress: this.createScanProgress(
              scanResult.pages || this._appState.scanProgress.pages,
              scanResult.mediaFiles || this._appState.scanProgress.mediaFiles,
              mediaCount,
              `${duration}s`,
              hasChanges,
            ),
            isScanning: false,
          });
        } else {
          const duration = ((Date.now() - this._appState.scanStartTime) / 1000).toFixed(1);
          updateAppState({
            scanProgress: this.createScanProgress(
              this._appState.scanProgress.pages,
              this._appState.scanProgress.mediaFiles,
              0,
              `${duration}s`,
              false,
            ),
            isScanning: false,
          });
        }
      }
    } catch (error) {
      console.error('[MEDIA-LIB] Error in handleScanComplete:', error); // eslint-disable-line no-console
    } finally {
      this._isProcessingData = false;
      updateAppState({ isScanning: false });
    }
  };

  handleScanError = (e) => {
    updateAppState({ isScanning: false });
    console.error('Scan error:', e.detail.error); // eslint-disable-line no-console
  };

  handleProgressiveDataUpdate = (e) => {
    const { mediaItems } = e.detail;
    const updatedData = [...this._appState.progressiveMediaData];
    const seenKeys = new Set(
      updatedData.map((item) => getGroupingKey(item.url)),
    );

    mediaItems.forEach((newItem) => {
      const groupingKey = getGroupingKey(newItem.url);
      if (!seenKeys.has(groupingKey)) {
        updatedData.push({ ...newItem, usageCount: 1 });
        seenKeys.add(groupingKey);
      }
    });

    updateAppState({ progressiveMediaData: updatedData });
  };

  handleMediaDataUpdated = async (e) => {
    const { mediaData } = e.detail;
    await this.setMediaData(mediaData);
  };

  createScanProgress(
    pages = 0,
    mediaFiles = 0,
    mediaReferences = 0,
    duration = null,
    hasChanges = null,
  ) {
    return { pages, mediaFiles, mediaReferences, duration, hasChanges };
  }

  showNotification(heading, message, type = 'success') {
    window.dispatchEvent(new CustomEvent('show-notification', {
      detail: {
        heading,
        message,
        type,
        open: true,
      },
    }));
  }

  handleShowNotification = (e) => {
    if (this._notificationTimeout) {
      clearTimeout(this._notificationTimeout);
    }
    updateAppState({ notification: e.detail });
    this._notificationTimeout = setTimeout(() => {
      updateAppState({ notification: null });
    }, 3000);
  };
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
