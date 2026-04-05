import { html, LitElement } from 'da-lit';
import getStyle from '../../utils/styles.js';
import { loadMediaSheet, buildMediaIndexStructures } from './indexing/load.js';
import { copyMediaToClipboard, exportToCsv } from './core/export.js';
import {
  validateSitePath, getBasePath, resolveAbsolutePath, normalizeSitePath, parseSitePathFromHash,
  parseRouteState, buildUrlWithState,
} from './core/paths.js';
import { saveRecentSite } from './core/storage.js';
import {
  ensureAuthenticated,
  getCanonicalMediaTimestamp,
  sortMediaData,
  deduplicateMediaByHash,
  checkSiteAuthRequired,
  livePreviewLogin,
} from './core/utils.js';
import {
  getDedupeKey, setMediaHashRuntimeHosts, clearMediaHashRuntimeHost,
} from './core/urls.js';
import {
  isIndexedExternalMediaEntry,
  isIndexedExternalMediaOperation,
  isUiExcludedMediaItem,
} from './core/media.js';
import {
  processMediaData,
  parseColonSyntax,
  getFilterLabel,
  computeResultSummary,
  filterMedia,
  enrichMediaItemsWithUsage,
  initializeProcessedData,
} from './features/filters.js';
import { loadPinnedFolders, savePinnedFolders } from './features/pin.js';
import { t } from './core/messages.js';
import { initService, disposeService } from './indexing/coordinator.js';
import { fetchSidekickConfig } from './indexing/admin-api.js';
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
const shellStyles = await getStyle(new URL('./media-library-shell.css', import.meta.url).href);

let shellStylesInstalled = false;

function installMediaLibraryShellStyles() {
  if (shellStylesInstalled || typeof document === 'undefined' || !document.adoptedStyleSheets) {
    return;
  }
  shellStylesInstalled = true;
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, shellStyles];
}

const VALID_FILTERS = new Set([
  'all', 'images', 'videos', 'documents', 'fragments',
  'icons', 'links', 'noReferences',
]);
const DEFAULT_FILTER = 'images';
const NOTIFICATION_DURATION = { success: 3000, warning: 5000, danger: 10000 };

// Keys that trigger cache invalidation when changed
const CACHE_KEYS = [
  'searchQuery', 'selectedFilterType', 'selectedFolder',
  'selectedDocument', 'selectedMediaKey', 'selectedMediaTab',
  'mediaData', 'processedData', 'streamData',
  'totalCount', 'countCapped', 'isIndexing',
];

// Keys that trigger URL sync when changed
const URL_SYNC_KEYS = [
  'searchQuery', 'selectedFilterType', 'selectedFolder',
  'selectedDocument', 'selectedMediaKey', 'selectedMediaTab',
];

class NxMediaLibrary extends LitElement {
  static properties = {
    sitePath: { state: true },
    searchQuery: { state: true },
    selectedFilterType: { state: true },
    selectedFolder: { state: true },
    selectedDocument: { state: true },
    selectedMediaKey: { state: true },
    selectedMediaTab: { state: true },
    mediaData: { state: true },
    usageIndex: { state: true },
    processedData: { state: true },
    streamData: { state: true },
    totalCount: { state: true },
    countCapped: { state: true },
    isIndexing: { state: true },
    isRefreshing: { state: true },
    isValidating: { state: true },
    isLoadingData: { state: true },
    isStreaming: { state: true },
    indexProgress: { state: true },
    indexStartTime: { state: true },
    sitePathValid: { state: true },
    validationError: { state: true },
    suggestion: { state: true },
    indexLocked: { state: true },
    indexMissing: { state: true },
    notification: { state: true },
    persistentError: { state: true },
    org: { state: true },
    repo: { state: true },
  };

  constructor() {
    super();
    this.searchQuery = '';
    this.selectedFilterType = DEFAULT_FILTER;
    this.selectedFolder = null;
    this.selectedDocument = null;
    this.selectedMediaKey = null;
    this.selectedMediaTab = 'usage';
    this.mediaData = [];
    this.usageIndex = new Map();
    this.processedData = null;
    this.streamData = [];
    this.totalCount = null;
    this.countCapped = false;
    this.isIndexing = false;
    this.isRefreshing = false;
    this.isValidating = false;
    this.isLoadingData = false;
    this.isStreaming = false;
    this.indexProgress = null;
    this.indexStartTime = null;
    this.sitePathValid = false;
    this.validationError = null;
    this.suggestion = null;
    this.indexLocked = false;
    this.indexMissing = false;
    this.notification = null;
    this.persistentError = null;
    this.org = null;
    this.repo = null;
    this._filteredDataCache = null;
    this._displayDataCache = null;
    this._resultSummaryCache = null;
    this._urlSyncDebounce = null;
    this._isApplyingUrlState = false;
    this._hasHydrated = false;
    this._notificationTimeout = null;
  }

