import { html, LitElement } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import getSvg from '../../../../utils/svg.js';
import {
  getSubtype,
  isImage,
  isVideo,
  isPdfUrl,
  isExternalVideoUrl,
  getVideoEmbedUrl,
  convertEmbedToWatchUrl,
  EXIFR_URL,
  getMediaType,
  getImageOrientation,
} from '../../core/media.js';
import { formatFileSize, getFileName, optimizeImageUrls } from '../../core/files.js';
import { getMediaCardLabel } from '../../features/templates.js';
import { copyMediaToClipboard } from '../../core/export.js';
import {
  parseMediaUrl,
  normalizeUrl,
  isExternalUrl,
  resolveMediaUrl,
  preferPreviewForMediaUrl,
  isPreviewPreferredForMediaUrl,
  getDedupeKey,
  etcFetch,
  convertToAemPage,
} from '../../core/urls.js';
import { getAppState } from '../../core/state.js';
import { getEditUrl, getViewUrl, formatDocPath } from '../../core/paths.js';
import { formatDateTime } from '../../core/utils.js';
import loadScript from '../../../../utils/script.js';
import { daFetch } from '../../../../utils/daFetch.js';
import { DA_ORIGIN, SUPPORTED_FILES } from '../../../../public/utils/constants.js';
import { Domains, MediaType } from '../../core/constants.js';
import { t } from '../../core/messages.js';

const styles = await getStyle(import.meta.url);
const iconsBase = new URL('../../../../img/icons/', import.meta.url).href;

const ICONS = [
  `${iconsBase}S2_Icon_PDF_20_N.svg`,
  `${iconsBase}S2_Icon_AIGenReferenceImage_20_N.svg`,
  `${iconsBase}C_Icon_Image_Info.svg`,
  `${iconsBase}S2_Icon_OpenIn_20_N.svg`,
  `${iconsBase}S2_Icon_AdobeExpressSolid_20_N.svg`,
  `${iconsBase}S2_Icon_ChevronRight_20_N.svg`,
  `${iconsBase}S2_Icon_Close_20_N.svg`,
  `${iconsBase}C_Icon_Fragment.svg`,
  `${iconsBase}Smock_Copy_18_N.svg`,
];

const SUPPORTED_TABS = ['usage', 'metadata'];
const DEFAULT_TAB = 'usage';

class NxMediaInfo extends LitElement {
  static properties = {
    media: { attribute: false },
    usageData: { attribute: false },
    org: { attribute: false },
    repo: { attribute: false },
    isIndexing: { type: Boolean },
    activeTab: { type: String },
    _exifData: { state: true },
    _loading: { state: true },
    _fileSize: { state: true },
    _mimeType: { state: true },
    _mediaOrigin: { state: true },
    _mediaPath: { state: true },
    _imageDimensions: { state: true },
    _comprehensiveMetadata: { state: true },
    _modalNotification: { state: true },
  };

  constructor() {
    super();
    this.media = null;
    this.activeTab = DEFAULT_TAB;
    this._exifData = null;
    this._loading = false;
    this._fileSize = null;
    this._mimeType = null;
    this._mediaOrigin = null;
    this._mediaPath = null;
    this.usageData = [];
    this._pdfBlobUrls = new Map();
    this._pdfBlobLoadPromises = new Map();
    this._pdfLoadErrors = new Map();
    this._pendingRequests = new Set();
    this._cachedMetadata = new Map();
    this._imageDimensions = null;
    this._comprehensiveMetadata = null;
    this._metadataStatus = 'idle';
    this._metadataUrl = null;
    this._navigationItems = null;
    this._navigationIndex = -1;
    this._navBusy = false;
    this._lastNavDirection = null;
    this._modalNotification = null;
    this._modalNotificationTimeout = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._cleanupPendingRequests();
    this._pdfBlobUrls.forEach((blobUrl) => {
      URL.revokeObjectURL(blobUrl);
    });
    this._pdfBlobUrls.clear();
    this._pdfBlobLoadPromises.clear();
    this._pdfLoadErrors.clear();
    this._cachedMetadata.clear();
  }

  updated(changedProperties) {
    if (changedProperties.has('media') && this.media) {
      this._resetLoadedMetadata();
      this._updateMediaLocation();
      if (isPdfUrl(this.media.url)) {
        const pdfUrl = resolveMediaUrl(this.media.url, this.org, this.repo, this.usePreviewDaLive);
        this.loadPdfWithDaFetch(pdfUrl);
      }
    }

    if ((changedProperties.has('media') || changedProperties.has('activeTab'))
      && this.activeTab === 'metadata') {
      this.loadMetadata();
    }
  }

  show(data) {
    const dialog = this.shadowRoot?.querySelector('dialog');
    const alreadyOpen = dialog?.open === true;

    this.media = data.media;
    this.usageData = data.usageData;
    this.org = data.org;
    this.repo = data.repo;
    this.usePreviewDaLive = data.usePreviewDaLive || false;
    this.isIndexing = data.isIndexing;

    if (data.initialTab && SUPPORTED_TABS.includes(data.initialTab)) {
      this.activeTab = data.initialTab;
    } else if (!alreadyOpen) {
      this.activeTab = DEFAULT_TAB;
    }

    if (Array.isArray(data.navigationItems) && data.navigationItems.length > 0
      && typeof data.navigationIndex === 'number') {
      this._navigationItems = data.navigationItems;
      this._navigationIndex = data.navigationIndex;
    } else {
      this._navigationItems = null;
      this._navigationIndex = -1;
    }

    if (data.media?.url) {
      const fullUrl = resolveMediaUrl(data.media.url, data.org, data.repo, data.usePreviewDaLive);
      const { origin, path } = parseMediaUrl(fullUrl);
      this._mediaOrigin = origin || 'Unknown';
      this._mediaPath = path || 'Unknown';
    }

    this.updateComplete.then(() => {
      const dlg = this.shadowRoot.querySelector('dialog');
      if (dlg && !dlg.open) {
        dlg.showModal();
      }
    });

    this.dispatchEvent(new CustomEvent('modal-open', {
      detail: { media: this.media, tab: this.activeTab },
      bubbles: true,
      composed: true,
    }));
  }

