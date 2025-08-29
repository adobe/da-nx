import { html, LitElement } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import getSvg from '../../../../utils/svg.js';
import {
  getDisplayMediaType,
  extractRelativePath,
  formatFileSize,
  extractMediaLocation,
  getEditUrl,
  getViewUrl,
  updateDocumentAltText,
  getFileName,
  isImage,
  isVideo,
  isPdf,
  EXIF_JS_URL,
} from '../../utils/utils.js';
import loadScript from '../../../../utils/script.js';
import { daFetch } from '../../../../utils/daFetch.js';
import { DA_ORIGIN } from '../../../../public/utils/constants.js';

const styles = await getStyle(import.meta.url);
const nx = `${new URL(import.meta.url).origin}/nx`;

const ICONS = [
  `${nx}/public/icons/S2_Icon_PDF_20_N.svg`,
];

class NxMediaInfo extends LitElement {
  static properties = {
    media: { attribute: false },
    isOpen: { attribute: false },
    mediaData: { attribute: false },
    org: { attribute: false },
    repo: { attribute: false },
    _activeTab: { state: true },
    _exifData: { state: true },
    _loading: { state: true },
    _fileSize: { state: true },
    _mimeType: { state: true },
    _mediaOrigin: { state: true },
    _mediaPath: { state: true },
    _newAltText: { state: true },
    _usageData: { state: true },
    _usageLoading: { state: true },
    _editingAltUsage: { state: true },
  };

  constructor() {
    super();
    this.isOpen = false;
    this.media = null;
    this._activeTab = 'metadata'; // Default to metadata tab
    this._exifData = null;
    this._loading = false;
    this._fileSize = null;
    this._mimeType = null;
    this._mediaOrigin = null;
    this._mediaPath = null;
    this._newAltText = '';
    this._usageData = [];
    this._usageLoading = false;
    this._editingAltUsage = null;
    this.mediaData = [];
    this._pdfBlobUrls = new Map();
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    // Clean up blob URLs
    this._pdfBlobUrls.forEach((blobUrl) => {
      URL.revokeObjectURL(blobUrl);
    });
    this._pdfBlobUrls.clear();
  }

  updated(changedProperties) {

    if (changedProperties.has('media') && this.media) {
      this.loadFileSize();
      if (isImage(this.media.url)) {
        this.loadExifData();
      }
      if (isPdf(this.media.url)) {
        this.loadPdfWithDaFetch(this.media.url);
      }
      this.loadUsageData();
    }

    if (changedProperties.has('mediaData') && this.mediaData && this.media) {
      this.loadUsageData();
    }

    if (changedProperties.has('_activeTab') && this._activeTab === 'usage') {
      this.loadUsageData();
    }
  }

