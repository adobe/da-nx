// Template fragments for media library components
import { html } from 'da-lit';
import { getFileName } from './utils.js';

// ============================================================================
// SEARCH HIGHLIGHTING
// ============================================================================

export function highlightMatch(text, query) {
  if (!query || !text) return text;
  const regex = new RegExp(`(${query})`, 'ig');
  return text.replace(regex, '<mark>$1</mark>');
}

export function getMediaName(media) {
  return media.name || getFileName(media.url) || 'Unknown';
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

export function createMediaEventHandlers(component) {
  return {
    handleMediaClick: (media) => {
      component.dispatchEvent(new CustomEvent('mediaClick', { detail: { media } }));
    },

    handleMediaCopy: (media) => {
      component.dispatchEvent(new CustomEvent('mediaCopy', { detail: { media } }));
    },

    handlePreviewClick: (media) => {
      navigator.clipboard.writeText(media.url).catch((err) => {
        // eslint-disable-next-line no-console
        console.error('Failed to copy URL:', err);
      });
    },
  };
}

// ============================================================================
// PERFORMANCE MONITORING
// ============================================================================

export function measurePerformance(name, fn) {
  const start = performance.now();
  const result = fn();
  const end = performance.now();

  if (end - start > 16) {
    // eslint-disable-next-line no-console
    console.warn(`Slow operation: ${name} took ${(end - start).toFixed(2)}ms`);
  }

  return result;
}

// ============================================================================
// STATIC TEMPLATES (Cached)
// ============================================================================

export const staticTemplates = {
  // Empty state templates
  emptyState: html`
    <div class="empty-state">
      <h2>Discovering media usages...</h2>
      <p>Media files will appear here once discovered.</p>
    </div>
  `,

  // Alt status templates
  missingAlt: html`
    <span class="missing-alt-indicator" title="Missing alt text">
      <svg class="alert-icon" viewBox="0 0 18 18">
        <use href="#S2_Icon_AlertCircle_18_N"></use>
      </svg>
    </span>
  `,

  altPresent: html`
    <span class="alt-present">
      <svg class="checkmark-icon" viewBox="0 0 18 18">
        <use href="#S2_Icon_CheckmarkCircle_18_N"></use>
      </svg>
    </span>
  `,

  // File type placeholder templates
  videoPlaceholder: html`
    <div class="video-preview-container">
      <div class="video-preview-background">
        <svg class="video-icon" viewBox="0 0 20 20">
          <use href="#S2_Icon_Video_20_N"></use>
        </svg>
        <div class="video-info">
          <span class="video-name"></span>
          <span class="video-type">Video File</span>
        </div>
      </div>
    </div>
  `,

  pdfPlaceholder: html`
    <div class="pdf-preview-container">
      <div class="pdf-preview-background">
        <svg class="pdf-icon" viewBox="0 0 20 20">
          <use href="#S2_Icon_PDF_20_N"></use>
        </svg>
        <div class="pdf-info">
          <span class="pdf-name"></span>
          <span class="pdf-type">PDF Document</span>
        </div>
      </div>
    </div>
  `,

  fragmentPlaceholder: html`
    <div class="fragment-preview-container">
      <div class="fragment-preview-background">
        <svg class="fragment-icon" viewBox="0 0 18 18">
          <use href="#Smock_DocumentFragment_18_N"></use>
        </svg>
        <div class="fragment-info">
          <span class="fragment-name"></span>
          <span class="fragment-type">Fragment</span>
        </div>
      </div>
    </div>
  `,

  unknownPlaceholder: html`
    <div class="unknown-placeholder">
      <svg class="unknown-icon" viewBox="0 0 20 20">
        <use href="#S2IconHome20N-icon"></use>
      </svg>
    </div>
  `,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