  resetDerivedCaches() {
    this._filteredDataCache = null;
    this._displayDataCache = null;
    this._resultSummaryCache = null;
  }

  resetSiteState() {
    this.mediaData = [];
    this.usageIndex = new Map();
    this.processedData = null;
    this.streamData = [];
    this.totalCount = null;
    this.countCapped = false;
    this.isIndexing = false;
    this.isRefreshing = false;
    this.isValidating = false;
    this.isLoadingData = false;
    this.isStreaming = false;
    this.indexProgress = null;
    this.indexStartTime = null;
    this.indexLocked = false;
    this.indexMissing = false;
    this.persistentError = null;
    this.validationError = null;
    this.suggestion = null;
    this.selectedMediaKey = null;
    this.selectedMediaTab = 'usage';
    this.resetSearchState();
    this.resetDerivedCaches();
  }

  connectedCallback() {
    super.connectedCallback();
    installMediaLibraryShellStyles();
    this.shadowRoot.adoptedStyleSheets = [sl, slComponents, topbarStyles, styles];
    document.querySelector('.nx-app')?.classList.add('has-media-library');
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._urlSyncDebounce) {
      clearTimeout(this._urlSyncDebounce);
    }
    if (this._notificationTimeout) {
      clearTimeout(this._notificationTimeout);
    }
    disposeService();
    document.querySelector('.nx-app')?.classList.remove('has-media-library');
  }

  willUpdate(changedProperties) {
    const cacheKeysChanged = CACHE_KEYS.some((key) => changedProperties.has(key));
    if (cacheKeysChanged) {
      this.resetDerivedCaches();
    }

    const urlKeysChanged = URL_SYNC_KEYS.some((key) => changedProperties.has(key));
    if (urlKeysChanged) {
      this._syncStateToUrl();
    }

    if ((changedProperties.has('mediaData') || changedProperties.has('streamData'))
        && this.selectedMediaKey) {
      this._attemptModalResolution();
    }
  }

  update(changedProperties) {
    if (changedProperties.has('sitePath')) {
      const prevSitePath = changedProperties.get('sitePath');
      if (prevSitePath !== this.sitePath) {
        clearMediaHashRuntimeHost();
        this.shadowRoot.querySelector('nx-media-info')?.close?.();
        this.resetSiteState();

        if (this.sitePath) {
          const [orgVal, repoVal] = this.sitePath.split('/').slice(1, 3);
          this.org = orgVal || null;
          this.repo = repoVal || null;
        }
      }
    }
    super.update(changedProperties);
  }

  async initializeMediaHashRuntimeHost(org, repo) {
    const config = await fetchSidekickConfig(org, repo, 'main');
    const route = Array.isArray(config?.routes) ? config.routes[0] : config?.routes;
    setMediaHashRuntimeHosts(
      config?.host,
      config?.liveHost,
      config?.previewHost,
      org,
      repo,
      route,
    );
  }

  updated(changedProperties) {
    if (changedProperties.has('sitePath') && this.sitePath) {
      this.initialize();
    }

    // Hydrate from URL after site validation and initial load complete
    if (!this._hasHydrated && (changedProperties.has('sitePathValid')
        || changedProperties.has('isLoadingData') || changedProperties.has('isValidating'))) {
      // Trigger hydration when site validated and loading complete
      if (this.sitePathValid && !this.isLoadingData && !this.isValidating) {
        this._hasHydrated = true;
        this._hydrateStateFromUrl();
      }
    }
  }

  get filteredMediaData() {
    if (this._filteredDataCache !== null) {
      return this._filteredDataCache;
    }

    if (!this.mediaData || this.mediaData.length === 0) {
      this._filteredDataCache = [];
      return this._filteredDataCache;
    }

    this._filteredDataCache = filterMedia(
      this.mediaData,
      {
        searchQuery: this.searchQuery,
        selectedDocument: this.selectedDocument,
        selectedFolder: this.selectedFolder,
        selectedFilterType: this.selectedFilterType,
        processedData: this.processedData,
        org: this.org,
        repo: this.repo,
      },
    );

    return this._filteredDataCache;
  }

  get displayMediaData() {
    if (this._displayDataCache !== null) {
      return this._displayDataCache;
    }

    const filteredData = this.filteredMediaData;
    const hasData = this.mediaData?.length > 0;
    const hasProgressiveData = this.streamData?.length > 0;

    let displayData = filteredData;
    if (this.isIndexing && hasProgressiveData && !hasData) {
      const progressiveData = this.streamData;
      const filteredProgressiveData = this.filterProgressiveData(progressiveData);
      const merged = this.mergeDataForDisplay(
        filteredData,
        filteredProgressiveData,
      );
      displayData = merged;
    } else if (filteredData?.length > 0) {
      if (this.isStreaming) {
        displayData = filteredData;
      } else {
        displayData = sortMediaData(filteredData);
      }
    }

    // Deduplicate by hash when not viewing a specific document/folder
    if (!this.selectedDocument && !this.selectedFolder && displayData?.length > 0) {
      displayData = deduplicateMediaByHash(displayData);
    }

    this._displayDataCache = displayData;
    return this._displayDataCache;
  }

  get resultSummary() {
    if (this._resultSummaryCache !== null) {
      return this._resultSummaryCache;
    }

    const opts = {};
    if (this.isIndexing && this.streamData?.length > 0) {
      const progressiveData = this.streamData;
      const filteredProgressiveData = this.filterProgressiveData(progressiveData);
      let merged = this.mergeDataForDisplay(
        this.filteredMediaData,
        filteredProgressiveData,
      );
      // Apply deduplication to count if not viewing specific document/folder
      if (!this.selectedDocument && !this.selectedFolder) {
        merged = deduplicateMediaByHash(merged);
      }
      opts.displayCount = merged.length;
      opts.displayCountCapped = !!this.countCapped;
    }

    // Get deduplicated filtered data for accurate count
    let countData = this.filteredMediaData;
    if (!this.selectedDocument && !this.selectedFolder && countData?.length > 0) {
      countData = deduplicateMediaByHash(countData);
    }

    this._resultSummaryCache = computeResultSummary(
      this.mediaData,
      countData,
      this.searchQuery,
      this.selectedFilterType,
      opts,
    );

    return this._resultSummaryCache;
  }

  filterProgressiveData(progressiveData) {
    if (!progressiveData || progressiveData.length === 0) return progressiveData;

    return filterMedia(progressiveData, {
      searchQuery: this.searchQuery,
      selectedDocument: this.selectedDocument,
      selectedFolder: this.selectedFolder,
      selectedFilterType: this.selectedFilterType,
      processedData: this.processedData,
      org: this.org,
      repo: this.repo,
    });
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
        const existingTs = getCanonicalMediaTimestamp(result[existingIndex]);
        const newTs = getCanonicalMediaTimestamp(newItem);
        if (newTs >= existingTs) {
          result[existingIndex] = {
            ...result[existingIndex],
            ...newItem,
            usageCount: result[existingIndex].usageCount,
          };
        }
      } else {
        result.push(newItem);
        keyToIndex.set(key, result.length - 1);
      }
    });

    return result;
  }

  _hydrateStateFromUrl() {
    this._isApplyingUrlState = true;
    try {
      const { params } = parseRouteState();

      // Parse filter param (may be overridden by doc/folder)
      const filter = params.get('filter');
      const targetFilterType = (filter && VALID_FILTERS.has(filter)) ? filter : DEFAULT_FILTER;

      const doc = params.get('doc');
      const folder = params.get('folder');
      const q = params.get('q');

      // Apply precedence with derived filter semantics
      if (doc) {
        this.searchQuery = '';
        this.selectedFolder = null;
        this.selectedDocument = doc;
        this.selectedFilterType = 'documentTotal';
      } else if (folder) {
        this.searchQuery = '';
        this.selectedFolder = folder;
        this.selectedDocument = null;
        this.selectedFilterType = 'images';
      } else if (q) {
        this.searchQuery = q;
        this.selectedFolder = null;
        this.selectedDocument = null;
        this.selectedFilterType = targetFilterType;
      } else {
        this.searchQuery = '';
        this.selectedFolder = null;
        this.selectedDocument = null;
        this.selectedFilterType = targetFilterType;
      }

      // Parse modal state
      const mediaKey = params.get('media');
      this.selectedMediaKey = mediaKey || null;

      const tab = params.get('tab');
      this.selectedMediaTab = (tab === 'metadata') ? 'metadata' : 'usage';

      // Open/close modal after state update
      if (mediaKey) {
        this._attemptModalResolution();
      } else {
        const modal = this.shadowRoot.querySelector('nx-media-info');
        if (modal?.media) modal.close();
      }
    } finally {
      this._isApplyingUrlState = false;
    }
  }

  _attemptModalResolution() {
    if (!this.selectedMediaKey) return;

    let sourceData = this.mediaData;

    if ((!sourceData || sourceData.length === 0) && this.streamData?.length > 0) {
      sourceData = this.streamData;
    }

    if (!sourceData || sourceData.length === 0) return;

    const matchedItem = sourceData.find((item) => {
      const key = getDedupeKey(item.url);
      return key === this.selectedMediaKey;
    });

    if (matchedItem && isUiExcludedMediaItem(matchedItem)) {
      this.selectedMediaKey = null;
      this.shadowRoot.querySelector('nx-media-info')?.close?.();
      return;
    }

    if (matchedItem) {
      const modal = this.shadowRoot.querySelector('nx-media-info');
      const dialogEl = modal?.shadowRoot?.querySelector('dialog');
      const dialogOpen = dialogEl?.open === true;
      if (dialogOpen && modal?.media?.url) {
        const currentKey = getDedupeKey(modal.media.url);
        if (currentKey === this.selectedMediaKey) {
          return;
        }
      }
      modal.show({
        media: matchedItem,
        usageData: this.usageIndex?.get(getDedupeKey(matchedItem.url)) || [],
        org: this.org,
        repo: this.repo,
        isIndexing: this.isIndexing,
        initialTab: this.selectedMediaTab,
      });
    }
  }

  _syncStateToUrl() {
    if (this._isApplyingUrlState) return;

    clearTimeout(this._urlSyncDebounce);
    this._urlSyncDebounce = setTimeout(() => {
      // Guard: don't write URL until sitePath is initialized AND hydration has completed
      if (!this.sitePath || !this._hasHydrated) return;

      const params = new URLSearchParams();

      // Doc/folder have implied filters - don't write filter param
      if (this.selectedDocument) {
        params.set('doc', this.selectedDocument);
      } else if (this.selectedFolder) {
        params.set('folder', this.selectedFolder);
      } else {
        // General browsing - write filter if not default
        if (this.selectedFilterType && this.selectedFilterType !== DEFAULT_FILTER) {
          params.set('filter', this.selectedFilterType);
        }
        if (this.searchQuery) {
          params.set('q', this.searchQuery);
        }
      }

      // Modal state
      if (this.selectedMediaKey) {
        params.set('media', this.selectedMediaKey);
        if (this.selectedMediaTab !== 'usage') {
          params.set('tab', this.selectedMediaTab);
        }
      }

      const newUrl = buildUrlWithState(this.sitePath, params);
      const currentUrl = window.location.search + window.location.hash;
      if (currentUrl !== newUrl) {
        history.replaceState(null, '', newUrl);
      }
    }, 300);
  }

  async initialize() {
    if (!this.sitePath) return;

    // Reset hydration flag for new site
    this._hasHydrated = false;

    this.isIndexing = false;
    this.isRefreshing = false;
    this.indexLocked = false;
    this.isValidating = true;
    this.sitePathValid = false;
    this.validationError = null;
    this.suggestion = null;
    this.persistentError = null;

    try {
      const isAuthenticated = await ensureAuthenticated();
      if (!isAuthenticated) return;

      const validation = await validateSitePath(this.sitePath);

      if (!validation.valid) {
        this.isValidating = false;
        this.validationError = validation.error;
        this.suggestion = validation.suggestion;
        this.sitePathValid = false;
        return;
      }

      const org = validation.org || this.org;
      const repo = validation.repo || this.repo;

      await this.initializeMediaHashRuntimeHost(org, repo);

      const siteAuthInfo = await checkSiteAuthRequired(org, repo);
      this.siteAuthInfo = siteAuthInfo;

      if (siteAuthInfo.requiresAuth) {
        const authSuccess = await livePreviewLogin(org, repo);
        this.siteAuthInfo.authFailed = !authSuccess;
      }

      this.sitePathValid = true;
      this.validationError = null;
      this.suggestion = null;
      this.persistentError = this.siteAuthInfo?.authFailed
        ? { message: 'Protected site - some images may not load, refresh or login into site in a new tab using sidekick' }
        : null;
      this.isValidating = false;

      saveRecentSite(this.sitePath);
      await this.loadMediaData();

      // Initialize coordinator service with component context
      const onMediaDataUpdated = (mediaData) => this.setMediaData(mediaData);
      const componentContext = this._createCoordinatorContext();
      initService(this.sitePath, { onMediaDataUpdated, componentContext });
    } catch (error) {
      this.isValidating = false;
      this.validationError = error.message;
      this.sitePathValid = false;
    }
  }

  _createCoordinatorContext() {
    const component = this;
    return {
      get sitePath() { return component.sitePath; },
      get isIndexing() { return component.isIndexing; },
      get indexLocked() { return component.indexLocked; },
      get isRefreshing() { return component.isRefreshing; },
      get mediaData() { return component.mediaData; },
      setIndexing(isIndexing) {
        component.isIndexing = isIndexing;
      },
      setIndexProgress(stage, message, extras = {}) {
        component.indexProgress = { stage, message, ...extras };
      },
      setIndexStartTime(timestamp) {
        component.indexStartTime = timestamp;
      },
      setIndexFlags({ isIndexing, indexLocked, isRefreshing, indexMissing } = {}) {
        if (isIndexing !== undefined) component.isIndexing = isIndexing;
        if (indexLocked !== undefined) component.indexLocked = indexLocked;
        if (isRefreshing !== undefined) component.isRefreshing = isRefreshing;
        if (indexMissing !== undefined) component.indexMissing = indexMissing;
      },
      setStreamData(data, count, capped) {
        component.streamData = data;
        component.totalCount = count;
        component.countCapped = capped;
      },
      clearStreamData() {
        component.streamData = [];
        component.totalCount = null;
        component.countCapped = false;
      },
      setPersistentError(message) {
        component.persistentError = message ? { message } : null;
      },
      clearIndexState() {
        component.isIndexing = false;
        component.isRefreshing = false;
        component.indexLocked = false;
        component.indexMissing = false;
        component.persistentError = null;
        component.streamData = [];
        component.totalCount = null;
        component.countCapped = false;
      },
      showNotification: (heading, message, type) => {
        component.showNotification(heading, message, type);
      },
    };
  }

  async loadMediaData() {
    try {
      this.isLoadingData = true;

      const isAuthenticated = await ensureAuthenticated();
      if (!isAuthenticated) {
        this.isLoadingData = false;
        return;
      }

      // Progressive chunk loading callback
      let accumulatedData = [];
      let chunk0Rendered = false;

      const onProgressiveChunk = (chunkData, chunkIndex, totalChunks) => {
        accumulatedData = [...accumulatedData, ...chunkData];

        if (chunkIndex === 0 && !chunk0Rendered) {
          chunk0Rendered = true;
          if (totalChunks > 1) {
            this.isStreaming = true;
          }
          this.setMediaData(chunkData).catch((err) => {
            // eslint-disable-next-line no-console
            console.error('[MediaLibrary:progressive] Error updating UI with chunk 0:', err);
          });
        }
      };

      const {
        data, indexMissing, indexing, lockFresh,
      } = await loadMediaSheet(
        this.sitePath,
        onProgressiveChunk,
      );

      if (indexing) {
        this.isLoadingData = false;
        this.isStreaming = false;
        this.isIndexing = false;
        this.isRefreshing = false;
        this.indexLocked = true;
        this.indexMissing = true;
        this.persistentError = null;
        return;
      }

      this.persistentError = null;
      this.indexMissing = !!indexMissing;
      this.indexLocked = false;
      this.isRefreshing = !!(data?.length > 0) && !!lockFresh;

      const finalData = accumulatedData.length > 0 ? accumulatedData : data;
      await this.setMediaData(finalData);
      this.isLoadingData = false;
      this.isStreaming = false;
    } catch (error) {
      this.isLoadingData = false;
      this.isStreaming = false;
      this.isRefreshing = false;

      const { MediaLibraryError, ErrorCodes } = await import('./core/errors.js');
      if (error instanceof MediaLibraryError) {
        const persistentCodes = [
          ErrorCodes.INDEX_PARSE_ERROR,
          ErrorCodes.DA_READ_DENIED,
        ];
        const isPersistent = persistentCodes.includes(error.code);
        this.persistentError = isPersistent ? { message: error.message } : null;
        this.sitePathValid = true;
        this.indexMissing = false;
        await this.setMediaData([]);
        if (!isPersistent) {
          this.showNotification(t('NOTIFY_ERROR'), error.message, 'danger');
        }
      } else {
        // eslint-disable-next-line no-console
        console.error('[MEDIA-LIB:loadMediaData]', error);
        this.validationError = 'Failed to load media data. Please ensure you are signed in.';
        this.sitePathValid = false;
      }
    }
  }

  async setMediaData(rawData) {
    const isEmpty = !rawData || rawData.length === 0;

    if (isEmpty) {
      this.mediaData = [];
      this.usageIndex = new Map();
      this.processedData = initializeProcessedData();
      this.resetDerivedCaches();
      return;
    }

    this.indexLocked = false;
    const basePath = getBasePath();

    const sanitizedMediaData = rawData.filter((item) => (
      !isIndexedExternalMediaOperation(item) || isIndexedExternalMediaEntry(item)
    ));

    const filteredMediaData = basePath
      ? sanitizedMediaData.filter((item) => !item.doc || item.doc === '' || item.doc.startsWith(basePath))
      : sanitizedMediaData;

    const { uniqueItems, usageIndex } = buildMediaIndexStructures(filteredMediaData);

    const processedData = await processMediaData(
      filteredMediaData,
      null,
      this.org,
      this.repo,
    );
    const enrichedMediaData = enrichMediaItemsWithUsage(uniqueItems, processedData);

    this.mediaData = enrichedMediaData;
    this.usageIndex = usageIndex;
    this.processedData = processedData;

    this._filteredDataCache = null;
    this._displayDataCache = null;
    this._resultSummaryCache = null;
  }

  // Notification helper methods
  showNotification(heading, message, type = 'success') {
    if (this._notificationTimeout) {
      clearTimeout(this._notificationTimeout);
    }
    this.notification = { heading, message, type };
    const duration = NOTIFICATION_DURATION[type] ?? NOTIFICATION_DURATION.success;
    this._notificationTimeout = setTimeout(() => {
      this.notification = null;
      this._notificationTimeout = null;
    }, duration);
  }

  dismissNotification() {
    if (this._notificationTimeout) {
      clearTimeout(this._notificationTimeout);
      this._notificationTimeout = null;
    }
    this.notification = null;
  }

  render() {
    if (!this.sitePath) {
      return html`<nx-media-onboard @site-selected=${this.handleSiteSelected}></nx-media-onboard>`;
    }

    if (this.isValidating) {
      return html`
        <div class="validation-state">
          <div class="validation-content indexing-state">
            <div class="indexing-spinner"></div>
            <p class="indexing-message">${t('UI_DISCOVERING')}</p>
          </div>
        </div>
      `;
    }

    if (!this.sitePathValid && this.validationError) {
      return this.renderErrorState();
    }

    return html`
      <div class="media-library">
        <h1 class="sr-only">Media Library</h1>
        <div class="sidebar">
          <nx-media-sidebar
            .selectedFilterType=${this.selectedFilterType}
            .mediaData=${this.mediaData}
            @filter=${this.handleFilter}
            @export-csv=${this.handleExportCsv}
          ></nx-media-sidebar>
        </div>

        <div class="top-bar">
          <nx-media-topbar
            .searchQuery=${this.searchQuery}
            .resultSummary=${this.resultSummary}
            .selectedFolder=${this.selectedFolder}
            .selectedDocument=${this.selectedDocument}
            .selectedFilterType=${this.selectedFilterType}
            .mediaData=${this.mediaData}
            .processedData=${this.processedData}
            .isIndexing=${this.isIndexing}
            .isRefreshing=${this.isRefreshing}
            .isStreaming=${this.isStreaming}
            .org=${this.org}
            .repo=${this.repo}
            @search=${this.handleSearch}
            @clear-search=${this.handleClearSearch}
            @pin-search=${this.handlePinFolder}
          ></nx-media-topbar>
        </div>

        <div class="content">
          ${this.persistentError ? html`
            <div class="da-persistent-banner danger">
              <div class="da-persistent-banner-header">
                <span class="da-persistent-banner-heading">${t('NOTIFY_ERROR')}</span>
                <button
                  type="button"
                  class="da-persistent-banner-close"
                  aria-label="${t('UI_DISMISS')}"
                  @click=${this.handleDismissBanner}
                >
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <p class="da-persistent-banner-message">${this.persistentError.message}</p>
            </div>
          ` : ''}
          ${this.renderCurrentView()}
        </div>

        <nx-media-info
          .usageIndex=${this.usageIndex}
          @modal-open=${(e) => {
            this.selectedMediaKey = getDedupeKey(e.detail.media.url);
            this.selectedMediaTab = e.detail.tab;
          }}
          @tab-change=${(e) => {
            this.selectedMediaTab = e.detail.tab;
          }}
          @modal-close=${() => {
            this.selectedMediaKey = null;
            this.selectedMediaTab = 'usage';
          }}
        ></nx-media-info>

        ${this.notification ? html`
          <div class="da-notification-status">
            <div class="toast-notification ${this.notification.type || 'success'}">
              <div class="toast-notification-header">
                <p class="da-notification-status-title">${this.notification.heading || t('NOTIFY_INFO')}</p>
                <button
                  type="button"
                  class="toast-notification-close"
                  aria-label="${t('UI_DISMISS')}"
                  @click=${this.handleDismissNotification}
                >
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <p class="da-notification-status-description">${this.notification.message}</p>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  renderCurrentView() {
    const hasData = this.mediaData?.length > 0;
    const filteredData = this.filteredMediaData;
    const hasFilteredData = filteredData?.length > 0;
    const hasProgressiveData = this.streamData?.length > 0;

    // Show loading state when initially loading data (before any chunks arrive)
    if (this.isLoadingData && !hasData) {
      return this.renderIndexingState();
    }

    // Only show "Discovering..." full-screen state when truly no data exists
    if (this.isIndexing && !hasData && !hasProgressiveData) {
      return this.renderIndexingState();
    }

    // Show empty state only when not loading and no data exists
    if (!hasData && !this.isIndexing && !this.isLoadingData) {
      if (this.indexLocked) {
        return this.renderIndexLockedState();
      }
      return this.renderEmptyState();
    }

    if (hasData && !hasFilteredData && !this.isIndexing) {
      return this.renderEmptyState();
    }

    const displayData = this.displayMediaData;

    const resultsBusy = !!(this.isIndexing
      || this.isRefreshing
      || this.isStreaming
      || this.isLoadingData);

    return html`
      <nx-media-grid
        .mediaData=${displayData}
        .org=${this.org}
        .repo=${this.repo}
        .usePreviewDaLive=${this.siteAuthInfo?.requiresAuth || false}
        .resultsBusy=${resultsBusy}
        @mediaClick=${this.handleMediaClick}
        @mediaCopy=${this.handleMediaCopy}
      ></nx-media-grid>
    `;
  }

  renderErrorState() {
    return html`
      <div class="error-state">
        <div class="error-content">
          <p>${this.validationError}</p>
          ${this.suggestion ? html`<p class="error-suggestion">${this.suggestion}</p>` : ''}
        </div>
      </div>
    `;
  }

  renderIndexingState() {
    return html`
      <div class="indexing-state">
        <div class="indexing-spinner"></div>
        <p class="indexing-message">${t('UI_DISCOVERING')}</p>
      </div>
    `;
  }

  renderIndexLockedState() {
    return html`
      <div class="indexing-state index-locked-state">
        <div class="indexing-spinner"></div>
        <p class="indexing-message">${t('UI_DISCOVERY_IN_PROGRESS')}</p>
        <p class="indexing-hint">${t('UI_DISCOVERY_HINT')}</p>
      </div>
    `;
  }

  renderEmptyState() {
    if (this.indexMissing) {
      return html`
        <div class="empty-state">
          <h3>${t('INDEX_MISSING')}</h3>
          <p>${t('INDEX_MISSING_HINT')}</p>
        </div>
      `;
    }
    const filterLabel = getFilterLabel(this.selectedFilterType, 0);
    let message = t('UI_NO_ITEMS_FOUND', { filterLabel });

    if (this.searchQuery) {
      const colonSyntax = parseColonSyntax(this.searchQuery);

      if (colonSyntax) {
        const { field, value } = colonSyntax;

        if (field === 'folder') {
          const folderPath = value || '/';
          message = t('UI_NO_ITEMS_IN_PATH', { filterLabel, path: folderPath });
        } else if (field === 'doc') {
          const docPath = value.replace(/\.html$/, '');
          message = t('UI_NO_ITEMS_IN_PATH', { filterLabel, path: docPath });
        } else {
          message = t('UI_NO_ITEMS_MATCHING', { filterLabel, query: this.searchQuery });
        }
      } else {
        message = t('UI_NO_ITEMS_MATCHING', { filterLabel, query: this.searchQuery });
      }
    }

    return html`
      <div class="empty-state">
        <h3>${message}</h3>
        <p>${t('UI_TRY_DIFFERENT_SEARCH')}</p>
      </div>
    `;
  }

  handleSiteSelected(e) {
    const { sitePath } = e.detail;
    window.location.hash = sitePath;
  }

  handleDismissNotification() {
    this.dismissNotification();
  }

  handleDismissBanner() {
    this.persistentError = null;
  }

  handleDocNavigation(path) {
    if (path) {
      this.selectedDocument = resolveAbsolutePath(path);
    }
  }

  handleFolderNavigation(path) {
    if (path) {
      this.selectedFolder = resolveAbsolutePath(path, true);
    }
  }

  handlePinFolder(e) {
    const { folder } = e.detail || {};
    if (!folder) return;

    const pinnedFolders = loadPinnedFolders(this.org, this.repo);

    const fullPath = `/${this.org}/${this.repo}${folder}`;
    const alreadyPinned = pinnedFolders.some((pf) => pf.path === fullPath);

    if (alreadyPinned) {
      this.showNotification(t('NOTIFY_ALREADY_PINNED'), t('NOTIFY_ALREADY_PINNED_MSG', { folder }), 'danger');
      return;
    }

    const pinnedFolder = { path: fullPath };

    const updatedPinnedFolders = [...pinnedFolders, pinnedFolder];
    savePinnedFolders(updatedPinnedFolders, this.org, this.repo);

    this.showNotification(t('NOTIFY_FOLDER_PINNED'), t('NOTIFY_FOLDER_PINNED_MSG', { folder }));
  }

  handleSearch(e) {
    const { query, type, path } = e.detail;

    if (!query || !query.trim()) {
      this.searchQuery = '';
      this.selectedDocument = null;
      this.selectedFolder = null;
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

    const hasDocOrFolderPath = searchPath != null && String(searchPath).trim() !== '';

    if (searchType === 'doc' && hasDocOrFolderPath) {
      this.searchQuery = '';
      this.selectedFolder = null;
      this.handleDocNavigation(String(searchPath).trim());
    } else if (searchType === 'folder' && hasDocOrFolderPath) {
      this.searchQuery = '';
      this.selectedDocument = null;
      this.handleFolderNavigation(String(searchPath).trim());
    } else {
      this.searchQuery = query;
      this.selectedFolder = null;
      this.selectedDocument = null;
    }
  }

  handleClearSearch() {
    this.resetSearchState();
  }

  handleFilter(e) {
    this.selectedFilterType = e.detail.type;
  }

  resetSearchState() {
    this.searchQuery = '';
    this.selectedFolder = null;
    this.selectedDocument = null;
  }

  async handleMediaClick(e) {
    const { media } = e.detail;
    if (!media) return;

    const groupingKey = getDedupeKey(media.url);
    const usageData = this.usageIndex?.get(groupingKey) || [];

    const snapshot = [...this.displayMediaData];
    let idx = snapshot.findIndex((m) => m === media);
    if (idx === -1) {
      idx = snapshot.findIndex((m) => m && media
        && getDedupeKey(m.url) === getDedupeKey(media.url)
        && (m.doc ?? '') === (media.doc ?? ''));
    }

    const payload = {
      media,
      usageData,
      org: this.org,
      repo: this.repo,
      usePreviewDaLive: this.siteAuthInfo?.requiresAuth || false,
      isIndexing: this.isIndexing,
    };
    if (idx >= 0 && snapshot.length > 1) {
      payload.navigationItems = snapshot;
      payload.navigationIndex = idx;
    }

    const mediaInfo = this.shadowRoot.querySelector('nx-media-info');
    mediaInfo?.show(payload);
  }

  async handleMediaCopy(e) {
    const { media } = e.detail;
    if (!media) return;

    try {
      const result = await copyMediaToClipboard(media);
      const isError = result.heading === 'Error';
      this.showNotification(result.heading, result.message, isError ? 'danger' : 'success');
    } catch (_) {
      this.showNotification(t('NOTIFY_ERROR'), t('NOTIFY_COPY_ERROR'), 'danger');
    }
  }

  handleExportCsv = () => {
    const filteredData = this.filteredMediaData;
    let data = filteredData;
    if (this.isIndexing && this.streamData?.length > 0) {
      const progressiveData = this.streamData;
      const filteredProgressiveData = this.filterProgressiveData(progressiveData);
      data = this.mergeDataForDisplay(
        filteredData,
        filteredProgressiveData,
      );
    } else if (data?.length > 0 && !this.isStreaming) {
      data = sortMediaData(data);
    }
    if (!data || data.length === 0) {
      this.showNotification(t('NOTIFY_INFO'), t('NOTIFY_EXPORT_NO_DATA'), 'info');
      return;
    }
    try {
      exportToCsv(data, {
        org: this.org,
        repo: this.repo,
        filterName: this.selectedFilterType,
      });
      this.showNotification(t('NOTIFY_SUCCESS'), t('NOTIFY_EXPORT_SUCCESS'), 'success');
    } catch (e) {
      this.showNotification(t('NOTIFY_ERROR'), t('NOTIFY_EXPORT_ERROR'), 'danger');
    }
  };
}
customElements.define(EL_NAME, NxMediaLibrary);

function setupMediaLibrary(el) {
  let cmp = document.querySelector(EL_NAME);
  if (!cmp) {
    cmp = document.createElement(EL_NAME);
    el.append(cmp);
  }

  const hash = parseSitePathFromHash(window.location.hash);
  cmp.sitePath = hash ? normalizeSitePath(hash) : '';
}

let hashChangeHandler = null;
let popstateHandler = null;

export default function init(el) {
  document.title = 'Media Library';
  el.innerHTML = '';

  if (hashChangeHandler) {
    window.removeEventListener('hashchange', hashChangeHandler);
  }
  if (popstateHandler) {
    window.removeEventListener('popstate', popstateHandler);
  }

  hashChangeHandler = (e) => {
    const cmp = el.querySelector(EL_NAME);
    if (!cmp) {
      setupMediaLibrary(el, e);
      return;
    }

    const { sitePath: newSitePath } = parseRouteState();

    const normalizedNew = normalizeSitePath(newSitePath);
    const normalizedCurrent = normalizeSitePath(cmp.sitePath);

    if (normalizedNew !== normalizedCurrent) {
      setupMediaLibrary(el, e);
    } else {
      // eslint-disable-next-line no-underscore-dangle
      cmp._hydrateStateFromUrl();
    }
  };

  // Handle browser back/forward when only query params change (hash unchanged)
  popstateHandler = () => {
    const currentHash = window.location.hash;
    const cmp = el.querySelector(EL_NAME);

    if (cmp && currentHash === `#${cmp.sitePath}`) {
      // Only params changed, re-hydrate
      // eslint-disable-next-line no-underscore-dangle
      cmp._hydrateStateFromUrl();
    }
    // If hash changed, hashchange event will handle it
  };

  window.addEventListener('hashchange', hashChangeHandler);
  window.addEventListener('popstate', popstateHandler);
  setupMediaLibrary(el);
}
