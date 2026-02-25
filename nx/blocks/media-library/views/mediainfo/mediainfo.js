import { html, LitElement } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import getSvg from '../../../../utils/svg.js';
import {
  getSubtype,
  formatFileSize,
  parseMediaUrl,
  getEditUrl,
  getViewUrl,
  getFileName,
  formatDocPath,
  isImage,
  isVideo,
  isPdfUrl,
  isExternalVideoUrl,
  getVideoEmbedUrl,
  EXIFR_URL,
  normalizeUrl,
  getMediaType,
  formatDateTime,
  isExternalUrl,
  resolveMediaUrl,
  getImageOrientation,
  optimizeImageUrls,
} from '../../utils/utils.js';
import { fetchWithCorsProxy } from '../../utils/admin-api.js';
import loadScript from '../../../../utils/script.js';
import { daFetch } from '../../../../utils/daFetch.js';
import { DA_ORIGIN, SUPPORTED_FILES } from '../../../../public/utils/constants.js';
import { Domains, MediaType } from '../../utils/constants.js';

const styles = await getStyle(import.meta.url);
const nx = `${new URL(import.meta.url).origin}/nx`;

const ICONS = [
  `${nx}/public/icons/S2_Icon_PDF_20_N.svg`,
  `${nx}/public/icons/S2_Icon_AIGenReferenceImage_20_N.svg`,
  `${nx}/public/icons/C_Icon_Image_Info.svg`,
  `${nx}/public/icons/S2_Icon_AlertDiamondOrange_20_N.svg`,
  `${nx}/public/icons/S2_Icon_InfoCircleBlue_20_N.svg`,
  `${nx}/public/icons/S2_Icon_OpenIn_20_N.svg`,
  `${nx}/public/icons/S2_Icon_AdobeExpressSolid_20_N.svg`,
  `${nx}/public/icons/S2_Icon_Edit_20_N.svg`,
  `${nx}/public/icons/S2_Icon_Accessibility_20_N.svg`,
  `${nx}/public/icons/S2_Icon_ChevronRight_20_N.svg`,
  `${nx}/public/icons/S2_Icon_CheckmarkCircleGreen_20_N.svg`,
  `${nx}/public/icons/S2_Icon_Close_20_N.svg`,
  `${nx}/public/icons/S2_Icon_CloseCircle_20_N.svg`,
  `${nx}/public/icons/S2_Icon_Checkmark_20_N.svg`,
  `${nx}/public/icons/C_Icon_Fragment.svg`,
];

class NxMediaInfo extends LitElement {
  static properties = {
    media: { attribute: false },
    usageData: { attribute: false },
    org: { attribute: false },
    repo: { attribute: false },
    isIndexing: { type: Boolean },
    _activeTab: { state: true },
    _exifData: { state: true },
    _loading: { state: true },
    _fileSize: { state: true },
    _mimeType: { state: true },
    _mediaOrigin: { state: true },
    _mediaPath: { state: true },
    _imageDimensions: { state: true },
    _comprehensiveMetadata: { state: true },
  };

  constructor() {
    super();
    this.media = null;
    this._activeTab = 'usage';
    this._exifData = null;
    this._loading = false;
    this._fileSize = null;
    this._mimeType = null;
    this._mediaOrigin = null;
    this._mediaPath = null;
    this.usageData = [];
    this._pdfBlobUrls = new Map();
    this._pendingRequests = new Set();
    this._cachedMetadata = new Map();
    this._imageDimensions = null;
    this._comprehensiveMetadata = null;
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
    this._cachedMetadata.clear();
  }

  updated(changedProperties) {
    if (changedProperties.has('media') && this.media) {
      this.loadMetadata();
      if (isPdfUrl(this.media.url)) {
        this.loadPdfWithDaFetch(this.media.url);
      }
    }

    if (changedProperties.has('_activeTab')) {
      if (this._activeTab === 'metadata' && !this._loading && !this._exifData) {
        this.loadMetadata();
      }
    }
  }

  show(data) {
    this.media = data.media;
    this.usageData = data.usageData;
    this.org = data.org;
    this.repo = data.repo;
    this.isIndexing = data.isIndexing;

    if (data.media?.url) {
      const fullUrl = resolveMediaUrl(data.media.url, data.org, data.repo);
      const { origin, path } = parseMediaUrl(fullUrl);
      this._mediaOrigin = origin || 'Unknown';
      this._mediaPath = path || 'Unknown';
    }

    this.updateComplete.then(() => {
      const dialog = this.shadowRoot.querySelector('dialog');
      if (dialog && !dialog.open) {
        dialog.showModal();
      }
    });
  }

  async loadMetadata() {
    const media = this.media;
    if (!media?.url) return;

    if (isImage(media.url)) {
      await this.loadExifData();
    } else {
      await this.loadFileSize();
      if (this.media && isVideo(this.media.url)) {
        await this.loadVideoDimensions();
      }
    }
  }