  get _hasMediaNavigation() {
    return Array.isArray(this._navigationItems)
      && this._navigationItems.length > 1
      && this._navigationIndex >= 0;
  }

  navigateMedia(delta) {
    const items = this._navigationItems;
    if (!items?.length || this._navBusy) return false;
    const next = this._navigationIndex + delta;
    if (next < 0 || next >= items.length) return false;

    this._navBusy = true;
    try {
      const prevMedia = this.media;
      const media = items[next];
      const prevResolved = prevMedia?.url
        ? resolveMediaUrl(prevMedia.url, this.org, this.repo, this.usePreviewDaLive)
        : null;
      if (prevMedia && isPdfUrl(prevMedia.url) && prevResolved) {
        this._revokePdfEntryForResolvedUrl(prevResolved);
      }

      this.show({
        media,
        usageData: getAppState().usageIndex?.get(getDedupeKey(media.url)) || [],
        org: this.org,
        repo: this.repo,
        usePreviewDaLive: this.usePreviewDaLive,
        isIndexing: this.isIndexing,
        navigationItems: items,
        navigationIndex: next,
        initialTab: this.activeTab,
      });
      return true;
    } finally {
      this._navBusy = false;
    }
  }

  _focusMediaNavButton(which) {
    if (!this._hasMediaNavigation) return;
    this.updateComplete.then(() => {
      const prevBtn = this.shadowRoot?.querySelector('.media-nav-prev');
      const nextBtn = this.shadowRoot?.querySelector('.media-nav-next');
      if (!prevBtn || !nextBtn) return;
      const primary = which === 'prev' ? prevBtn : nextBtn;
      const fallback = which === 'prev' ? nextBtn : prevBtn;
      if (!primary.disabled) {
        primary.focus();
      } else if (!fallback.disabled) {
        fallback.focus();
      }
    });
  }

  handleMediaNavPrev() {
    this._lastNavDirection = 'prev';
    this.navigateMedia(-1);
  }

  handleMediaNavNext() {
    this._lastNavDirection = 'next';
    this.navigateMedia(1);
  }

  _shouldDeferMediaArrowKeys(e) {
    const path = typeof e.composedPath === 'function' ? e.composedPath() : [e.target];
    for (const node of path) {
      if (node instanceof Element) {
        if (node.classList?.contains('media-nav-btn')) return false;
        if (node.matches?.(
          'button, a[href], [role="tab"], [role="link"], [role="button"], sl-button, sl-tab',
        )) {
          return true;
        }
      }
    }
    return false;
  }

