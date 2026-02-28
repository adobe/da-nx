import { html } from 'da-lit';
import { getFileName } from '../core/files.js';

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function highlightMatch(text, query) {
  if (!query || !text) return escapeHtml(text);
  const escapedText = escapeHtml(text);
  const regex = new RegExp(`(${escapeRegExp(escapeHtml(query))})`, 'ig');
  return escapedText.replace(regex, '<mark>$1</mark>');
}

export function getMediaName(media) {
  return media.name || getFileName(media.url) || 'Unknown';
}

export function createMediaEventHandlers(component) {
  return {
    handleMediaClick: (media) => {
      component.dispatchEvent(new CustomEvent('mediaClick', { detail: { media } }));
    },

    handleMediaCopy: (media) => {
      component.dispatchEvent(new CustomEvent('mediaCopy', { detail: { media } }));
    },
  };
}

export const staticTemplates = {
  // Uses icon from grid's ICONS (grid.js loads S2_Icon_AlertCircle_18_N); change icon id if grid loads differ
  unknownPlaceholder: html`
    <div class="unknown-placeholder">
      <svg class="unknown-icon" viewBox="0 0 20 20">
        <use href="#S2_Icon_AlertCircle_18_N"></use>
      </svg>
    </div>
  `,
};
