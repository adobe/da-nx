import { html, LitElement } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import getSvg from '../../../../public/utils/svg.js';
import runScan, { loadMediaSheetIfModified } from '../../utils/processing.js';

const styles = await getStyle(import.meta.url);
const nx = `${new URL(import.meta.url).origin}/nx`;
const sl = await getStyle(`${nx}/public/sl/styles.css`);
const slComponents = await getStyle(`${nx}/public/sl/components.css`);

const ICONS = [`${nx}/public/icons/S2_Icon_Refresh_20_N.svg`];

const CONFIG = {
  POLLING_INTERVAL: 60000,
  BATCH_SIZE: 10,
  BATCH_DELAY: 50,
};

class NxMediaScan extends LitElement {
  static properties = {
    sitePath: { attribute: false },
    _isScanning: { state: true },
    _scanProgress: { state: true },
    _pollingInterval: { state: true },
    _pollingStarted: { state: true },
  };

  constructor() {
    super();
    this.sitePath = null;
    this._isScanning = false;
    this._scanProgress = { pages: 0, media: 0, duration: null, hasChanges: null };
    this._pollingInterval = null;
    this._pollingStarted = false;
    this._batchQueue = [];
    this._batchTimeout = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, slComponents, styles];
    getSvg({ parent: this.shadowRoot, paths: ICONS });

    if (this.sitePath && !this._pollingStarted) {
      this.startPolling();
      this._pollingStarted = true;
      this.startScan();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._pollingInterval) {
      clearInterval(this._pollingInterval);
    }
    if (this._batchTimeout) {
      clearTimeout(this._batchTimeout);
    }
  }

  updated(changedProperties) {
    super.updated(changedProperties);

    if (changedProperties.has('sitePath') && this.sitePath && !this._pollingStarted) {
      this.startPolling();
      this._pollingStarted = true;
      this.startScan();
    }
  }

  startPolling() {
    this._pollingInterval = setInterval(async () => {
      if (this.sitePath && !this._isScanning) {
        const [org, repo] = this.sitePath.split('/').slice(1, 3);
        if (org && repo) {
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

    this.pausePolling();
    this.dispatchEvent(new CustomEvent('scanStart'));
    window.dispatchEvent(new CustomEvent('scanStart'));

    try {
      const result = await runScan(
        this.sitePath,
        this.updateScanProgress.bind(this),
        this.updateProgressiveData.bind(this),
      );
      this._scanProgress.hasChanges = result.hasChanges;
      this._scanProgress.media = result.mediaData?.length || 0;
      this._scanProgress.duration = result.duration;

      if (this._scanProgress.hasChanges && result.mediaData) {
        this.dispatchEvent(new CustomEvent('scanComplete', {
          detail: {
            mediaData: result.mediaData,
            hasChanges: this._scanProgress.hasChanges,
            duration: this._scanProgress.duration,
          },
        }));
        window.dispatchEvent(new CustomEvent('scanComplete', {
          detail: {
            mediaData: result.mediaData,
            hasChanges: this._scanProgress.hasChanges,
            duration: this._scanProgress.duration,
          },
        }));

        this.dispatchEvent(new CustomEvent('mediaDataUpdated', {
          detail: {
            mediaData: result.mediaData,
            hasChanges: this._scanProgress.hasChanges,
            duration: this._scanProgress.duration,
          },
        }));
      } else {
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
        // Ignore
      } else {
        // eslint-disable-next-line no-console
        console.error('Scan failed:', error);
        this.dispatchEvent(new CustomEvent('scanError', { detail: { error: error.message } }));
      }
    } finally {
      this._isScanning = false;

      this.flushBatchQueue();
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

    this.dispatchEvent(new CustomEvent('scanProgress', { detail: { type, totalScanned, progress: this._scanProgress } }));
    this.requestUpdate();
  }

  updateProgressiveData(mediaItems) {
    this._batchQueue.push(...mediaItems);

    if (this._batchTimeout) {
      clearTimeout(this._batchTimeout);
    }
    if (this._batchQueue.length >= CONFIG.BATCH_SIZE) {
      this.processBatch();
    } else {
      this._batchTimeout = setTimeout(() => {
        this.processBatch();
      }, CONFIG.BATCH_DELAY);
    }
  }

  processBatch() {
    if (this._batchQueue.length === 0) return;

    const batch = this._batchQueue.splice(0, CONFIG.BATCH_SIZE);

    this.dispatchEvent(new CustomEvent('progressiveDataUpdate', {
      detail: { mediaItems: batch },
      bubbles: true,
    }));
    window.dispatchEvent(new CustomEvent('progressiveDataUpdate', { detail: { mediaItems: batch } }));

    if (this._batchQueue.length > 0) {
      this._batchTimeout = setTimeout(() => {
        this.processBatch();
      }, CONFIG.BATCH_DELAY);
    }
  }

  flushBatchQueue() {
    if (!this._batchQueue) {
      this._batchQueue = [];
    }

    if (this._batchTimeout) {
      clearTimeout(this._batchTimeout);
      this._batchTimeout = null;
    }
    while (this._batchQueue.length > 0) {
      this.processBatch();
    }
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
