import { html, LitElement } from 'da-lit';
import getStyle from '../../utils/styles.js';
import { loadMediaSheet, buildMediaIndexStructures } from './indexing/load.js';
import { copyMediaToClipboard, exportToCsv } from './display/features/export.js';
import { startDisplayLoader, stopDisplayLoader } from './display/loader.js';
import {
  validateSitePath, getBasePath, resolveAbsolutePath, normalizeSitePath, parseSitePathFromHash,
  parseRouteState, buildUrlWithState,
} from './core/paths.js';
import { saveRecentSite } from './core/browser-storage.js';
import {
  getCanonicalMediaTimestamp,
  sortMediaData,
  deduplicateMediaByHash,
} from './core/utils.js';
import {
  ensureAuthenticated,
  checkSiteAuthRequired,
  livePreviewLogin,
} from './display/utils.js';
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
} from './display/features/filters.js';
import { loadPinnedFolders, savePinnedFolders } from './display/features/pin.js';
import {
  getAppState, updateAppState, onStateChange, showNotification, dismissNotification,
} from './core/state.js';
import { t } from './core/messages.js';
import { fetchSidekickConfig } from './indexing/admin-api.js';
import '../../public/sl/components.js';
import './display/components/topbar/topbar.js';
import './display/components/sidebar/sidebar.js';
import './display/components/grid/grid.js';
import './display/components/mediainfo/mediainfo.js';
import './views/onboard/onboard.js';

const EL_NAME = 'nx-media-library';
const nx = `${new URL(import.meta.url).origin}/nx`;
const sl = await getStyle(`${nx}/public/sl/styles.css`);
const slComponents = await getStyle(`${nx}/public/sl/components.css`);
const topbarStyles = await getStyle(`${nx}/blocks/media-library/display/components/topbar/topbar.css`);
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

const MEDIA_LIBRARY_STATE_KEYS = [
  'searchQuery',
  'selectedFilterType',
  'selectedFolder',
  'selectedDocument',
  'selectedMediaKey',
  'selectedMediaTab',
  'mediaData',
  'processedData',
  'progressiveMediaData',
  'progressiveTotalCount',
  'progressiveCountCapped',
  'isIndexing',
  'isBackgroundRefreshInProgress',
  'isValidating',
  'isLoadingData',
  'isProgressiveLoading',
  'sitePathValid',
  'validationError',
  'validationSuggestion',
  'indexLockedByOther',
  'indexMissing',
  'persistentError',
  'notification',
  'usageIndex',
];
const MEDIA_LIBRARY_CACHE_KEYS = [
  'searchQuery',
  'selectedFilterType',
  'selectedFolder',
  'selectedDocument',
  'selectedMediaKey',
  'selectedMediaTab',
  'mediaData',
  'processedData',
  'progressiveMediaData',
  'progressiveTotalCount',
  'progressiveCountCapped',
  'isIndexing',
];

class NxMediaLibrary extends LitElement {
  static properties = {
    sitePath: { state: true },
    _appState: { state: true },
  };

  constructor() {
    super();
    this._appState = getAppState();
    this._filteredDataCache = null;
    this._displayDataCache = null;
    this._resultSummaryCache = null;
    this._unsubscribe = null;
    this._urlSyncDebounce = null;
    this._isApplyingUrlState = false;
    this._urlStateUnsubscribe = null;
    this._modalResolveUnsubscribe = null;
    this._hasHydrated = false;
  }

  connectedCallback() {
    super.connectedCallback();
    installMediaLibraryShellStyles();
    this.shadowRoot.adoptedStyleSheets = [sl, slComponents, topbarStyles, styles];

    this._unsubscribe = onStateChange(MEDIA_LIBRARY_STATE_KEYS, (state) => {
      this._appState = state;
    });

    this._urlStateUnsubscribe = onStateChange([
      'searchQuery', 'selectedFilterType', 'selectedFolder',
      'selectedDocument', 'selectedMediaKey', 'selectedMediaTab',
    ], () => this._syncStateToUrl());

    this._modalResolveUnsubscribe = onStateChange(['mediaData', 'progressiveMediaData'], () => {
      const state = getAppState();
      if (state.selectedMediaKey) this._attemptModalResolution();
    });

    // Start display loader (always, regardless of indexing mode)
    if (this.sitePath) {
      startDisplayLoader(this.sitePath, ({ data, error }) => {
        if (error) {
          if (error.message === 'No index metadata found') {
            updateAppState({
              indexMissing: true,
              mediaData: [],
            });
          } else {
            showNotification(t('NOTIFY_ERROR'), error.message || 'Failed to load', 'danger');
          }
        } else {
          this.setMediaData(data);
        }
      });
    }

    document.querySelector('.nx-app')?.classList.add('has-media-library');
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._messageTimeout) {
      clearTimeout(this._messageTimeout);
    }

