import { html, LitElement } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import getSvg from '../../../../public/utils/svg.js';
import runScan, { loadMediaSheet, loadMediaSheetIfModified } from '../../utils/processing.js';

const styles = await getStyle(import.meta.url);
const nx = `${new URL(import.meta.url).origin}/nx`;
const sl = await getStyle(`${nx}/public/sl/styles.css`);
const slComponents = await getStyle(`${nx}/public/sl/components.css`);

const ICONS = [`${nx}/public/icons/S2_Icon_Refresh_20_N.svg`];

// Configuration constants
const CONFIG = { POLLING_INTERVAL: 60000 }; // 1 minute

class NxMediaScan extends LitElement {
  static properties = {
    sitePath: { attribute: false },
    // Internal scan state
    _isScanning: { state: true },
    _scanProgress: { state: true },
    _statusTimeout: { state: true },
    // Polling state
    _pollingInterval: { state: true },
    _pollingStarted: { state: true },
    // Initialization state
    _initialized: { state: true },
  };

  constructor() {
    super();
    this.sitePath = null;
    this._isScanning = false;
    this._scanProgress = { pages: 0, media: 0, duration: null, hasChanges: null };
    this._statusTimeout = null;
    this._pollingInterval = null;
    this._pollingStarted = false;
    this._initialized = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, slComponents, styles];
    getSvg({ parent: this.shadowRoot, paths: ICONS });