  handleDialogKeydown(e) {
    if (e.defaultPrevented) return;
    if (!this._hasMediaNavigation || this._navBusy) return;
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.target?.isContentEditable) return;
    if (this._shouldDeferMediaArrowKeys(e)) return;

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this._lastNavDirection = 'prev';
      if (this.navigateMedia(-1)) this._focusMediaNavButton('prev');
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      this._lastNavDirection = 'next';
      if (this.navigateMedia(1)) this._focusMediaNavButton('next');
    }
  }

  _revokePdfEntryForResolvedUrl(resolvedPdfUrl) {
    const blobUrl = this._pdfBlobUrls.get(resolvedPdfUrl);
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
    }
    this._pdfBlobUrls.delete(resolvedPdfUrl);
    this._pdfLoadErrors.delete(resolvedPdfUrl);
    this._pdfBlobLoadPromises.delete(resolvedPdfUrl);
  }

  _revokeAllPdfBlobEntries() {
    this._pdfBlobUrls.forEach((blobUrl) => {
      URL.revokeObjectURL(blobUrl);
    });
    this._pdfBlobUrls.clear();
    this._pdfBlobLoadPromises.clear();
    this._pdfLoadErrors.clear();
  }

  async _prepareFetchOptionsWithAuth(baseOpts = {}) {
    if (!this.usePreviewDaLive) return baseOpts;

    const { getSiteTokenHeaders } = await import('../../indexing/admin-api.js');
    const headers = await getSiteTokenHeaders(this.org, this.repo);
    if (headers) {
      return { ...baseOpts, headers: { ...baseOpts.headers, ...headers } };
    }
    return baseOpts;
  }

  renderMediaNavChrome() {
    if (!this._hasMediaNavigation) return html``;

    const total = this._navigationItems.length;
    const pos = this._navigationIndex + 1;
    const atFirst = this._navigationIndex <= 0 || this._navBusy;
    const atLast = this._navigationIndex >= total - 1 || this._navBusy;

    return html`
      <div class="media-nav-controls" role="group" aria-label="${t('UI_MEDIA_POSITION', { current: pos, total })}">
        <button
          type="button"
          class="media-nav-btn media-nav-prev"
          @click=${this.handleMediaNavPrev}
          ?disabled=${atFirst}
          aria-label="${t('UI_MEDIA_PREV')}"
        >
          <svg class="media-nav-chevron" viewBox="0 0 20 20" aria-hidden="true">
            <use href="#S2_Icon_ChevronRight_20_N"></use>
          </svg>
        </button>
        <button
          type="button"
          class="media-nav-btn media-nav-next"
          @click=${this.handleMediaNavNext}
          ?disabled=${atLast}
          aria-label="${t('UI_MEDIA_NEXT')}"
        >
          <svg class="media-nav-chevron" viewBox="0 0 20 20" aria-hidden="true">
            <use href="#S2_Icon_ChevronRight_20_N"></use>
          </svg>
        </button>
        <span class="media-nav-position">${t('UI_MEDIA_POSITION', { current: pos, total })}</span>
      </div>
    `;
  }

  close() {
    const dialog = this.shadowRoot.querySelector('dialog');
    if (dialog) {
      dialog.close();
    }
  }

  _updateMediaLocation() {
    if (!this.media?.url) return;

    const fullUrl = resolveMediaUrl(this.media.url, this.org, this.repo, this.usePreviewDaLive);
    const { origin, path } = parseMediaUrl(fullUrl);
    this._mediaOrigin = origin || 'Unknown';
    this._mediaPath = path || 'Unknown';
  }

  async loadMetadata() {
    const { media } = this;
    if (!media?.url) return;

    const fullUrl = resolveMediaUrl(media.url, this.org, this.repo, this.usePreviewDaLive);
    if (this._metadataUrl === fullUrl
      && (this._metadataStatus === 'loading' || this._metadataStatus === 'loaded')) {
      return;
    }

    this._metadataStatus = 'loading';
    this._metadataUrl = fullUrl;

    try {
      if (isImage(media.url)) {
        await this.loadExifData(fullUrl);
      } else {
        await this.loadFileSize(fullUrl);
        if (this.media && isVideo(this.media.url)) {
          await this.loadVideoDimensions(fullUrl);
        }
      }
    } finally {
      if (this._metadataUrl === fullUrl) {
        this._metadataStatus = 'loaded';
      }
    }
  }

  async loadVideoDimensions(fullUrl) {
    if (!this.media || !isVideo(this.media.url)) {
      return;
    }

    const defaultUrl = resolveMediaUrl(this.media.url, this.org, this.repo, this.usePreviewDaLive);
    const resolvedUrl = fullUrl || defaultUrl;

    const cacheKey = `video_dims_${resolvedUrl}`;

    if (this._cachedMetadata.has(cacheKey)) {
      this._imageDimensions = this._cachedMetadata.get(cacheKey);
      return;
    }

    try {
      const dimensions = await new Promise((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';

        video.onloadedmetadata = () => {
          const dims = {
            width: video.videoWidth,
            height: video.videoHeight,
          };
          resolve(dims);
        };

        video.onerror = () => {
          resolve(null);
        };

        video.src = resolvedUrl;
      });

      if (dimensions) {
        this._imageDimensions = dimensions;
        this._cachedMetadata.set(cacheKey, dimensions);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[VIDEO] Error loading dimensions:', error);
    }
  }

  async loadExifData(fullUrl) {
    if (!this.media || !isImage(this.media.url)) {
      return;
    }

    const defaultUrl = resolveMediaUrl(this.media.url, this.org, this.repo, this.usePreviewDaLive);
    const resolvedUrl = fullUrl || defaultUrl;

    const ext = this.media.url.split('.').pop()?.toLowerCase();
    const isSvg = ext === 'svg';

    const cacheKey = `metadata_${resolvedUrl}`;
    this._updateMediaLocation();

    if (this._cachedMetadata.has(cacheKey)) {
      const cached = this._cachedMetadata.get(cacheKey);
      this._exifData = cached.exif;
      this._imageDimensions = cached.dimensions;
      this._comprehensiveMetadata = cached.comprehensive;
      this._fileSize = cached.fileSize;
      this._mimeType = cached.mimeType;
      this._mediaOrigin = cached.mediaOrigin;
      this._mediaPath = cached.mediaPath;
      this._loading = false;
      return;
    }

    this._loading = true;
    try {
      await loadScript(EXIFR_URL);

      if (typeof window.exifr === 'undefined') {
        // eslint-disable-next-line no-console
        console.error('[METADATA] exifr library failed to load');
        this._loading = false;
        return;
      }

      const controller = new AbortController();
      this._pendingRequests.add(controller);

      let response;
      try {
        const fetchUrl = convertToAemPage(resolvedUrl);
        const opts = await this._prepareFetchOptionsWithAuth({
          method: 'GET',
          signal: controller.signal,
        });
        response = await etcFetch(fetchUrl, 'cors', opts);
      } catch (e) {
        this._pendingRequests.delete(controller);
        this._loading = false;
        return;
      }

      if (response && response.ok) {
        const blob = await response.blob();
        this._pendingRequests.delete(controller);

        this._fileSize = formatFileSize(blob.size);
        this._mimeType = blob.type;

        let exifrData = null;
        if (!isSvg) {
          try {
            exifrData = await window.exifr.parse(blob, {
              tiff: true,
              xmp: true,
              iptc: true,
              icc: true,
            });
          } catch {
            /* ignore */
          }
        }

        const dimensions = await new Promise((resolve) => {
          const img = new Image();
          const blobUrl = URL.createObjectURL(blob);
          img.onload = () => {
            const dims = {
              width: img.naturalWidth,
              height: img.naturalHeight,
            };
            URL.revokeObjectURL(blobUrl);
            resolve(dims);
          };
          img.onerror = () => {
            URL.revokeObjectURL(blobUrl);
            resolve(null);
          };
          img.src = blobUrl;
        });

        const comprehensive = {
          camera: exifrData?.Make || exifrData?.Model ? {
            make: exifrData.Make,
            model: exifrData.Model,
            lens: exifrData.LensModel,
          } : null,
          settings: exifrData?.FNumber || exifrData?.ExposureTime ? {
            iso: exifrData.ISO,
            aperture: exifrData.FNumber,
            shutterSpeed: exifrData.ExposureTime,
            focalLength: exifrData.FocalLength,
          } : null,
          dateTime: exifrData?.DateTimeOriginal || exifrData?.DateTime || null,
          gps: exifrData?.latitude && exifrData?.longitude ? {
            latitude: exifrData.latitude,
            longitude: exifrData.longitude,
            altitude: exifrData.GPSAltitude,
          } : null,
          iptc: exifrData?.Keywords || exifrData?.Caption || exifrData?.Copyright ? {
            keywords: exifrData.Keywords,
            caption: exifrData.Caption,
            copyright: exifrData.Copyright,
            creator: exifrData.Creator,
          } : null,
          xmp: exifrData?.Rating || exifrData?.Subject ? {
            rating: exifrData.Rating,
            subject: exifrData.Subject,
          } : null,
        };

        this._exifData = exifrData;
        this._imageDimensions = dimensions;
        this._comprehensiveMetadata = comprehensive;

        this._cachedMetadata.set(cacheKey, {
          exif: exifrData,
          dimensions,
          comprehensive,
          fileSize: this._fileSize,
          mimeType: this._mimeType,
          mediaOrigin: this._mediaOrigin,
          mediaPath: this._mediaPath,
        });

        this._loading = false;
      } else {
        this._pendingRequests.delete(controller);
        this._loading = false;
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[METADATA] Unexpected error:', error);
      this._loading = false;
    }
  }

  async loadPdfWithDaFetch(pdfUrl) {
    if (this._pdfBlobUrls.has(pdfUrl)) return;
    if (this._pdfBlobLoadPromises.has(pdfUrl)) {
      await this._pdfBlobLoadPromises.get(pdfUrl);
      return;
    }

    this._pdfLoadErrors.delete(pdfUrl);

    const loadPromise = (async () => {
      try {
        const url = new URL(pdfUrl);

        let response;

        if (url.hostname.includes('content.da.live')) {
          const path = url.pathname;
          const adminUrl = `${DA_ORIGIN}/source${path}`;
          response = await daFetch(adminUrl);
        } else {
          const fetchUrl = convertToAemPage(pdfUrl);
          const opts = await this._prepareFetchOptionsWithAuth();
          response = await etcFetch(fetchUrl, 'cors', opts);
        }

        if (!response.ok) {
          this._pdfLoadErrors.set(pdfUrl, t('UI_PDF_NETWORK'));
          return;
        }

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        this._pdfBlobUrls.set(pdfUrl, blobUrl);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Failed to load PDF:', e);
        this._pdfLoadErrors.set(pdfUrl, t('UI_PDF_NETWORK'));
      } finally {
        this.requestUpdate();
      }
    })().finally(() => {
      this._pdfBlobLoadPromises.delete(pdfUrl);
    });

    this._pdfBlobLoadPromises.set(pdfUrl, loadPromise);
    await loadPromise;
  }

  async loadFileSize(fullUrl) {
    if (!this.media || !this.media.url) {
      return;
    }

    const defaultUrl = resolveMediaUrl(this.media.url, this.org, this.repo, this.usePreviewDaLive);
    const resolvedUrl = fullUrl || defaultUrl;
    const cacheKey = resolvedUrl;

    const isExternal = isExternalUrl(resolvedUrl);
    this._updateMediaLocation();

    if (this._cachedMetadata.has(cacheKey)) {
      const metadata = this._cachedMetadata.get(cacheKey);
      this._fileSize = metadata.fileSize;
      this._mimeType = metadata.mimeType;
      this._mediaOrigin = metadata.mediaOrigin;
      this._mediaPath = metadata.mediaPath;
      return;
    }

    try {
      if (isPdfUrl(this.media.url) && this._pdfBlobLoadPromises.has(resolvedUrl)) {
        await this._pdfBlobLoadPromises.get(resolvedUrl);
      }

      if (isPdfUrl(this.media.url) && this._pdfBlobUrls.has(resolvedUrl)) {
        const blobUrl = this._pdfBlobUrls.get(resolvedUrl);
        const response = await fetch(blobUrl);
        if (response.ok) {
          const blob = await response.blob();
          this._fileSize = formatFileSize(blob.size);
          this._mimeType = blob.type || 'application/pdf';
        }
      } else {
        const ext = resolvedUrl.split('.').pop()?.toLowerCase();
        this._mimeType = SUPPORTED_FILES[ext] || 'Unknown';

        const controller = new AbortController();
        this._pendingRequests.add(controller);

        try {
          let fetchUrl = resolvedUrl.toLowerCase().includes('.svg')
            ? normalizeUrl(resolvedUrl) : resolvedUrl;
          fetchUrl = convertToAemPage(fetchUrl);

          const opts = await this._prepareFetchOptionsWithAuth({
            method: 'HEAD',
            signal: controller.signal,
          });

          const response = await etcFetch(fetchUrl, 'cors', opts);

          if (response.ok) {
            const contentLength = response.headers.get('content-length');
            if (contentLength) {
              this._fileSize = formatFileSize(parseInt(contentLength, 10));
            } else {
              const getOpts = await this._prepareFetchOptionsWithAuth({
                method: 'GET',
                signal: controller.signal,
              });
              const getResponse = await etcFetch(fetchUrl, 'cors', getOpts);
              if (getResponse.ok) {
                const blob = await getResponse.blob();
                this._fileSize = formatFileSize(blob.size);
              } else {
                this._fileSize = isExternal ? t('UI_EXTERNAL_RESOURCE') : t('UI_UNABLE_TO_FETCH');
              }
            }
          } else {
            this._fileSize = isExternal ? t('UI_EXTERNAL_RESOURCE') : t('UI_UNABLE_TO_FETCH');
          }
        } catch {
          this._fileSize = isExternal ? t('UI_EXTERNAL_RESOURCE') : t('UI_UNABLE_TO_FETCH');
        }

        this._pendingRequests.delete(controller);
      }

      this._cachedMetadata.set(cacheKey, {
        fileSize: this._fileSize,
        mimeType: this._mimeType,
        mediaOrigin: this._mediaOrigin,
        mediaPath: this._mediaPath,
      });
    } catch (e) {
      this._fileSize = 'Unknown';
      this._mimeType = 'Unknown';
      this._mediaOrigin = 'Unknown';
      this._mediaPath = 'Unknown';
    }
  }

  render() {
    let displayName = '';
    if (this.media) {
      const label = getMediaCardLabel(this.media);
      if (label && label !== 'Unknown') {
        displayName = label;
      } else {
        const name = this.media.displayName || this.media.name || getFileName(this.media.url) || 'Media Details';
        if (name && name !== 'Media Details') {
          try {
            displayName = decodeURIComponent(name);
          } catch {
            displayName = name;
          }
        } else {
          displayName = name;
        }
      }
    }

    return html`
      <dialog
        class="modal-overlay"
        @click=${this.handleBackdropClick}
        @close=${this.handleDialogClose}
        @keydown=${this.handleDialogKeydown}
      >
        ${this.media ? html`
        <div class="modal-content" @click=${(e) => e.stopPropagation()}>
          <div class="media-preview-section">
            <div class="media-preview-with-nav">
              ${this.renderMediaNavChrome()}
              <div class="media-preview-inner">
                ${this.renderMediaPreview()}
              </div>
            </div>
          </div>
          <div class="modal-details">

            <div class="modal-header">
              <h2>${displayName}</h2>
              ${this.renderMediaOrigin()}
              <button type="button" class="icon-button close-modal-button" @click=${this.handleClose} title="Close" aria-label="Close modal">
                <svg class="icon" viewBox="0 0 20 20">
                  <use href="#S2_Icon_Close_20_N"></use>
                </svg>
              </button>
            </div>

            <div class="modal-actions">
              <button
                type="button"
                class="action-button copy-button"
                @click=${this.handleCopyUrl}
                title="${t('UI_COPY_URL')}"
                aria-label="${t('UI_COPY_URL')}"
              >
                <svg class="icon" viewBox="0 0 18 18">
                  <use href="#Smock_Copy_18_N"></use>
                </svg>
                Copy
              </button>
              <button
                type="button"
                class="action-button open-button"
                @click=${this.handleOpenInTab}
                title="${t('UI_OPEN_IN_NEW_TAB')}"
                aria-label="${t('UI_OPEN_IN_NEW_TAB')}"
              >
                <svg class="icon" viewBox="0 0 20 20">
                  <use href="#S2_Icon_OpenIn_20_N"></use>
                </svg>
                Open
              </button>
            </div>

            <div class="modal-tabs">
              <button
                type="button"
                class="tab-button ${this.activeTab === 'usage' ? 'active' : ''}"
                data-tab="usage"
                aria-selected=${this.activeTab === 'usage' ? 'true' : 'false'}
                @click=${this.handleTabChange}
              >
              <svg class="reference-icon icon" viewBox="0 0 22 20">
                <use href="#S2_Icon_AIGenReferenceImage_20_N"></use>
              </svg>
                ${this.isIndexing && (this.usageData?.length ?? 0) === 0
    ? 'References'
    : `${(this.usageData?.length ?? 0)} ${(this.usageData?.length ?? 0) !== 1 ? 'References' : 'Reference'}`}
              </button>
              <button
                type="button"
                class="tab-button ${this.activeTab === 'metadata' ? 'active' : ''}"
                data-tab="metadata"
                aria-selected=${this.activeTab === 'metadata' ? 'true' : 'false'}
                @click=${this.handleTabChange}
              >
              <svg class="image-info-icon icon" viewBox="0 0 20 20">
                <use href="#C_Icon_Image_Info"></use>
              </svg>
                Metadata
              </button>
            </div>

            <div class="modal-body">
              ${this.activeTab === 'usage' ? this.renderUsageTab() : this.renderInfoTab()}
            </div>

          </div>

        </div>
        ` : ''}

        ${this._modalNotification ? html`
          <div class="modal-notification-overlay">
            <div class="toast-notification ${this._modalNotification.type || 'success'}">
              <div class="toast-notification-header">
                <p class="da-notification-status-title">${this._modalNotification.heading || t('NOTIFY_INFO')}</p>
                <button
                  type="button"
                  class="toast-notification-close"
                  aria-label="${t('UI_DISMISS')}"
                  @click=${this.dismissModalNotification}
                >
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <p class="da-notification-status-description">${this._modalNotification.message}</p>
            </div>
          </div>
        ` : ''}
      </dialog>
    `;
  }

  renderMediaPreview() {
    const fullUrl = resolveMediaUrl(this.media.url, this.org, this.repo, this.usePreviewDaLive);

    if (isImage(this.media.url) || this.media.type === MediaType.IMAGE) {
      const subtype = getSubtype(this.media);
      const isExternal = isExternalUrl(fullUrl);
      const optimized = !isExternal
        ? optimizeImageUrls(fullUrl, [800, 1200, 1600])
        : null;
      if (optimized) {
        return html`
          <div class="image-preview-container">
            <picture>
              <source type="image/webp" srcset="${optimized.webpSrcset}" sizes="min(50vw, 600px)">
              <img
                src="${optimized.fallbackUrl}"
                srcset="${optimized.fallbackSrcset}"
                sizes="min(50vw, 600px)"
                alt=""
                class="preview-image"
                @error=${() => this.handleImageLoadError(fullUrl)}
              >
            </picture>
            <div class="subtype-label">${subtype}</div>
          </div>
        `;
      }
      return html`
        <div class="image-preview-container">
          <img
            src="${fullUrl}"
            alt=""
            class="preview-image"
            @error=${() => this.handleImageLoadError(fullUrl)}
          >
          <div class="subtype-label">${subtype}</div>
        </div>
      `;
    }
    if (isVideo(fullUrl) || isExternalVideoUrl(fullUrl)) {
      const embedUrl = getVideoEmbedUrl(fullUrl);
      if (embedUrl) {
        return html`
          <div class="video-preview-container">
            <iframe
              src="${embedUrl}"
              class="preview-video-iframe"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen
              title="Video embed"
            ></iframe>
          </div>
        `;
      }
      if (isExternalVideoUrl(fullUrl)) {
        return html`
          <div class="video-preview-container">
            <div class="placeholder-full video-placeholder">
              <svg class="placeholder-icon" viewBox="0 0 20 20">
                <use href="#S2_Icon_Play_20_N"></use>
              </svg>
              <span class="placeholder-label">Video</span>
            </div>
          </div>
        `;
      }
      return html`
        <video src="${fullUrl}" controls class="preview-video">
          Your browser does not support the video tag.
        </video>
      `;
    }
    if (isPdfUrl(this.media.url)) {
      const blobUrl = this._pdfBlobUrls.get(fullUrl);

      if (blobUrl) {
        return html`
          <iframe
            src="${blobUrl}"
            class="pdf-preview"
            @load=${this.handlePdfLoad}
            @error=${this.handlePdfError}
          >
          </iframe>
          <div class="document-placeholder">
            <svg class="icon" viewBox="0 0 20 20">
              <use href="#S2_Icon_PDF_20_N"></use>
            </svg>
          </div>
        `;
      }

      const pdfError = this._pdfLoadErrors.get(fullUrl);

      return html`
        <div class="pdf-preview-container">
          <div class="document-placeholder">
            <svg class="icon" viewBox="0 0 20 20">
              <use href="#S2_Icon_PDF_20_N"></use>
            </svg>
            <div class="pdf-info">
              <span class="pdf-name">${getMediaCardLabel(this.media)}</span>
              <span class="pdf-type">PDF Document</span>
              ${pdfError
                ? html`<span class="pdf-error">${pdfError}</span>`
                : html`<span class="pdf-loading">Loading...</span>`}
            </div>
            <div class="subtype-label">PDF</div>
          </div>
        </div>
      `;
    }
    return html`
      <div class="preview-placeholder">
        <svg class="icon fragment-icon" viewBox="0 0 60 60">
          <use href="#C_Icon_Fragment"></use>
        </svg>
        <div class="subtype-label">Fragment</div>
      </div>
    `;
  }

  handleImageLoadError(resolvedUrl) {
    if (
      !this.media?.url
      || isExternalUrl(resolvedUrl)
      || isPreviewPreferredForMediaUrl(this.media.url)
    ) {
      return;
    }

    if (!preferPreviewForMediaUrl(this.media.url)) {
      return;
    }

    const previewUrl = resolveMediaUrl(this.media.url, this.org, this.repo);
    const { origin, path } = parseMediaUrl(previewUrl);
    this._mediaOrigin = origin || 'Unknown';
    this._mediaPath = path || 'Unknown';
    this.requestUpdate();
  }

  renderExifSection() {
    if (!isImage(this.media.url)) {
      return '';
    }

    if (this._loading) {
      return html`
        <div class="metadata-section">
          <div class="loading-state">
            <div class="spinner"></div>
            <span>Loading metadata...</span>
          </div>
        </div>
      `;
    }

    const hasExtendedMetadata = this._comprehensiveMetadata;

    if (!hasExtendedMetadata) {
      const message = this.isIndexing ? 'Discovery in progress' : 'No extended metadata available';
      return html`
        <div class="metadata-section">
          <div class="metadata-grid-container">
            <div class="metadata-grid metadata-grid-no-data">
              <div class="exif-row no-data">
                <span class="exif-value">${message}</span>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    return html`
      <div class="metadata-section">
        <div class="metadata-grid-container">
          <div class="metadata-grid">
            ${this._comprehensiveMetadata?.camera?.make ? html`
              <div class="metadata-label">Camera Make</div>
              <div class="metadata-value">${this._comprehensiveMetadata.camera.make}</div>
            ` : ''}
            ${this._comprehensiveMetadata?.camera?.model ? html`
              <div class="metadata-label">Camera Model</div>
              <div class="metadata-value">${this._comprehensiveMetadata.camera.model}</div>
            ` : ''}
            ${this._comprehensiveMetadata?.camera?.lens ? html`
              <div class="metadata-label">Lens</div>
              <div class="metadata-value">${this._comprehensiveMetadata.camera.lens}</div>
            ` : ''}

            ${this._comprehensiveMetadata?.settings?.iso ? html`
              <div class="metadata-label">ISO</div>
              <div class="metadata-value">${this._comprehensiveMetadata.settings.iso}</div>
            ` : ''}
            ${this._comprehensiveMetadata?.settings?.aperture ? html`
              <div class="metadata-label">Aperture</div>
              <div class="metadata-value">f/${this._comprehensiveMetadata.settings.aperture}</div>
            ` : ''}
            ${this._comprehensiveMetadata?.settings?.shutterSpeed ? html`
              <div class="metadata-label">Shutter Speed</div>
              <div class="metadata-value">${this._comprehensiveMetadata.settings.shutterSpeed}s</div>
            ` : ''}
            ${this._comprehensiveMetadata?.settings?.focalLength ? html`
              <div class="metadata-label">Focal Length</div>
              <div class="metadata-value">${this._comprehensiveMetadata.settings.focalLength}mm</div>
            ` : ''}

            ${this._comprehensiveMetadata?.dateTime ? html`
              <div class="metadata-label">Date Captured</div>
              <div class="metadata-value">${formatDateTime(this._comprehensiveMetadata.dateTime)}</div>
            ` : ''}

            ${this._comprehensiveMetadata?.gps?.latitude ? html`
              <div class="metadata-label">Latitude</div>
              <div class="metadata-value">${this._comprehensiveMetadata.gps.latitude.toFixed(6)}</div>
            ` : ''}
            ${this._comprehensiveMetadata?.gps?.longitude ? html`
              <div class="metadata-label">Longitude</div>
              <div class="metadata-value">${this._comprehensiveMetadata.gps.longitude.toFixed(6)}</div>
            ` : ''}
            ${this._comprehensiveMetadata?.gps?.altitude ? html`
              <div class="metadata-label">Altitude</div>
              <div class="metadata-value">${this._comprehensiveMetadata.gps.altitude}m</div>
            ` : ''}

            ${this._comprehensiveMetadata?.iptc?.keywords ? html`
              <div class="metadata-label">Keywords</div>
              <div class="metadata-value">${Array.isArray(this._comprehensiveMetadata.iptc.keywords) ? this._comprehensiveMetadata.iptc.keywords.join(', ') : this._comprehensiveMetadata.iptc.keywords}</div>
            ` : ''}
            ${this._comprehensiveMetadata?.iptc?.caption ? html`
              <div class="metadata-label">Caption</div>
              <div class="metadata-value">${this._comprehensiveMetadata.iptc.caption}</div>
            ` : ''}
            ${this._comprehensiveMetadata?.iptc?.copyright ? html`
              <div class="metadata-label">Copyright</div>
              <div class="metadata-value">${this._comprehensiveMetadata.iptc.copyright}</div>
            ` : ''}
            ${this._comprehensiveMetadata?.iptc?.creator ? html`
              <div class="metadata-label">Creator</div>
              <div class="metadata-value">${this._comprehensiveMetadata.iptc.creator}</div>
            ` : ''}

            ${this._comprehensiveMetadata?.xmp?.rating ? html`
              <div class="metadata-label">Rating</div>
              <div class="metadata-value">${this._comprehensiveMetadata.xmp.rating}</div>
            ` : ''}
            ${this._comprehensiveMetadata?.xmp?.subject ? html`
              <div class="metadata-label">Subject</div>
              <div class="metadata-value">${this._comprehensiveMetadata.xmp.subject}</div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }

  renderActions(usage) {
    if (usage.doc) {
      return html`
        <div class="action-items">
          <button type="button" size="small" class="icon-button" @click=${() => this.handleDocumentAction(usage.doc, 'edit')} title="Edit document">
            <svg class="icon" viewBox="0 0 22 20">
              <use href="#S2_Icon_OpenIn_20_N"></use>
            </svg>
            Document
          </button>
          <button type="button" size="small" class="icon-button preview-button" @click=${() => this.handleDocumentAction(usage.doc, 'preview')} title="View document">
            <svg class="icon" viewBox="0 0 22 20">
              <use href="#S2_Icon_AdobeExpressSolid_20_N"></use>
            </svg>
            Preview
          </button>
          <button type="button" size="small" class="icon-button publish-button" @click=${() => this.handleDocumentAction(usage.doc, 'publish')} title="View published document">
            <svg class="icon" viewBox="0 0 22 20">
              <use href="#S2_Icon_AdobeExpressSolid_20_N"></use>
            </svg>
            Publish
          </button>
        </div>
      `;
    }
    return html`<span class="no-actions">-</span>`;
  }

  renderInfoTab() {
    const mediaType = getMediaType(this.media);
    const isFragment = mediaType === 'fragment';
    const showMimeType = !isFragment && this._mimeType && this._mimeType !== 'Unknown';

    return html`
      <div class="tab-content">
        <div class="metadata-section">
          <div class="metadata-grid-container">
            <div class="metadata-grid">
              <div class="grid-heading">Property</div>
              <div class="grid-heading">Value</div>
              ${showMimeType ? html`
                <div class="metadata-label">MIME Type</div>
                <div class="metadata-value">${this._mimeType}</div>
              ` : ''}
              ${this._fileSize && this._fileSize !== '0 Bytes' && this._fileSize !== 'External resource' ? html`
                <div class="metadata-label">File Size</div>
                <div class="metadata-value">${this._fileSize}</div>
              ` : ''}
              ${this._imageDimensions ? html`
                <div class="metadata-label">Width</div>
                <div class="metadata-value">${this._imageDimensions.width}px</div>
                <div class="metadata-label">Height</div>
                <div class="metadata-value">${this._imageDimensions.height}px</div>
                <div class="metadata-label">Orientation</div>
                <div class="metadata-value">${getImageOrientation(this._imageDimensions.width, this._imageDimensions.height)}</div>
              ` : ''}
              <div class="metadata-label">Origin</div>
              <div class="metadata-value">${this._mediaOrigin || 'Loading...'}</div>
              <div class="metadata-label">Path</div>
              <div class="metadata-value">${this._mediaPath || 'Loading...'}</div>
            </div>
          </div>

          ${this.renderExifSection()}
        </div>
      </div>
    `;
  }

  renderUsageContent() {
    const usageData = this.usageData ?? [];

    if (this.isIndexing && usageData.length === 0 && this.media?.usageCount > 0) {
      return html`
        <div class="loading-state">
          <div class="spinner"></div>
          <span>Discovering...</span>
        </div>
      `;
    }

    if (usageData.length > 0) {
      const groupedUsages = usageData.reduce((groups, usage) => {
        const doc = usage.doc || 'Unknown Document';
        if (!groups[doc]) {
          groups[doc] = [];
        }
        groups[doc].push(usage);
        return groups;
      }, {});

      return html`
        <div class="usage-sections">
          ${Object.entries(groupedUsages).map(([doc, usages], idx) => {
    const actionsId = `mediainfo-actions-${idx}`;
    const latestUsage = usages.reduce((latest, current) => (
      current.timestamp > latest.timestamp ? current : latest
    ), usages[0]);
    const modifiedBy = latestUsage.user?.trim();
    const modifiedDate = latestUsage.timestamp
      ? formatDateTime(latestUsage.timestamp)
      : 'Unknown date';
    const modifiedText = (modifiedBy && modifiedBy.toLowerCase() !== 'unknown')
      ? `Last modified by ${modifiedBy} on ${modifiedDate}`
      : `Last modified on ${modifiedDate}`;

    return html`
              <div class="usage-section">
                <div class="document-heading">
                  <div class="document-path">
                    <p class="usage-path">${formatDocPath(doc)}</p>
                    <button
                      type="button"
                      size="small"
                      class="icon-button toggle-actions"
                      aria-expanded="false"
                      aria-controls="${actionsId}"
                      aria-label="Toggle document actions"
                      @click=${this.showActions}
                    >
                      <svg class="icon" viewBox="0 0 22 20">
                        <use href="#S2_Icon_ChevronRight_20_N"></use>
                      </svg>
                    </button>
                  </div>
                  <div class="actions-container" id="${actionsId}">
                    <p class="usage-modified">${modifiedText}</p>
                    <h5 class="usage-title">Open</h5>
                    ${this.renderActions(usages[0])}
                  </div>
                </div>
              </div>
            `;
  })}
        </div>
      `;
    }

    return html`
      <div class="no-usage">
        <p>Not Referenced</p>
      </div>
    `;
  }

  renderUsageTab() {
    return html`
      <div class="tab-content">
        ${this.renderUsageContent()}
      </div>
    `;
  }

  renderMediaOrigin() {
    const origin = this._mediaOrigin?.split('/') || [];
    const filename = origin[origin.length - 1] || 'Unknown';
    return html`
      <div class="media-origin">${filename}</div>
    `;
  }

  handleClose() {
    const dialog = this.shadowRoot.querySelector('dialog');
    if (dialog?.open) {
      dialog.close();
    }
  }

  handleDialogClose() {
    this.dispatchEvent(new CustomEvent('modal-close', {
      bubbles: true,
      composed: true,
    }));

    this._resetState();
    this.dispatchEvent(new CustomEvent('close'));
  }

  handleBackdropClick(e) {
    if (e.target === e.currentTarget) {
      this.handleClose();
    }
  }

  showModalNotification(heading, message, type = 'success') {
    if (this._modalNotificationTimeout) {
      clearTimeout(this._modalNotificationTimeout);
    }
    this._modalNotification = { heading, message, type };
    let duration = 3000;
    if (type === 'danger') {
      duration = 10000;
    } else if (type === 'warning') {
      duration = 5000;
    }
    this._modalNotificationTimeout = setTimeout(() => {
      this._modalNotification = null;
      this._modalNotificationTimeout = null;
    }, duration);
  }

  dismissModalNotification() {
    if (this._modalNotificationTimeout) {
      clearTimeout(this._modalNotificationTimeout);
      this._modalNotificationTimeout = null;
    }
    this._modalNotification = null;
  }

  async handleCopyUrl() {
    if (!this.media?.url) return;
    try {
      const result = await copyMediaToClipboard(this.media);
      const isError = result.heading === 'Error';
      this.showModalNotification(result.heading, result.message, isError ? 'danger' : 'success');
    } catch (_) {
      this.showModalNotification(t('NOTIFY_ERROR'), t('NOTIFY_COPY_ERROR'), 'danger');
    }
  }

  handleOpenInTab(e) {
    if (!this.media?.url) return;
    let fullUrl = resolveMediaUrl(this.media.url, this.org, this.repo);
    fullUrl = convertEmbedToWatchUrl(fullUrl);
    window.open(fullUrl, '_blank', 'noopener,noreferrer');
    const direction = this._lastNavDirection || 'next';
    this._focusMediaNavButton(direction);
  }

  handleTabChange(e) {
    const { tab } = e.target.dataset;
    this.activeTab = tab;

    this.dispatchEvent(new CustomEvent('tab-change', {
      detail: { tab },
      bubbles: true,
      composed: true,
    }));
  }

  handleDocumentAction(docPath, mode = 'edit') {
    if (!docPath) return;

    const { org, repo } = this;
    if (!org || !repo) return;

    let url;

    if (mode === 'edit') {
      url = getEditUrl(org, repo, docPath);
    } else {
      const viewUrl = getViewUrl(org, repo, docPath);
      if (mode === 'publish') {
        url = viewUrl?.replace(Domains.AEM_PAGE, Domains.AEM_LIVE);
      } else {
        url = viewUrl;
      }
    }

    if (url) {
      window.open(url, '_blank');
    }
  }

  handlePdfLoad(e) {
    const iframe = e.target;
    const placeholder = iframe.nextElementSibling;
    if (placeholder && placeholder.classList.contains('document-placeholder')) {
      placeholder.style.display = 'none';
    }
  }

  handlePdfError(e) {
    const iframe = e.target;
    iframe.style.display = 'none';
    const placeholder = iframe.nextElementSibling;
    if (placeholder && placeholder.classList.contains('document-placeholder')) {
      placeholder.style.display = 'flex';
    }
  }

  showActions(e) {
    const button = e.target.closest('button.toggle-actions');
    const documentHeading = e.target.closest('.document-heading');
    if (documentHeading) {
      const isOpen = documentHeading.classList.toggle('open');
      if (button) {
        button.setAttribute('aria-expanded', isOpen.toString());
      }
    }
  }

  _cleanupPendingRequests() {
    this._pendingRequests.forEach((controller) => {
      controller.abort();
    });
    this._pendingRequests.clear();
  }

  _resetLoadedMetadata() {
    this._cleanupPendingRequests();
    this._exifData = null;
    this._loading = false;
    this._fileSize = null;
    this._mimeType = null;
    this._imageDimensions = null;
    this._comprehensiveMetadata = null;
    this._metadataStatus = 'idle';
    this._metadataUrl = null;
  }

  _resetState() {
    this._resetLoadedMetadata();
    this._revokeAllPdfBlobEntries();
    if (this._modalNotificationTimeout) {
      clearTimeout(this._modalNotificationTimeout);
      this._modalNotificationTimeout = null;
    }
    this._modalNotification = null;
    this.media = null;
    this._mediaOrigin = null;
    this._mediaPath = null;
    this.usageData = [];
    this.activeTab = DEFAULT_TAB;
    this._navigationItems = null;
    this._navigationIndex = -1;
    this._navBusy = false;
    this._lastNavDirection = null;
  }
}

customElements.define('nx-media-info', NxMediaInfo);