    if (this._unsubscribe) {
      this._unsubscribe();
    }
    if (this._urlStateUnsubscribe) {
      this._urlStateUnsubscribe();
    }
    if (this._modalResolveUnsubscribe) {
      this._modalResolveUnsubscribe();
    }
    if (this._urlSyncDebounce) {
      clearTimeout(this._urlSyncDebounce);
    }

    // Stop display loader
    stopDisplayLoader();

    document.querySelector('.nx-app')?.classList.remove('has-media-library');
  }

  willUpdate(changedProperties) {
    if (changedProperties.has('_appState')) {
      const oldState = changedProperties.get('_appState') || {};
      const didMediaViewChange = MEDIA_LIBRARY_CACHE_KEYS.some(
        (key) => oldState[key] !== this._appState[key],
      );

      if (didMediaViewChange) {
        this._filteredDataCache = null;
        this._displayDataCache = null;
        this._resultSummaryCache = null;
      }
    }
  }

  update(changedProperties) {
    if (changedProperties.has('sitePath')) {
      clearMediaHashRuntimeHost();
      this._filteredDataCache = null;
      this._displayDataCache = null;
      this._resultSummaryCache = null;

      const prevSitePath = changedProperties.get('sitePath');
      if (prevSitePath !== this.sitePath) {
        this.shadowRoot.querySelector('nx-media-info')?.close?.();
        updateAppState({
          selectedMediaKey: null,
          selectedMediaTab: 'usage',
        });
      }

      if (this.sitePath) {
        updateAppState({
          mediaData: [],
          processedData: null,
          indexLockedByOther: false,
          isBackgroundRefreshInProgress: false,
        });
        this.resetSearchState();
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
    if (!this._hasHydrated && changedProperties.has('_appState')) {
      const state = this._appState;
      // Trigger hydration when site validated and loading complete (even if empty)
      if (state.sitePathValid && !state.isLoadingData && !state.isValidating) {
        this._hasHydrated = true;
        this._hydrateStateFromUrl();
      }
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
      this._appState.mediaData,
      {
        searchQuery: this._appState.searchQuery,
        selectedDocument: this._appState.selectedDocument,
        selectedFolder: this._appState.selectedFolder,
        selectedFilterType: this._appState.selectedFilterType,
        processedData: this._appState.processedData,
        org: this._appState.org,
        repo: this._appState.repo,
      },
    );

    return this._filteredDataCache;
  }

  get displayMediaData() {
    if (this._displayDataCache !== null) {
      return this._displayDataCache;
    }

    const filteredData = this.filteredMediaData;
    const hasData = this._appState.mediaData?.length > 0;
    const hasProgressiveData = this._appState.progressiveMediaData?.length > 0;

    let displayData = filteredData;
    if (this._appState.isIndexing && hasProgressiveData && !hasData) {
      const progressiveData = this._appState.progressiveMediaData;
      const filteredProgressiveData = this.filterProgressiveData(progressiveData);
      const merged = this.mergeDataForDisplay(
        filteredData,
        filteredProgressiveData,
      );
      displayData = merged;
    } else if (filteredData?.length > 0) {
      if (this._appState.isProgressiveLoading) {
        displayData = filteredData;
      } else {
        displayData = sortMediaData(filteredData);
      }
    }

    // Deduplicate by hash when not viewing a specific document/folder
    // (preserves all usages when viewing document/folder-specific media)
    const { selectedDocument, selectedFolder } = this._appState;
    if (!selectedDocument && !selectedFolder && displayData?.length > 0) {
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
    if (this._appState.isIndexing && this._appState.progressiveMediaData?.length > 0) {
      const progressiveData = this._appState.progressiveMediaData;
      const filteredProgressiveData = this.filterProgressiveData(progressiveData);
      let merged = this.mergeDataForDisplay(
        this.filteredMediaData,
        filteredProgressiveData,
      );
      // Apply deduplication to count if not viewing specific document/folder
      const { selectedDocument, selectedFolder } = this._appState;
      if (!selectedDocument && !selectedFolder) {
        merged = deduplicateMediaByHash(merged);
      }
      opts.displayCount = merged.length;
      opts.displayCountCapped = !!this._appState.progressiveCountCapped;
    }

    // Get deduplicated filtered data for accurate count
    let countData = this.filteredMediaData;
    const { selectedDocument, selectedFolder } = this._appState;
    if (!selectedDocument && !selectedFolder && countData?.length > 0) {
      countData = deduplicateMediaByHash(countData);
    }

    this._resultSummaryCache = computeResultSummary(
      this._appState.mediaData,
      countData,
      this._appState.searchQuery,
      this._appState.selectedFilterType,
      opts,
    );

    return this._resultSummaryCache;
  }

  filterProgressiveData(progressiveData) {
    if (!progressiveData || progressiveData.length === 0) return progressiveData;

    // Apply the same filtering logic as filteredMediaData
    return filterMedia(progressiveData, {
      searchQuery: this._appState.searchQuery,
      selectedDocument: this._appState.selectedDocument,
      selectedFolder: this._appState.selectedFolder,
      selectedFilterType: this._appState.selectedFilterType,
      processedData: this._appState.processedData,
      org: this._appState.org,
      repo: this._appState.repo,
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
      const targetState = {};

      // Parse filter param (may be overridden by doc/folder)
      const filter = params.get('filter');
      targetState.selectedFilterType = (filter && VALID_FILTERS.has(filter))
        ? filter : DEFAULT_FILTER;

      const doc = params.get('doc');
      const folder = params.get('folder');
      const q = params.get('q');

      // Apply precedence with derived filter semantics
      if (doc) {
        targetState.searchQuery = '';
        targetState.selectedFolder = null;
        targetState.selectedDocument = doc; // Already absolute from URL
        targetState.selectedFilterType = 'documentTotal'; // Derived semantic
      } else if (folder) {
        targetState.searchQuery = '';
        targetState.selectedFolder = folder; // Already absolute from URL
        targetState.selectedDocument = null;
        targetState.selectedFilterType = 'images'; // Derived semantic
      } else if (q) {
        targetState.searchQuery = q;
        targetState.selectedFolder = null;
        targetState.selectedDocument = null;
        // selectedFilterType uses filter param or default
      } else {
        // General browsing - clear navigation state
        targetState.searchQuery = '';
        targetState.selectedFolder = null;
        targetState.selectedDocument = null;
      }

      // Parse modal state
      const mediaKey = params.get('media');
      targetState.selectedMediaKey = mediaKey || null;

      const tab = params.get('tab');
      targetState.selectedMediaTab = (tab === 'metadata') ? 'metadata' : 'usage';

      // Batch update state
      updateAppState(targetState);

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
    const state = getAppState();
    if (!state.selectedMediaKey) return;

    let sourceData = state.mediaData;

    if ((!sourceData || sourceData.length === 0) && state.progressiveMediaData?.length > 0) {
      sourceData = state.progressiveMediaData;
    }

    if (!sourceData || sourceData.length === 0) return;

    const matchedItem = sourceData.find((item) => {
      const key = getDedupeKey(item.url);
      return key === state.selectedMediaKey;
    });

    if (matchedItem && isUiExcludedMediaItem(matchedItem)) {
      updateAppState({ selectedMediaKey: null });
      this.shadowRoot.querySelector('nx-media-info')?.close?.();
      return;
    }

    if (matchedItem) {
      const modal = this.shadowRoot.querySelector('nx-media-info');
      const dialogEl = modal?.shadowRoot?.querySelector('dialog');
      const dialogOpen = dialogEl?.open === true;
      if (dialogOpen && modal?.media?.url) {
        const currentKey = getDedupeKey(modal.media.url);
        if (currentKey === state.selectedMediaKey) {
          return;
        }
      }
      modal.show({
        media: matchedItem,
        usageData: state.usageIndex?.get(getDedupeKey(matchedItem.url)) || [],
        org: state.org,
        repo: state.repo,
        isIndexing: state.isIndexing,
        initialTab: state.selectedMediaTab,
      });
    }
  }

  _syncStateToUrl() {
    if (this._isApplyingUrlState) return;

    clearTimeout(this._urlSyncDebounce);
    this._urlSyncDebounce = setTimeout(() => {
      const state = getAppState();

      // Guard: don't write URL until sitePath is initialized AND hydration has completed
      if (!state.sitePath || !this._hasHydrated) return;

      const params = new URLSearchParams();

      // Doc/folder have implied filters - don't write filter param
      if (state.selectedDocument) {
        params.set('doc', state.selectedDocument);
        // Omit filter - doc implies documentTotal
      } else if (state.selectedFolder) {
        params.set('folder', state.selectedFolder);
        // Omit filter - folder implies images
      } else {
        // General browsing - write filter if not default
        if (state.selectedFilterType && state.selectedFilterType !== DEFAULT_FILTER) {
          params.set('filter', state.selectedFilterType);
        }
        if (state.searchQuery) {
          params.set('q', state.searchQuery);
        }
      }

      // Modal state
      if (state.selectedMediaKey) {
        params.set('media', state.selectedMediaKey); // URLSearchParams handles encoding
        if (state.selectedMediaTab !== 'usage') {
          params.set('tab', state.selectedMediaTab);
        }
      }

      const newUrl = buildUrlWithState(state.sitePath, params);
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

    updateAppState({
      sitePath: this.sitePath,
      org: this.org,
      repo: this.repo,
      isIndexing: false,
      isBackgroundRefreshInProgress: false,
      indexLockedByOther: false,
      isValidating: true,
      sitePathValid: false,
      validationError: null,
      validationSuggestion: null,
      persistentError: null,
    });

    try {
      const isAuthenticated = await ensureAuthenticated();
      if (!isAuthenticated) return;

      const validation = await validateSitePath(this.sitePath);

      if (!validation.valid) {
        updateAppState({
          isValidating: false,
          validationError: validation.error,
          validationSuggestion: validation.suggestion,
          sitePathValid: false,
        });
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

      updateAppState({
        sitePathValid: true,
        validationError: null,
        validationSuggestion: null,
        persistentError: this.siteAuthInfo?.authFailed
          ? 'Protected site - some images may not load, refresh or login into site in a new tab using sidekick'
          : null,
        isValidating: false,
      });

      saveRecentSite(this.sitePath);
      await this.loadMediaData();
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
      updateAppState({ isLoadingData: true });

      const isAuthenticated = await ensureAuthenticated();
      if (!isAuthenticated) {
        updateAppState({ isLoadingData: false });
        return;
      }

      // Progressive chunk loading callback
      let accumulatedData = [];
      let chunk0Rendered = false;

      const onProgressiveChunk = (chunkData, chunkIndex, totalChunks) => {
        // Accumulate data from each chunk
        accumulatedData = [...accumulatedData, ...chunkData];

        // Only render chunk 0 immediately for perceived performance
        // Skip deduplication for remaining chunks to avoid O(n²) behavior
        if (chunkIndex === 0 && !chunk0Rendered) {
          chunk0Rendered = true;
          // Set progressive loading flag to show spinner while remaining chunks load
          if (totalChunks > 1) {
            updateAppState({ isProgressiveLoading: true });
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
        updateAppState({
          isLoadingData: false,
          isProgressiveLoading: false,
          isIndexing: false,
          isBackgroundRefreshInProgress: false,
          indexLockedByOther: true,
          indexMissing: true,
          persistentError: null,
        });
        return;
      }

      updateAppState({
        persistentError: null,
        indexMissing: !!indexMissing,
        indexLockedByOther: false,
        isBackgroundRefreshInProgress: !!(data?.length > 0) && !!lockFresh,
      });

      const finalData = accumulatedData.length > 0 ? accumulatedData : data;
      await this.setMediaData(finalData);
      updateAppState({ isLoadingData: false, isProgressiveLoading: false });
    } catch (error) {
      updateAppState({
        isLoadingData: false,
        isProgressiveLoading: false,
        isBackgroundRefreshInProgress: false,
      });

      const { MediaLibraryError, ErrorCodes } = await import('./core/errors.js');
      if (error instanceof MediaLibraryError) {
        const persistentCodes = [
          ErrorCodes.INDEX_PARSE_ERROR,
          ErrorCodes.DA_READ_DENIED,
        ];
        const isPersistent = persistentCodes.includes(error.code);
        updateAppState({
          persistentError: isPersistent ? { message: error.message } : null,
          sitePathValid: true,
          indexMissing: false,
        });
        await this.setMediaData([]);
        if (!isPersistent) {
          showNotification(t('NOTIFY_ERROR'), error.message, 'danger');
        }
      } else {
        // eslint-disable-next-line no-console
        console.error('[MEDIA-LIB:loadMediaData]', error);
        updateAppState({
          validationError: 'Failed to load media data. Please ensure you are signed in.',
          sitePathValid: false,
        });
      }
    }
  }

  async setMediaData(rawData) {
    const isEmpty = !rawData || rawData.length === 0;

    if (isEmpty) {
      updateAppState({
        mediaData: [],
        usageIndex: new Map(),
        processedData: initializeProcessedData(),
      });
      this._filteredDataCache = null;
      this._displayDataCache = null;
      this._resultSummaryCache = null;
      return;
    }

    updateAppState({ indexLockedByOther: false });
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

    updateAppState({
      mediaData: enrichedMediaData,
      usageIndex,
      processedData,
    });

    this._filteredDataCache = null;
    this._displayDataCache = null;
    this._resultSummaryCache = null;
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
            <p class="indexing-message">${t('UI_DISCOVERING')}</p>
          </div>
        </div>
      `;
    }

    if (!this._appState.sitePathValid && this._appState.validationError) {
      return this.renderErrorState();
    }

    return html`
      <div class="media-library">
        <h1 class="sr-only">Media Library</h1>
        <div class="sidebar">
          <nx-media-sidebar
            @filter=${this.handleFilter}
            @export-csv=${this.handleExportCsv}
          ></nx-media-sidebar>
        </div>

        <div class="top-bar">
          <nx-media-topbar
            .searchQuery=${this._appState.searchQuery}
            .resultSummary=${this.resultSummary}
            .selectedFolder=${this._appState.selectedFolder}
            .selectedDocument=${this._appState.selectedDocument}
            .selectedFilterType=${this._appState.selectedFilterType}
            .mediaData=${this._appState.mediaData}
            .processedData=${this._appState.processedData}
            .isIndexing=${this._appState.isIndexing}
            .isBackgroundRefreshInProgress=${this._appState.isBackgroundRefreshInProgress}
            .isProgressiveLoading=${this._appState.isProgressiveLoading}
            .org=${this._appState.org}
            .repo=${this._appState.repo}
            @search=${this.handleSearch}
            @clear-search=${this.handleClearSearch}
            @pin-search=${this.handlePinFolder}
          ></nx-media-topbar>
        </div>

        <div class="content">
          ${this._appState.persistentError ? html`
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
              <p class="da-persistent-banner-message">${this._appState.persistentError.message}</p>
            </div>
          ` : ''}
          ${this.renderCurrentView()}
        </div>

        <nx-media-info
          @modal-open=${(e) => {
            updateAppState({
              selectedMediaKey: getDedupeKey(e.detail.media.url),
              selectedMediaTab: e.detail.tab,
            });
          }}
          @tab-change=${(e) => {
            updateAppState({ selectedMediaTab: e.detail.tab });
          }}
          @modal-close=${() => {
            updateAppState({
              selectedMediaKey: null,
              selectedMediaTab: 'usage',
            });
          }}
        ></nx-media-info>

        ${this._appState.notification ? html`
          <div class="da-notification-status">
            <div class="toast-notification ${this._appState.notification.type || 'success'}">
              <div class="toast-notification-header">
                <p class="da-notification-status-title">${this._appState.notification.heading || t('NOTIFY_INFO')}</p>
                <button
                  type="button"
                  class="toast-notification-close"
                  aria-label="${t('UI_DISMISS')}"
                  @click=${this.handleDismissNotification}
                >
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
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

    // Show loading state when initially loading data (before any chunks arrive)
    if (this._appState.isLoadingData && !hasData) {
      return this.renderIndexingState();
    }

    // Only show "Discovering..." full-screen state when truly no data exists
    // Keep cards visible during incremental builds - top bar spinner indicates progress
    // This ensures instant perceived performance when refreshing with existing data
    if (this._appState.isIndexing && !hasData && !hasProgressiveData) {
      return this.renderIndexingState();
    }

    // Show empty state only when not loading and no data exists
    if (!hasData && !this._appState.isIndexing && !this._appState.isLoadingData) {
      if (this._appState.indexLockedByOther) {
        return this.renderIndexLockedState();
      }
      return this.renderEmptyState();
    }

    if (hasData && !hasFilteredData && !this._appState.isIndexing) {
      return this.renderEmptyState();
    }

    const displayData = this.displayMediaData;

    const resultsBusy = !!(this._appState.isIndexing
      || this._appState.isBackgroundRefreshInProgress
      || this._appState.isProgressiveLoading
      || this._appState.isLoadingData);

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
          <p>${this._appState.validationError}</p>
          ${this._appState.validationSuggestion ? html`<p class="error-suggestion">${this._appState.validationSuggestion}</p>` : ''}
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
    if (this._appState.indexMissing) {
      return html`
        <div class="empty-state">
          <h3>${t('INDEX_MISSING')}</h3>
          <p>${t('INDEX_MISSING_HINT')}</p>
        </div>
      `;
    }
    const filterLabel = getFilterLabel(this._appState.selectedFilterType, 0);
    let message = t('UI_NO_ITEMS_FOUND', { filterLabel });

    if (this._appState.searchQuery) {
      const colonSyntax = parseColonSyntax(this._appState.searchQuery);

      if (colonSyntax) {
        const { field, value } = colonSyntax;

        if (field === 'folder') {
          const folderPath = value || '/';
          message = t('UI_NO_ITEMS_IN_PATH', { filterLabel, path: folderPath });
        } else if (field === 'doc') {
          const docPath = value.replace(/\.html$/, '');
          message = t('UI_NO_ITEMS_IN_PATH', { filterLabel, path: docPath });
        } else {
          message = t('UI_NO_ITEMS_MATCHING', { filterLabel, query: this._appState.searchQuery });
        }
      } else {
        message = t('UI_NO_ITEMS_MATCHING', { filterLabel, query: this._appState.searchQuery });
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
    dismissNotification();
  }

  handleDismissBanner() {
    updateAppState({ persistentError: null });
  }

  handleDocNavigation(path) {
    if (path) {
      updateAppState({
        selectedDocument: resolveAbsolutePath(path),
      });
    }
  }

  handleFolderNavigation(path) {
    if (path) {
      updateAppState({
        selectedFolder: resolveAbsolutePath(path, true),
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
      showNotification(t('NOTIFY_ALREADY_PINNED'), t('NOTIFY_ALREADY_PINNED_MSG', { folder }), 'danger');
      return;
    }

    const pinnedFolder = { path: fullPath };

    const updatedPinnedFolders = [...pinnedFolders, pinnedFolder];
    savePinnedFolders(updatedPinnedFolders, this.org, this.repo);

    showNotification(t('NOTIFY_FOLDER_PINNED'), t('NOTIFY_FOLDER_PINNED_MSG', { folder }));
  }

  handleSearch(e) {
    const { query, type, path } = e.detail;

    if (!query || !query.trim()) {
      updateAppState({
        searchQuery: '',
        selectedDocument: null,
        selectedFolder: null,
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
      }
    }

    const hasDocOrFolderPath = searchPath != null && String(searchPath).trim() !== '';

    if (searchType === 'doc' && hasDocOrFolderPath) {
      updateAppState({ searchQuery: '', selectedFolder: null });
      this.handleDocNavigation(String(searchPath).trim());
    } else if (searchType === 'folder' && hasDocOrFolderPath) {
      updateAppState({ searchQuery: '', selectedDocument: null });
      this.handleFolderNavigation(String(searchPath).trim());
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
      selectedFolder: null,
      selectedDocument: null,
    });
  }

  async handleMediaClick(e) {
    const { media } = e.detail;
    if (!media) return;

    const groupingKey = getDedupeKey(media.url);
    const usageData = this._appState.usageIndex?.get(groupingKey) || [];

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
      isIndexing: this._appState.isIndexing,
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
      showNotification(result.heading, result.message, isError ? 'danger' : 'success');
    } catch (_) {
      showNotification(t('NOTIFY_ERROR'), t('NOTIFY_COPY_ERROR'), 'danger');
    }
  }

  handleExportCsv = () => {
    const filteredData = this.filteredMediaData;
    let data = filteredData;
    if (this._appState.isIndexing && this._appState.progressiveMediaData?.length > 0) {
      const progressiveData = this._appState.progressiveMediaData;
      const filteredProgressiveData = this.filterProgressiveData(progressiveData);
      data = this.mergeDataForDisplay(
        filteredData,
        filteredProgressiveData,
      );
    } else if (data?.length > 0 && !this._appState.isProgressiveLoading) {
      data = sortMediaData(data);
    }
    if (!data || data.length === 0) {
      showNotification(t('NOTIFY_INFO'), t('NOTIFY_EXPORT_NO_DATA'), 'info');
      return;
    }
    try {
      exportToCsv(data, {
        org: this.org,
        repo: this.repo,
        filterName: this._appState.selectedFilterType,
      });
      showNotification(t('NOTIFY_SUCCESS'), t('NOTIFY_EXPORT_SUCCESS'), 'success');
    } catch (e) {
      showNotification(t('NOTIFY_ERROR'), t('NOTIFY_EXPORT_ERROR'), 'danger');
    }
  };
}
customElements.define(EL_NAME, NxMediaLibrary);

let hashChangeHandler = null;
let popstateHandler = null;
let indexingWorker = null;

function setupMediaLibrary(el) {
  let cmp = document.querySelector(EL_NAME);
  if (!cmp) {
    cmp = document.createElement(EL_NAME);
    el.append(cmp);
  }

  const hash = parseSitePathFromHash(window.location.hash);
  cmp.sitePath = hash ? normalizeSitePath(hash) : '';

  // Send init to worker if enabled and sitePath available
  if (indexingWorker && cmp.sitePath) {
    const [, org, repo] = cmp.sitePath.split('/');
    indexingWorker.postMessage({
      type: 'init',
      data: { sitePath: cmp.sitePath, org, repo },
    });
  }
}

function handleWorkerMessage(event) {
  const {
    type, progress, result, error,
  } = event.data;

  switch (type) {
    case 'init-complete':
      // eslint-disable-next-line no-console
      console.log('[MediaLibrary:Worker] Initialized');
      break;

    case 'progress':
      // Set indexing flag on first progress message
      if (progress.stage && !getAppState().isIndexing) {
        updateAppState({
          isIndexing: true,
          indexProgress: { stage: 'starting', message: '' },
        });
      }

      // Handle progressive data streaming during build
      if (progress.progressiveData) {
        updateAppState({
          progressiveMediaData: progress.progressiveData,
          progressiveTotalCount: progress.totalCount,
          progressiveCountCapped: progress.countCapped,
        });
      } else if (progress.stage) {
        // Progress stage update
        updateAppState({
          indexProgress: {
            stage: progress.stage,
            message: progress.message || '',
          },
        });
      }
      break;

    case 'complete':
      // eslint-disable-next-line no-console
      console.log('[MediaLibrary:Worker] Build complete', result);

      // Clear indexing state - display loader will pick up the changes
      updateAppState({
        isIndexing: false,
        progressiveMediaData: [],
        progressiveTotalCount: null,
        progressiveCountCapped: false,
        indexProgress: null,
      });
      break;

    case 'error':
      // eslint-disable-next-line no-console
      console.error('[MediaLibrary:Worker] Build error:', error);

      updateAppState({
        isIndexing: false,
        progressiveMediaData: [],
        progressiveTotalCount: null,
        progressiveCountCapped: false,
        indexProgress: null,
      });

      showNotification(t('NOTIFY_ERROR'), error || 'Build failed', 'danger');
      break;

    default:
      // eslint-disable-next-line no-console
      console.warn('[MediaLibrary:Worker] Unknown message type:', type);
  }
}

function setupWorkerHandlers() {
  if (!indexingWorker) return;

  // Handle worker messages
  indexingWorker.onmessage = (event) => {
    handleWorkerMessage(event);
  };

  // Handle worker errors
  indexingWorker.onerror = (error) => {
    // eslint-disable-next-line no-console
    console.error('[MediaLibrary] Indexing worker error:', error);

    // Respawn worker after delay
    indexingWorker = null;
    setTimeout(() => {
      // eslint-disable-next-line no-console
      console.log('[MediaLibrary] Respawning indexing worker');
      // eslint-disable-next-line no-use-before-define
      initializeIndexingWorker();
    }, 30000); // 30s delay
  };
}

// Bundle worker code by inlining all imports (for nx=local CORS workaround)
async function bundleWorkerCode(entryPointUrl) {
  const modules = new Map(); // url -> { code, imports: [{names, path, url}] }

  async function fetchModule(url) {
    if (modules.has(url)) return;

    const response = await fetch(url);
    if (!response.ok) {
      // eslint-disable-next-line no-console
      console.error(`[Worker Bundle] Failed to fetch module: ${url} (${response.status})`);
      throw new Error(`Failed to fetch module: ${url}`);
    }
    const code = await response.text();

    // Extract imports before processing
    const imports = [];
    const importRegex = /import\s+(\{[^}]+\}|[\w*]+(?:\s+as\s+\w+)?|\*\s+as\s+\w+)\s+from\s+['"](.+?)['"]/g;
    let match;
    // eslint-disable-next-line no-cond-assign
    while ((match = importRegex.exec(code)) !== null) {
      const names = match[1];
      const path = match[2];
      const importUrl = new URL(path, url).href;
      imports.push({ names, path, url: importUrl });
      // Recursively fetch this dependency
      await fetchModule(importUrl);
    }

    modules.set(url, { code, imports });
  }

  await fetchModule(entryPointUrl);

  // Create bundle with simple module system
  let bundled = `
// Bundled worker module system (nx=local CORS workaround)
const __modules = {};
const __cache = {};

function __loadModule(url) {
  if (__cache[url]) return __cache[url];

  const exports = {};
  const module = { exports };

  if (__modules[url]) {
    __modules[url](module, exports);
    __cache[url] = module.exports;
    return module.exports;
  }

  console.error('[Worker] Module not found:', url);
  return {};
}
`;

  // Register each module as a function
  modules.forEach((mod, url) => {
    let { code } = mod;

    // Replace import statements with __loadModule calls
    mod.imports.forEach(({ names, path, url: importUrl }) => {
      const importStatement = `import\\s+${names.replace(/[{}*]/g, (ch) => `\\${ch}`)}\\s+from\\s+['"]${path.replace(/\./g, '\\.')}['"];?`;

      // Handle different import styles
      if (names.startsWith('{')) {
        // Named imports: import { a, b } from './x'
        const namedImports = names.slice(1, -1).trim();
        code = code.replace(
          new RegExp(importStatement, 'g'),
          `const { ${namedImports} } = __loadModule('${importUrl}');`,
        );
      } else if (names.includes('*')) {
        // Namespace import: import * as x from './x'
        const nsName = names.match(/\*\s+as\s+(\w+)/)?.[1] || 'ns';
        code = code.replace(
          new RegExp(importStatement, 'g'),
          `const ${nsName} = __loadModule('${importUrl}');`,
        );
      } else {
        // Default import: import x from './x'
        code = code.replace(
          new RegExp(importStatement, 'g'),
          `const ${names} = __loadModule('${importUrl}').default || __loadModule('${importUrl}');`,
        );
      }
    });

    // Transform export statements to module.exports
    // export default X -> module.exports.default = X
    code = code.replace(/export\s+default\s+/g, 'module.exports.default = ');

    // export function foo() -> module.exports.foo = function foo()
    code = code.replace(/export\s+function\s+(\w+)/g, 'module.exports.$1 = function $1');

    // export const/let/var x = y -> module.exports.x = y; const x = module.exports.x
    code = code.replace(/export\s+(const|let|var)\s+(\w+)\s*=/g, 'module.exports.$2 = ');

    // export class X -> module.exports.X = class X
    code = code.replace(/export\s+class\s+(\w+)/g, 'module.exports.$1 = class $1');

    // export async function foo() -> module.exports.foo = async function foo()
    code = code.replace(/export\s+async\s+function\s+(\w+)/g, 'module.exports.$1 = async function $1');

    // export { a, b } -> module.exports.a = a; module.exports.b = b;
    code = code.replace(
      /export\s*\{([^}]+)\}/g,
      (match, names) => names.split(',').map((n) => `module.exports.${n.trim()} = ${n.trim()};`).join('\n'),
    );

    // Wrap module in function
    bundled += `
__modules['${url}'] = function(module, exports) {
${code}
};
`;
  });

  // Execute entry point
  bundled += `
// Execute entry point
__loadModule('${entryPointUrl}');
`;

  return bundled;
}

async function initializeIndexingWorker() {
  if (indexingWorker) {
    return; // Already initialized
  }

  try {
    // Use path relative to page origin to avoid CORS when proxied through da.live
    const workerPath = '/nx/blocks/media-library/indexing/indexer-worker.js';
    indexingWorker = new Worker(workerPath, { type: 'module' });

    setupWorkerHandlers();

    // eslint-disable-next-line no-console
    console.log('[MediaLibrary] Indexing worker initialized');
  } catch (error) {
    // CORS error when using nx=local - fall back to bundled blob worker
    // eslint-disable-next-line no-console
    console.warn('[MediaLibrary] Direct worker failed, trying bundled blob fallback:', error.message);

    try {
      // Use absolute URL for bundler (needs full URL to fetch imports)
      const workerPath = `${window.location.origin}/nx/blocks/media-library/indexing/indexer-worker.js`;
      const bundledCode = await bundleWorkerCode(workerPath);

      // Create blob URL with bundled code (same-origin)
      const blob = new Blob([bundledCode], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);

      // Use classic worker (not module) since code is now bundled
      indexingWorker = new Worker(blobUrl);

      setupWorkerHandlers();

      // eslint-disable-next-line no-console
      console.log('[MediaLibrary] Indexing worker initialized via bundled blob fallback');
    } catch (fallbackError) {
      // eslint-disable-next-line no-console
      console.error('[MediaLibrary] Failed to initialize indexing worker (bundled blob):', fallbackError);
    }
  }
}

export default function init(el, options = {}) {
  // Auto-detect app mode: if URL contains /apps/media-library, enable indexing
  // Can be overridden by explicit options.enableIndexing
  const isAppMode = window.location.pathname.includes('/apps/media-library');
  const enableIndexing = options.enableIndexing !== undefined
    ? options.enableIndexing
    : isAppMode;

  document.title = 'Media Library';
  el.innerHTML = '';

  // Initialize indexing worker (app mode)
  if (enableIndexing) {
    // eslint-disable-next-line no-console
    console.log('[MediaLibrary] App mode detected - initializing indexing worker');
    initializeIndexingWorker();
  }

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