    // Initialize if sitePath is already set
    if (this.sitePath) {
      this.initialize();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._statusTimeout) {
      clearTimeout(this._statusTimeout);
    }
    if (this._pollingInterval) {
      clearInterval(this._pollingInterval);
    }
  }

  updated(changedProperties) {
    super.updated(changedProperties);

    // Auto-start initialization when sitePath is set or changes
    // (but only if not already initialized)
    if (changedProperties.has('sitePath') && this.sitePath && !this._initialized) {
      this.initialize();
    }

    // Handle scan completion status timeout
    if (this._scanProgress?.duration && !this._isScanning && !this._statusTimeout) {
      this.setScanStatusTimeout();
    }

    if (this._isScanning && this._statusTimeout) {
      clearTimeout(this._statusTimeout);
      this._statusTimeout = null;
    }
  }

  // ============================================================================
  // INITIALIZATION & POLLING
  // ============================================================================

  async initialize() {
    if (!this.sitePath) {
      return;
    }

    if (this._initialized) {
      return;
    }

    // Set initialized flag immediately to prevent duplicate initialization
    this._initialized = true;

    const [org, repo] = this.sitePath.split('/').slice(1, 3);
    if (!(org && repo)) {
      return;
    }

    // Run scan first to ensure we have latest data
    await this.startScan();

    // After scan completes, start polling
    if (!this._pollingStarted) {
      this.startPolling();
      this._pollingStarted = true;
    }
  }

  startPolling() {
    this._pollingInterval = setInterval(async () => {
      if (this.sitePath && !this._isScanning) {
        const [org, repo] = this.sitePath.split('/').slice(1, 3);
        if (org && repo) {
          // Use the combined method that checks modification and loads data
          const { hasChanged, mediaData } = await loadMediaSheetIfModified(org, repo);

          if (hasChanged && mediaData) {
            this.dispatchEvent(new CustomEvent('mediaDataUpdated', {
              detail: {
                mediaData,
                hasChanges: hasChanged,
              },
            }));
          }
        }
      }
    }, CONFIG.POLLING_INTERVAL);
  }

  pausePolling() {
    if (this._pollingInterval) {
      clearInterval(this._pollingInterval);
      this._pollingInterval = null;
    }
  }

  resumePolling() {
    if (!this._pollingInterval && this._pollingStarted && !this._isScanning) {
      this.startPolling();
    }
  }

  async loadMediaData(org, repo) {
    try {
      const mediaData = await loadMediaSheet(org, repo);

      if (mediaData && mediaData.length > 0) {
        // Dispatch data update event to main component
        this.dispatchEvent(new CustomEvent('mediaDataUpdated', {
          detail: {
            mediaData,
            hasChanges: false, // Data load, not a change
          },
        }));
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[SCAN] Failed to load media data:', error);
    }
  }

  // ============================================================================
  // SCAN OPERATIONS
  // ============================================================================

  async startScan() {
    if (!this.sitePath) {
      return;
    }

    const [org, repo] = this.sitePath.split('/').slice(1, 3);
    if (!(org && repo)) {
      return;
    }

    this._isScanning = true;
    this._scanProgress = { pages: 0, media: 0, duration: null, hasChanges: null };

    // Pause polling during scan
    this.pausePolling();

    // Emit scan start event
    this.dispatchEvent(new CustomEvent('scanStart'));

    try {
      const result = await runScan(
        this.sitePath,
        this.updateScanProgress.bind(this),
      );

      // Update scan results
      this._scanProgress.duration = result.duration;
      this._scanProgress.hasChanges = result.hasChanges;

      if (result.hasChanges && result.mediaData) {
        this._scanProgress.media = result.mediaData.length;

        // Emit scan complete event with results
        this.dispatchEvent(new CustomEvent('scanComplete', {
          detail: {
            mediaData: result.mediaData,
            hasChanges: result.hasChanges,
            duration: result.duration,
          },
        }));

        // Also dispatch data update event
        this.dispatchEvent(new CustomEvent('mediaDataUpdated', {
          detail: {
            mediaData: result.mediaData,
            hasChanges: result.hasChanges,
          },
        }));
      } else {
        // No changes found
        this.dispatchEvent(new CustomEvent('scanComplete', {
          detail: {
            mediaData: null,
            hasChanges: false,
            duration: result.duration,
          },
        }));
      }
    } catch (error) {
      if (error.message && error.message.includes('Scan already in progress')) {
        // Scan already in progress, ignore
      } else {
        // eslint-disable-next-line no-console
        console.error('Scan failed:', error);

        // Emit scan error event
        this.dispatchEvent(new CustomEvent('scanError', { detail: { error: error.message } }));
      }
    } finally {
      this._isScanning = false;

      // Resume polling after scan completes
      this.resumePolling();
    }
  }

  updateScanProgress(type, totalScanned) {
    if (type === 'page') {
      this._scanProgress = { ...this._scanProgress, pages: totalScanned };
    }
    if (type === 'media') {
      this._scanProgress = { ...this._scanProgress, media: totalScanned };
    }

    // Dispatch progress event to parent
    this.dispatchEvent(new CustomEvent('scanProgress', { detail: { type, totalScanned, progress: this._scanProgress } }));

    // Trigger re-render for progress update
    this.requestUpdate();
  }

  setScanStatusTimeout(duration = 5000) {
    if (this._statusTimeout) {
      clearTimeout(this._statusTimeout);
    }

    this._statusTimeout = setTimeout(() => {
      this.dispatchEvent(new CustomEvent('clearScanStatus'));
      this._statusTimeout = null;
    }, duration);
  }

  renderScanProgress() {
    if (this._isScanning) {
      return html`
        <div class="scanning-indicator">
          <svg class="spinner-icon">
            <use href="#S2_Icon_Refresh_20_N"></use>
          </svg>
          <span class="scanning-text">
            ${this._scanProgress?.pages || 0} pages, ${this._scanProgress?.media || 0} media
          </span>
        </div>
      `;
    }

    if (this._scanProgress?.duration) {
      const durationText = ` in ${this._scanProgress.duration}`;

      if (this._scanProgress.hasChanges === false) {
        return html`
          <div class="scanning-indicator completed no-changes">
            <span class="scanning-text">
              No changes found${durationText}
            </span>
          </div>
        `;
      }

      // Show success message only if hasChanges is explicitly true
      if (this._scanProgress.hasChanges === true) {
        return html`
          <div class="scanning-indicator completed">
            <span class="scanning-text">
              Found ${this._scanProgress?.media || 0} media${durationText}
            </span>
          </div>
        `;
      }

      // Default case
      return html`
        <div class="scanning-indicator completed">
          <span class="scanning-text">
            Scan completed${durationText}
          </span>
        </div>
      `;
    }

    return '';
  }

  render() {
    return html`
      <div class="scan-container">
        ${this.renderScanProgress()}
      </div>
    `;
  }
}

customElements.define('nx-media-scan', NxMediaScan);
