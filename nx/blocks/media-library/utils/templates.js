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
// STATIC TEMPLATES (Cached)
// ============================================================================

export const staticTemplates = {
  unknownPlaceholder: html`
    <div class="unknown-placeholder">
      <svg class="unknown-icon" viewBox="0 0 20 20">
        <use href="#S2IconHome20N-icon"></use>
      </svg>
    </div>
  `,
};
