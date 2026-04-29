import { html } from 'da-lit';
import { getFileName, pathLabelWithoutDomain, decodeDisplayName } from '../core/files.js';
import { isFragmentMedia, isPdfUrl } from '../core/media.js';

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function mergeHighlightRanges(ranges) {
  if (!ranges.length) return [];
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged = [[...sorted[0]]];
  for (let i = 1; i < sorted.length; i += 1) {
    const [s, e] = sorted[i];
    const last = merged[merged.length - 1];
    if (s <= last[1]) {
      last[1] = Math.max(last[1], e);
    } else {
      merged.push([s, e]);
    }
  }
  return merged;
}

export function highlightMatch(text, query) {
  if (!text) return '';
  const escapedText = escapeHtml(text);
  if (!query || !query.trim()) return escapedText;

  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return escapedText;

  const ranges = [];
  for (const token of tokens) {
    const re = new RegExp(escapeRegExp(token), 'gi');
    let m = re.exec(escapedText);
    while (m !== null) {
      ranges.push([m.index, m.index + m[0].length]);
      m = re.exec(escapedText);
    }
  }

  const merged = mergeHighlightRanges(ranges);
  let result = escapedText;
  for (let i = merged.length - 1; i >= 0; i -= 1) {
    const [start, end] = merged[i];
    result = `${result.slice(0, start)}<mark>${result.slice(start, end)}</mark>${result.slice(end)}`;
  }
  return result;
}

export function getMediaName(media) {
  const name = media.displayName || media.name || getFileName(media.url) || 'Unknown';
  if (!name || name === 'Unknown') return name;

  return decodeDisplayName(name);
}

export function getMediaCardLabel(media) {
  const url = media?.url;
  if (url && (isFragmentMedia(media) || isPdfUrl(url))) {
    const pathLabel = pathLabelWithoutDomain(url);
    if (pathLabel) {
      const decoded = decodeDisplayName(pathLabel);
      return decoded.startsWith('/') ? decoded : `/${decoded}`;
    }
  }
  return getMediaName(media);
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
  unknownPlaceholder: html`
    <div class="unknown-placeholder">
      <svg class="unknown-icon" viewBox="0 0 20 20">
        <use href="#S2_Icon_AlertCircle_18_N"></use>
      </svg>
    </div>
  `,
};
