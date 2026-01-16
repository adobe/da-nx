import { html, LitElement } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import runScan, { loadMediaSheetIfModified } from '../../utils/processing.js';
import { ensureAuthenticated } from '../../utils/utils.js';

const styles = await getStyle(import.meta.url);
const nx = `${new URL(import.meta.url).origin}/nx`;
const sl = await getStyle(`${nx}/public/sl/styles.css`);
const slComponents = await getStyle(`${nx}/public/sl/components.css`);

const CONFIG = {
  POLLING_INTERVAL: 60000,
  BATCH_SIZE: 10,
  BATCH_DELAY: 50,
};

class NxMediaScan extends LitElement {
  static properties = {
    sitePath: { attribute: false },
    _isScanning: { state: true },
    _pollingInterval: { state: true },
    _pollingStarted: { state: true },
  };

  constructor() {
    super();
    this.sitePath = null;
    this._isScanning = false;
    this._pollingInterval = null;
    this._pollingStarted = false;
    this._batchQueue = [];
    this._batchTimeout = null;
    this._currentProgress = { pages: 0, mediaFiles: 0, mediaReferences: 0 };
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, slComponents, styles];

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
        try {
          const isAuthenticated = await ensureAuthenticated();
          if (!isAuthenticated) return;

          const { hasChanged, mediaData } = await loadMediaSheetIfModified(this.sitePath);

          if (hasChanged && mediaData) {
            this.dispatchEvent(new CustomEvent('mediaDataUpdated', {
              detail: {
                mediaData,
                hasChanges: hasChanged,
              },
            }));
          }
        } catch (error) {
          // Silent fail for polling - don't spam console
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

    try {
      const isAuthenticated = await ensureAuthenticated();
      if (!isAuthenticated) {
        this.dispatchEvent(new CustomEvent('scanError', {
          detail: { error: 'Authentication required to scan media library.' },
        }));
        return;
      }
    } catch (error) {
      this.dispatchEvent(new CustomEvent('scanError', {
        detail: { error: 'Failed to verify authentication.' },
      }));
      return;
    }

    this._isScanning = true;
    this._currentProgress = { pages: 0, mediaFiles: 0, mediaReferences: 0 };

    this.pausePolling();
    this.dispatchEvent(new CustomEvent('scanStart'));
    window.dispatchEvent(new CustomEvent('scanStart'));

    try {
      const result = await runScan(
        this.sitePath,
        this.updateScanProgress.bind(this),
        this.updateProgressiveData.bind(this),
      );

      const finalProgress = {
        hasChanges: result.hasChanges,
        mediaFiles: this._currentProgress.mediaFiles,
        mediaReferences: result.mediaData?.length || 0,
        pages: this._currentProgress.pages,
        duration: result.duration,
      };

      if (finalProgress.hasChanges && result.mediaData) {
        this.dispatchEvent(new CustomEvent('scanComplete', {
          detail: {
            mediaData: result.mediaData,
            hasChanges: finalProgress.hasChanges,
            duration: finalProgress.duration,
            mediaFiles: finalProgress.mediaFiles,
            mediaReferences: finalProgress.mediaReferences,
            pages: finalProgress.pages,
          },
        }));
        window.dispatchEvent(new CustomEvent('scanComplete', {
          detail: {
            mediaData: result.mediaData,
            hasChanges: finalProgress.hasChanges,
            duration: finalProgress.duration,
            mediaFiles: finalProgress.mediaFiles,
            mediaReferences: finalProgress.mediaReferences,
            pages: finalProgress.pages,
          },
        }));

        this.dispatchEvent(new CustomEvent('mediaDataUpdated', {
          detail: {
            mediaData: result.mediaData,
            hasChanges: finalProgress.hasChanges,
            duration: finalProgress.duration,
            mediaFiles: finalProgress.mediaFiles,
            mediaReferences: finalProgress.mediaReferences,
            pages: finalProgress.pages,
          },
        }));
      } else {
        this.dispatchEvent(new CustomEvent('scanComplete', {
          detail: {
            mediaData: null,
            hasChanges: false,
            duration: result.duration,
            mediaFiles: finalProgress.mediaFiles,
            mediaReferences: 0,
            pages: finalProgress.pages,
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
      this._currentProgress.pages = totalScanned;
    }
    if (type === 'mediaFile') {
      this._currentProgress.mediaFiles = totalScanned;
    }
    if (type === 'mediaReference') {
      this._currentProgress.mediaReferences = totalScanned;
    }

    const progressData = {
      pages: this._currentProgress.pages,
      mediaFiles: this._currentProgress.mediaFiles,
      mediaReferences: this._currentProgress.mediaReferences,
      duration: null,
      hasChanges: null,
    };

    this.dispatchEvent(new CustomEvent('scanProgress', {
      detail: {
        type,
        totalScanned,
        progress: progressData,
      },
    }));
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
