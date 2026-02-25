import { html, LitElement } from 'da-lit';
import getStyle from '../../utils/styles.js';
import { loadMediaSheet, buildMediaIndexStructures } from './utils/processing.js';
import {
  copyMediaToClipboard,
  exportToCsv,
  validateSitePath,
  saveRecentSite,
  getBasePath,
  resolveAbsolutePath,
  ensureAuthenticated,
  sortMediaData,
} from './utils/utils.js';
import {
  processMediaData,
  getDedupeKey,
  parseColonSyntax,
  getFilterLabel,
  computeResultSummary,
  filterMedia,
} from './utils/filters.js';
import { loadPinnedFolders, savePinnedFolders } from './utils/pin-folders.js';
import { getAppState, updateAppState, onStateChange, showNotification, FILTER_TYPES } from './utils/state.js';
import { initService, disposeService } from './utils/index-service.js';
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

    this._unsubscribe = onStateChange((state) => {
      this._appState = state;
      this.requestUpdate();
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._messageTimeout) {
      clearTimeout(this._messageTimeout);
    }

    if (this._unsubscribe) {
      this._unsubscribe();
    }
    disposeService();
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
          || oldState.progressiveMediaData !== newState.progressiveMediaData
          || oldState.isIndexing !== newState.isIndexing
      ) {
        this._filteredDataCache = null;

        let displayCount;
        if (newState.isIndexing && newState.progressiveMediaData?.length > 0) {
          const merged = this.mergeDataForDisplay(
            this.filteredMediaData,
            newState.progressiveMediaData,
          );
          displayCount = merged.length;
        }
        const resultSummary = computeResultSummary(
          newState.mediaData,
          this.filteredMediaData,
          newState.searchQuery,
          newState.selectedFilterType,
          displayCount !== undefined ? { displayCount } : {},
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
          indexLockedByOther: false,
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

    this._filteredDataCache = filterMedia(
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

    const result = [...existingData];
    const keyToIndex = new Map();
    existingData.forEach((item, i) => {
      keyToIndex.set(getDedupeKey(item.url), i);
    });

    newItems.forEach((newItem) => {
      const key = getDedupeKey(newItem.url);
      const existingIndex = keyToIndex.get(key);
      if (existingIndex !== undefined) {
        const existingTs = result[existingIndex].timestamp ?? 0;
        const newTs = newItem.timestamp ?? 0;
        if (newTs >= existingTs) {
          result[existingIndex] = {
            ...result[existingIndex],
            ...newItem,
            usageCount: result[existingIndex].usageCount,
          };
        }
      } else {
        result.push({ ...newItem, usageCount: 1 });
        keyToIndex.set(key, result.length - 1);
      }
    });

    return result;
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
      await this.loadMediaData();
      const onMediaDataUpdated = (mediaData) => this.setMediaData(mediaData);
      initService(this.sitePath, { onMediaDataUpdated });
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

    updateAppState({ indexLockedByOther: false });
    const basePath = getBasePath();
    const filteredMediaData = basePath
      ? rawData.filter((item) => !item.doc || item.doc === '' || item.doc.startsWith(basePath))
      : rawData;

    const { uniqueItems, usageIndex, folderPaths } = buildMediaIndexStructures(filteredMediaData);
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
          <div class="validation-content indexing-state">
            <div class="indexing-spinner"></div>
            <p class="indexing-message">Discovering</p>
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
            @export-csv=${this.handleExportCsv}
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

    if (this._appState.isIndexing && !hasData && !hasProgressiveData) {
      return this.renderIndexingState();
    }

    if (!hasData && !this._appState.isIndexing) {
      if (this._appState.indexLockedByOther) {
        return this.renderIndexLockedState();
      }
      return this.renderEmptyState();
    }

    if (hasData && !hasFilteredData && !this._appState.isIndexing) {
      return this.renderEmptyState();
    }

    let displayData = filteredData;
    if (this._appState.isIndexing && hasProgressiveData && !hasData) {
      displayData = this.mergeDataForDisplay(
        filteredData,
        this._appState.progressiveMediaData,
      );
    } else if (displayData?.length > 0) {
      displayData = sortMediaData(displayData);
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

  renderIndexingState() {
    return html`
      <div class="indexing-state">
        <div class="indexing-spinner"></div>
        <p class="indexing-message">Discovering</p>
      </div>
    `;
  }

  renderIndexLockedState() {
    return html`
      <div class="indexing-state index-locked-state">
        <div class="indexing-spinner"></div>
        <p class="indexing-message">Discovery session in progress</p>
        <p class="indexing-hint">Media will appear automatically when discovery is complete.</p>
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
      showNotification('Already Pinned!', `Folder :${folder} is already pinned`, 'danger');
      return;
    }

    const pinnedFolder = { path: fullPath };

    const updatedPinnedFolders = [...pinnedFolders, pinnedFolder];
    savePinnedFolders(updatedPinnedFolders, this.org, this.repo);

    showNotification('Folder Pinned', `Folder :${folder} pinned`);
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

    const groupingKey = getDedupeKey(media.url);
    const usageData = this._appState.usageIndex?.get(groupingKey) || [];

    const mediaInfo = this.shadowRoot.querySelector('nx-media-info');
    mediaInfo?.show({
      media,
      usageData,
      org: this.org,
      repo: this.repo,
      isIndexing: this._appState.isIndexing,
    });
  }

  async handleMediaCopy(e) {
    const { media } = e.detail;
    if (!media) return;

    try {
      const result = await copyMediaToClipboard(media);
      const isError = result.heading === 'Error';
      showNotification(result.heading, result.message, isError ? 'danger' : 'success');
    } catch (error) {
      showNotification('Error', 'Failed to copy Resource.', 'danger');
    }
  }

  handleExportCsv = () => {
    const filteredData = this.filteredMediaData;
    let data = filteredData;
    if (this._appState.isIndexing && this._appState.progressiveMediaData?.length > 0) {
      data = this.mergeDataForDisplay(
        filteredData,
        this._appState.progressiveMediaData,
      );
    } else if (data?.length > 0) {
      data = sortMediaData(data);
    }
    if (!data || data.length === 0) {
      showNotification('Info', 'No data to export.', 'info');
      return;
    }
    try {
      exportToCsv(data, {
        org: this.org,
        repo: this.repo,
        filterName: this._appState.selectedFilterType,
      });
      showNotification('Success', 'Export complete.', 'success');
    } catch (error) {
      showNotification('Error', 'Failed to export.', 'danger');
    }
  };

  handleAltTextUpdated(e) {
    const { media } = e.detail;

    if (this._appState.mediaData) {
      updateAppState({
        mediaData: this._appState.mediaData.map((item) => (
          item.url === media.url ? { ...item, ...media } : item)),
      });
    }
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