  async loadVideoDimensions() {
    if (!this.media || !isVideo(this.media.url)) {
      return;
    }

    const fullUrl = resolveMediaUrl(this.media.url, this.org, this.repo);
    const cacheKey = `video_dims_${fullUrl}`;

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

        video.src = fullUrl;
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

  async loadExifData() {
    if (!this.media || !isImage(this.media.url)) {
      return;
    }

    const ext = this.media.url.split('.').pop()?.toLowerCase();
    const isSvg = ext === 'svg';

    const fullUrl = resolveMediaUrl(this.media.url, this.org, this.repo);
    const cacheKey = `metadata_${fullUrl}`;

    const { origin, path } = parseMediaUrl(fullUrl);
    this._mediaOrigin = origin || 'Unknown';
    this._mediaPath = path || 'Unknown';

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
        response = await fetchWithCorsProxy(fullUrl, {
          method: 'GET',
          signal: controller.signal,
        });
      } catch (error) {
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
          img.onload = () => {
            const dims = {
              width: img.naturalWidth,
              height: img.naturalHeight,
            };
            resolve(dims);
          };
          img.onerror = () => {
            resolve(null);
          };
          img.src = URL.createObjectURL(blob);
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

    try {
      const url = new URL(pdfUrl);

      let response;

      if (url.hostname.includes('content.da.live')) {
        const path = url.pathname;
        const adminUrl = `${DA_ORIGIN}/source${path}`;
        response = await daFetch(adminUrl);
      } else {
        response = await fetchWithCorsProxy(pdfUrl);
      }

      if (response.ok) {
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        this._pdfBlobUrls.set(pdfUrl, blobUrl);
        this.requestUpdate();

        this.loadFileSize();
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load PDF:', error);
    }
  }

  async loadFileSize() {
    if (!this.media || !this.media.url) {
      return;
    }

    const fullUrl = resolveMediaUrl(this.media.url, this.org, this.repo);
    const cacheKey = fullUrl;

    const isExternal = isExternalUrl(fullUrl);

    const { origin, path } = parseMediaUrl(fullUrl);
    this._mediaOrigin = origin || 'Unknown';
    this._mediaPath = path || 'Unknown';

    if (this._cachedMetadata.has(cacheKey)) {
      const metadata = this._cachedMetadata.get(cacheKey);
      this._fileSize = metadata.fileSize;
      this._mimeType = metadata.mimeType;
      this._mediaOrigin = metadata.mediaOrigin;
      this._mediaPath = metadata.mediaPath;
      return;
    }

    try {
      if (isPdfUrl(this.media.url) && this._pdfBlobUrls.has(this.media.url)) {
        const blobUrl = this._pdfBlobUrls.get(this.media.url);
        const response = await fetch(blobUrl);
        if (response.ok) {
          const blob = await response.blob();
          this._fileSize = formatFileSize(blob.size);
          this._mimeType = blob.type || 'application/pdf';
        }
      } else {
        const ext = fullUrl.split('.').pop()?.toLowerCase();
        this._mimeType = SUPPORTED_FILES[ext] || 'Unknown';

        const controller = new AbortController();
        this._pendingRequests.add(controller);

        try {
          const fetchUrl = fullUrl.toLowerCase().includes('.svg') ? normalizeUrl(fullUrl) : fullUrl;

          const response = await fetchWithCorsProxy(fetchUrl, {
            method: 'HEAD',
            signal: controller.signal,
          });

          if (response.ok) {
            const contentLength = response.headers.get('content-length');
            if (contentLength) {
              this._fileSize = formatFileSize(parseInt(contentLength, 10));
            } else {
              const getResponse = await fetchWithCorsProxy(fetchUrl, {
                method: 'GET',
                signal: controller.signal,
              });
              if (getResponse.ok) {
                const blob = await getResponse.blob();
                this._fileSize = formatFileSize(blob.size);
              } else {
                this._fileSize = isExternal ? 'External resource' : `Unable to fetch file (HTTP ${getResponse.status})`;
              }
            }
          } else {
            this._fileSize = isExternal ? 'External resource' : `Unable to fetch file (HTTP ${response.status})`;
          }
        } catch (error) {
          this._fileSize = isExternal ? 'External resource' : `Unable to fetch file (${error.message})`;
        }

        this._pendingRequests.delete(controller);
      }

      this._cachedMetadata.set(cacheKey, {
        fileSize: this._fileSize,
        mimeType: this._mimeType,
        mediaOrigin: this._mediaOrigin,
        mediaPath: this._mediaPath,
      });
    } catch (error) {
      this._fileSize = 'Unknown';
      this._mimeType = 'Unknown';
      this._mediaOrigin = 'Unknown';
      this._mediaPath = 'Unknown';
    }
  }

  render() {
    const displayName = this.media
      ? (this.media.name || getFileName(this.media.url) || 'Media Details')
      : '';

    return html`
      <dialog
        class="modal-overlay"
        @click=${this.handleBackdropClick}
        @close=${this.handleDialogClose}
      >
        ${this.media ? html`
        <div class="modal-content" @click=${(e) => e.stopPropagation()}>
          <div class="media-preview-section">
            ${this.renderMediaPreview()}
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

            <div class="modal-tabs">
              <button
                type="button"
                class="tab-button ${this._activeTab === 'usage' ? 'active' : ''}"
                data-tab="usage"
                aria-selected=${this._activeTab === 'usage' ? 'true' : 'false'}
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
                class="tab-button ${this._activeTab === 'metadata' ? 'active' : ''}"
                data-tab="metadata"
                aria-selected=${this._activeTab === 'metadata' ? 'true' : 'false'}
                @click=${this.handleTabChange}
              >
              <svg class="image-info-icon icon" viewBox="0 0 20 20">
                <use href="#C_Icon_Image_Info"></use>
              </svg>
                Metadata
              </button>
            </div>

            <div class="modal-body">
              ${this._activeTab === 'usage' ? this.renderUsageTab() : this.renderInfoTab()}
            </div>

          </div>

        </div>
        ` : ''}
      </dialog>
    `;
  }

  renderMediaPreview() {
    if (isImage(this.media.url) || this.media.type === MediaType.IMAGE) {
      const subtype = getSubtype(this.media);
      const fullUrl = resolveMediaUrl(this.media.url, this.org, this.repo);
      const isExternal = isExternalUrl(fullUrl);
      const optimized = !isExternal
        ? optimizeImageUrls(this.media.url, [800, 1200, 1600])
        : null;
      if (optimized) {
        return html`
          <div class="image-preview-container">
            <picture>
              <source type="image/webp" srcset="${optimized.webpSrcset}" sizes="min(50vw, 600px)">
              <img src="${optimized.fallbackUrl}" srcset="${optimized.fallbackSrcset}" sizes="min(50vw, 600px)" alt="${this.media.alt || ''}" class="preview-image">
            </picture>
            <div class="subtype-label">${subtype}</div>
          </div>
        `;
      }
      return html`
        <div class="image-preview-container">
          <img src="${this.media.url}" alt="${this.media.alt || ''}" class="preview-image">
          <div class="subtype-label">${subtype}</div>
        </div>
      `;
    }
    if (isVideo(this.media.url) || isExternalVideoUrl(this.media.url)) {
      const embedUrl = getVideoEmbedUrl(this.media.url);
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
      if (isExternalVideoUrl(this.media.url)) {
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
        <video src="${this.media.url}" controls class="preview-video">
          Your browser does not support the video tag.
        </video>
      `;
    }
    if (isPdfUrl(this.media.url)) {
      const blobUrl = this._pdfBlobUrls.get(this.media.url);

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

      return html`
        <div class="pdf-preview-container">
          <div class="document-placeholder">
            <svg class="icon" viewBox="0 0 20 20">
              <use href="#S2_Icon_PDF_20_N"></use>
            </svg>
            <div class="pdf-info">
              <span class="pdf-name">${getFileName(this.media.url)}</span>
              <span class="pdf-type">PDF Document</span>
              <span class="pdf-loading">Loading...</span>
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

  renderExifSection() {
    if (!isImage(this.media.url)) {
      return '';
    }

    if (this._loading) {
      return html`<div class="loading">Loading metadata...</div>`;
    }

    const hasExtendedMetadata = this._comprehensiveMetadata;

    if (!hasExtendedMetadata) {
      return html`
        <div class="metadata-section">
          <div class="metadata-grid-container">
            <div class="metadata-grid">
              <div class="exif-row no-data">
                <span class="exif-value">No extended metadata available</span>
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
              <div class="metadata-label">File Size</div>
              <div class="metadata-value">${this._fileSize || 'Loading...'}</div>
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
    const { org } = this;
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
          ${Object.entries(groupedUsages).map(([doc, usages]) => {
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
                    <p class="usage-org">${org}</p>
                    <button type="button" size="small" class="icon-button toggle-actions" @click=${this.showActions}>
                      <svg class="icon" viewBox="0 0 22 20">
                        <use href="#S2_Icon_ChevronRight_20_N"></use>
                      </svg>
                    </button>
                  </div>
                  <div class="actions-container">
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
    this._resetState();
    this.dispatchEvent(new CustomEvent('close'));
  }

  handleBackdropClick(e) {
    if (e.target === e.currentTarget) {
      this.handleClose();
    }
  }

  handleTabChange(e) {
    const { tab } = e.target.dataset;
    this._activeTab = tab;
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
    const documentHeading = e.target.closest('.document-heading');
    if (documentHeading) {
      documentHeading.classList.toggle('open');
    }
  }

  _cleanupPendingRequests() {
    this._pendingRequests.forEach((controller) => {
      controller.abort();
    });
    this._pendingRequests.clear();
  }

  _resetState() {
    this.media = null;
    this._exifData = null;
    this._fileSize = null;
    this._mimeType = null;
    this._mediaOrigin = null;
    this._mediaPath = null;
    this.usageData = [];
    this._imageDimensions = null;
    this._comprehensiveMetadata = null;
    this._activeTab = 'usage';
  }
}

customElements.define('nx-media-info', NxMediaInfo);