  async loadExifData() {
    if (!this.media || !isImage(this.media.url)) return;

    this._loading = true;
    try {
      await loadScript(EXIF_JS_URL);

      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        if (typeof window.EXIF !== 'undefined') {
          window.EXIF.getData(img, () => {
            this._exifData = window.EXIF.getAllTags(img);
            this._loading = false;
          });
        } else {
          this._loading = false;
        }
      };

      img.onerror = () => {
        this._loading = false;
      };

      img.src = this.media.url;
    } catch (error) {
      this._loading = false;
    }
  }

  loadUsageData() {
    if (!this.media || !this.media.url || !this.mediaData) return;

    this._usageLoading = true;
    try {
      // Calculate usage data on-demand from raw media data
      this._usageData = this.mediaData
        .filter((item) => item.url === this.media.url && item.doc && item.doc.trim())
        .map((item) => ({
          doc: item.doc,
          alt: item.alt,
          type: item.type,
          firstUsedAt: item.firstUsedAt,
          lastUsedAt: item.lastUsedAt,
          // Add other usage details as needed
        }));

      // Always show usage tab if there's any data for this media
      // Even if no current usage, show the tab for potential usage
      this._activeTab = 'usage';
    } catch (error) {
      this._usageData = [];
      this._activeTab = 'metadata';
    } finally {
      this._usageLoading = false;
    }
  }

  handleClose() {
    this.dispatchEvent(new CustomEvent('close'));
  }

  handleTabChange(e) {
    const { tab } = e.target.dataset;
    this._activeTab = tab;
  }

  handleAltTextInput(e) {
    this._newAltText = e.target.value;
  }

  editAlt(usage) {
    this._editingAltUsage = usage.doc;
    this._newAltText = '';
  }

  cancelAlt() {
    this._editingAltUsage = null;
    this._newAltText = '';
  }

  async saveAlt(usage) {
    if (!this._newAltText.trim()) return;

    try {
      const { org, repo } = this;

      if (!org || !repo) {
        throw new Error('Missing org or repo information');
      }

      await updateDocumentAltText(
        org,
        repo,
        usage.doc,
        this.media.url,
        this._newAltText,
      );

      const usageIndex = this._usageData.findIndex((u) => u.doc === usage.doc);
      if (usageIndex !== -1) {
        this._usageData[usageIndex].alt = this._newAltText;
      }

      const savedAltText = this._newAltText;
      this._editingAltUsage = null;
      this._newAltText = '';

      this.dispatchEvent(new CustomEvent('altTextUpdated', {
        detail: {
          media: this.media,
          usage,
          newAltText: savedAltText,
        },
      }));
    } catch (error) {
      // Silent error handling
    }
  }



  handleEditDocument(docPath) {
    if (!docPath) return;

    const { org, repo } = this;
    if (!org || !repo) return;

    // Get the relative path (without org/repo) for the edit URL
    const editUrl = getEditUrl(org, repo, docPath.replace(`.html`, ''));
    if (editUrl) {
      window.open(editUrl, '_blank');
    }
  }

  async loadPdfWithDaFetch(pdfUrl) {
    if (this._pdfBlobUrls.has(pdfUrl)) return; // Already loading or loaded

    try {
      const url = new URL(pdfUrl);

      let response;

      // Check if URL is from content.da.live - use daFetch for those
      if (url.hostname.includes('content.da.live')) {
        // Convert content.da.live URL to admin.da.live URL
        const path = url.pathname;
        const adminUrl = `${DA_ORIGIN}/source${path}`;
        response = await daFetch(adminUrl);
      } else {
        // For other URLs, use regular fetch
        response = await fetch(pdfUrl);
      }

      if (response.ok) {
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        this._pdfBlobUrls.set(pdfUrl, blobUrl);
        this.requestUpdate();

        // Update file size and MIME type after loading
        this.loadFileSize();
      }
    } catch (error) {
      // Silent error handling
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

  handleViewDocument(docPath) {
    if (!docPath) return;
    const { org, repo } = this;
    if (!org || !repo) return;
    // Get the relative path (without org/repo) for the view URL
    const viewUrl = getViewUrl(org, repo, docPath.replace(`.html`, ''));
    if (viewUrl) {
      window.open(viewUrl, '_blank');
    }
  }

  async loadFileSize() {
    if (!this.media || !this.media.url) return;

    try {
      // For PDFs, try to get info from the blob if available
      if (isPdf(this.media.url) && this._pdfBlobUrls.has(this.media.url)) {
        const blobUrl = this._pdfBlobUrls.get(this.media.url);
        const response = await fetch(blobUrl);
        if (response.ok) {
          const blob = await response.blob();
          this._fileSize = formatFileSize(blob.size);
          this._mimeType = blob.type || 'application/pdf';
        }
      } else {
        // Check if URL is from content.da.live - use daFetch for those
        const url = new URL(this.media.url);
        let response;

        if (url.hostname.includes('content.da.live')) {
          // Convert content.da.live URL to admin.da.live URL for HEAD request
          const path = url.pathname;
          const adminUrl = `${DA_ORIGIN}/source${path}`;
          response = await daFetch(adminUrl, { method: 'HEAD' });
        } else {
          // For other URLs, use regular fetch
          response = await fetch(this.media.url, { method: 'HEAD' });
        }

        if (response.ok) {
          const contentLength = response.headers.get('content-length');
          if (contentLength) {
            this._fileSize = formatFileSize(parseInt(contentLength, 10));
          } else {
            this._fileSize = 'Unknown';
          }

          const contentType = response.headers.get('content-type');
          if (contentType) {
            const [mimeType] = contentType.split(';');
            this._mimeType = mimeType;
          } else {
            this._mimeType = 'Unknown';
          }
        } else {
          this._fileSize = 'Unknown';
          this._mimeType = 'Unknown';
        }
      }

      // Extract media location
      const { origin, path } = extractMediaLocation(this.media.url);
      this._mediaOrigin = origin;
      this._mediaPath = path;
    } catch (error) {
      this._fileSize = 'Unknown';
      this._mimeType = 'Unknown';
      this._mediaOrigin = 'Unknown';
      this._mediaPath = 'Unknown';
    }
  }

  getFileType() {
    return getDisplayMediaType(this.media);
  }

  formatDateTime(isoString) {
    if (!isoString) return 'Unknown';

    try {
      const date = new Date(isoString);
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch (error) {
      return 'Invalid Date';
    }
  }

  renderMediaPreview() {
    if (isImage(this.media.url)) {
      return html`
        <img src="${this.media.url}" alt="${this.media.alt || ''}" class="preview-image">
      `;
    }
    if (isVideo(this.media.url)) {
      return html`
        <video src="${this.media.url}" controls class="preview-video">
          Your browser does not support the video tag.
        </video>
      `;
    }
    if (isPdf(this.media.url)) {
      const blobUrl = this._pdfBlobUrls.get(this.media.url);

      if (blobUrl) {
        // Use authenticated blob URL for iframe
        return html`
          <iframe 
            src="${blobUrl}" 
            class="pdf-preview"
            @load=${this.handlePdfLoad}
            @error=${this.handlePdfError}
          >
          </iframe>
          <div class="document-placeholder">
            <svg class="document-icon" viewBox="0 0 20 20">
              <use href="#S2_Icon_PDF_20_N"></use>
            </svg>
          </div>
        `;
      }

      // Show loading state
      return html`
        <div class="pdf-preview-container">
          <div class="document-placeholder">
            <svg class="document-icon" viewBox="0 0 20 20">
              <use href="#S2_Icon_PDF_20_N"></use>
            </svg>
            <div class="pdf-info">
              <span class="pdf-name">${getFileName(this.media.url)}</span>
              <span class="pdf-type">PDF Document</span>
              <span class="pdf-loading">Loading...</span>
            </div>
          </div>
        </div>
      `;
    }
    return html`
      <div class="preview-placeholder">
        <svg class="document-icon">
          <use href="#S2_Icon_PDF_20_N"></use>
        </svg>
      </div>
    `;
  }

  renderExifSection() {
    if (isImage(this.media.url)) {
      if (this._loading) {
        return html`<div class="loading">Loading EXIF data...</div>`;
      }

      if (this._exifData && Object.keys(this._exifData).length > 0) {
        return html`
          <div class="exif-section">
            <h4>EXIF Data</h4>
            <div class="exif-table">
              ${Object.entries(this._exifData).map(([key, value]) => html`
                <div class="exif-row">
                  <span class="exif-label">${key}:</span>
                  <span class="exif-value">${value}</span>
                </div>
              `)}
            </div>
          </div>
        `;
      }

      return html`
        <div class="exif-section">
          <h4>EXIF Data</h4>
          <div class="exif-table">
            <div class="exif-row no-data">
              <span class="exif-value">No data available</span>
            </div>
          </div>
        </div>
      `;
    }
    return '';
  }

  renderUsageTableRow(usage) {
    const isPdfFile = isPdf(this.media.url);
    const isMissingAlt = !usage.alt && usage.type && usage.type.startsWith('img >');
    const isEditingAlt = this._editingAltUsage === usage.doc;

    return html`
      <tr class="usage-row">
        <td class="type-cell">
          <span class="type-badge">${getDisplayMediaType(usage)}</span>
        </td>
        ${!isPdfFile ? html`
          <td class="alt-cell">
            ${this.renderAltCell(usage, isEditingAlt, isMissingAlt)}
          </td>
        ` : ''}
        <td class="context-cell">
          <div class="context-text">${usage.ctx || 'No context'}</div>
        </td>
        <td class="actions-cell">
          ${this.renderActionsCell(usage, isMissingAlt)}
        </td>
      </tr>
      <tr class="usage-date-row">
        <td colspan="${isPdfFile ? 3 : 4}" class="date-details-cell">
          <div class="date-details">
            <span class="date-item">
              <strong>First used:</strong> ${this.formatDateTime(usage.firstUsedAt)}
            </span>
            <span class="date-item">
              <strong>Last used:</strong> ${this.formatDateTime(usage.lastUsedAt)}
            </span>
          </div>
        </td>
      </tr>
    `;
  }

  renderAltCell(usage, isEditingAlt, isMissingAlt) {
    if (isEditingAlt) {
      return html`
        <div class="alt-edit-form">
          <sl-input 
            type="text" 
            placeholder="Enter alt text..."
            .value=${this._newAltText}
            @input=${this.handleAltTextInput}
            size="small"
          ></sl-input>
          <div class="alt-edit-actions">
            <sl-button type="button" size="small" class="accent" @click=${() => this.saveAlt(usage)}>
              Save
            </sl-button>
            <sl-button type="button" size="small" class="negative" @click=${this.cancelAlt}>
              Cancel
            </sl-button>
          </div>
        </div>
      `;
    }

    if (usage.alt) {
      return html`<span class="alt-text">${usage.alt}</span>`;
    }

    if (isMissingAlt) {
      return html`
        <div class="alt-missing">
          <span class="alt-warning-badge">Missing</span>
          <sl-button type="button" size="small" class="primary" @click=${() => this.editAlt(usage)}>
            Add Alt
          </sl-button>
        </div>
      `;
    }

    return html`<span class="alt-none">-</span>`;
  }

  renderContextCell(usage) {
    if (usage.ctx) {
      return html`<div class="context-text">${usage.ctx}</div>`;
    }
    return html`<span class="context-none">-</span>`;
  }

  renderActionsCell(usage) {
    if (usage.doc) {
      return html`
        <div class="actions-container">
          <sl-button type="button" size="small" class="primary" @click=${() => this.handleViewDocument(usage.doc)} title="View document">
           Preview
          </sl-button>
          <sl-button type="button" size="small" class="primary" @click=${() => this.handleEditDocument(usage.doc)} title="Edit document">
            Edit
          </sl-button>
        </div>
      `;
    }
    return html`<span class="no-actions">-</span>`;
  }

  renderInfoTab() {
    return html`
      <div class="tab-content">
        <div class="metadata-section">
          <div class="metadata-table-container">
            <table class="metadata-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                <tr class="metadata-row">
                  <td class="metadata-label">File Type</td>
                  <td class="metadata-value">${this.getFileType()}</td>
                </tr>
                <tr class="metadata-row">
                  <td class="metadata-label">MIME Type</td>
                  <td class="metadata-value">${this._mimeType || 'Loading...'}</td>
                </tr>
                <tr class="metadata-row">
                  <td class="metadata-label">File Size</td>
                  <td class="metadata-value">${this._fileSize || 'Loading...'}</td>
                </tr>
                <tr class="metadata-row">
                  <td class="metadata-label">Media Origin</td>
                  <td class="metadata-value">${this._mediaOrigin || 'Loading...'}</td>
                </tr>
                <tr class="metadata-row">
                  <td class="metadata-label">Media Path</td>
                  <td class="metadata-value">${this._mediaPath || 'Loading...'}</td>
                </tr>
                <tr class="metadata-row">
                  <td class="metadata-label">Usage Count</td>
                  <td class="metadata-value">${this.media.usageCount || 0}</td>
                </tr>
              </tbody>
            </table>
          </div>

          ${this.renderExifSection()}
        </div>
      </div>
    `;
  }

  renderUsageContent() {
    if (this._usageLoading) {
      return html`
        <div class="loading-state">
          <div class="spinner"></div>
          <p>Loading usage details...</p>
        </div>
      `;
    }

    if (this._usageData.length > 0) {
      // Group usages by document
      const groupedUsages = this._usageData.reduce((groups, usage) => {
        const doc = usage.doc || 'Unknown Document';
        if (!groups[doc]) {
          groups[doc] = [];
        }
        groups[doc].push(usage);
        return groups;
      }, {});

      return html`
        <div class="usage-sections">
          ${Object.entries(groupedUsages).map(([doc, usages]) => html`
            <div class="usage-section">
              <div class="document-heading">
                <h3>${extractRelativePath(doc)}</h3>
              </div>
              <div class="usage-table-container">
                <table class="usage-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      ${isImage(this.media.url) ? html`<th>Alt Text</th>` : ''}
                      <th>Context</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${usages.map((usage) => this.renderUsageTableRow(usage))}
                  </tbody>
                </table>
              </div>
            </div>
          `)}
        </div>
      `;
    }

    return html`
      <div class="no-usage">
        <p>Not Used</p>
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

  render() {
    if (!this.isOpen || !this.media) return '';

    const displayName = this.media.name || getFileName(this.media.url) || 'Media Details';

    return html`
      <div class="modal-overlay" @click=${this.handleClose}>
        <div class="modal-content" @click=${(e) => e.stopPropagation()}>
          <div class="modal-header">
            <h2>${displayName}</h2>
            <sl-button type="button" size="small" class="primary outline" @click=${this.handleClose} title="Close">
              Close
            </sl-button>
          </div>

          <div class="media-preview-section">
            ${this.renderMediaPreview()}
          </div>

          <div class="modal-tabs">
            <button 
              type="button"
              class="tab-btn ${this._activeTab === 'usage' ? 'active' : ''}"
              data-tab="usage"
              @click=${this.handleTabChange}
            >
              Usage (${this._usageData.length})
            </button>
            <button 
              type="button"
              class="tab-btn ${this._activeTab === 'metadata' ? 'active' : ''}"
              data-tab="metadata"
              @click=${this.handleTabChange}
            >
              Metadata
            </button>
          </div>

          <div class="modal-body">
            ${this._activeTab === 'usage' ? this.renderUsageTab() : this.renderInfoTab()}
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('nx-media-info', NxMediaInfo);
