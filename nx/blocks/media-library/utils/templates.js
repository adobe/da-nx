// Template fragments for media library components
import { html, repeat } from 'da-lit';
import { getFileName, getDisplayMediaType, isVideo, isPdf } from './utils.js';

// ============================================================================
// SCROLL UTILITIES
// ============================================================================

export const SCROLL_CONSTANTS = {
  // Grid constants
  GRID_ITEM_WIDTH: 350,
  GRID_ITEM_HEIGHT: 360,
  GRID_CARD_SPACING: 20,

  // List constants
  LIST_ITEM_HEIGHT: 80,

  // Virtual scroll constants
  BUFFER_SIZE: 5,
  SCROLL_THROTTLE: 16, // 60fps

  // Performance targets
  MAX_VISIBLE_ITEMS: 20,
  MAX_BUFFER_ITEMS: 5,
};

// ============================================================================
// VIRTUAL SCROLL LOGIC
// ============================================================================

export function calculateVisibleRange(container, itemHeight, bufferSize, totalItems, colCount = 1) {
  if (!container || !totalItems) return { start: 0, end: 0 };

  const { scrollTop } = container;
  const containerHeight = container.clientHeight;
  const scrollBottom = scrollTop + containerHeight;

  // For grid layout, we need to calculate based on rows, not individual items
  const rowHeight = itemHeight;
  const startRow = Math.floor(scrollTop / rowHeight);
  const endRow = Math.ceil(scrollBottom / rowHeight);

  // Calculate items based on rows and columns
  const bufferStartRow = Math.max(0, startRow - bufferSize);
  const bufferEndRow = Math.min(Math.ceil(totalItems / colCount), endRow + bufferSize);

  const start = bufferStartRow * colCount;
  const end = Math.min(totalItems, bufferEndRow * colCount);

  return {
    start,
    end,
    needsUpdate: true,
  };
}

export function needsUpdate(newStart, newEnd, currentStart, currentEnd, renderedItems) {
  // Check if we need to add new items
  for (let i = newStart; i < newEnd; i += 1) {
    if (!renderedItems.has(i)) {
      return true;
    }
  }

  // Check if we need to remove items
  for (let i = currentStart; i < currentEnd; i += 1) {
    if (i < newStart || i >= newEnd) {
      return true;
    }
  }

  return false;
}

export function calculateGridPosition(index, colCount, itemWidth, itemHeight, spacing) {
  const row = Math.floor(index / colCount);
  const col = index % colCount;
  const top = row * (itemHeight + spacing);
  const left = col * (itemWidth + spacing);

  return { top, left, row, col };
}

export function calculateListPosition(index, itemHeight) {
  const top = index * itemHeight;
  return { top };
}

export function throttleScroll(callback, delay = SCROLL_CONSTANTS.SCROLL_THROTTLE) {
  let timeoutId;
  return function throttled(...args) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => callback.apply(this, args), delay);
  };
}

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

  if (end - start > SCROLL_CONSTANTS.SCROLL_THROTTLE) {
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

  unknownPlaceholder: html`
    <div class="unknown-placeholder">
      <svg class="unknown-icon" viewBox="0 0 20 20">
        <use href="#S2IconHome20N-icon"></use>
      </svg>
    </div>
  `,
};

// ============================================================================
// GRID TEMPLATES
// ============================================================================

export const gridTemplates = {
  // Media card template
  mediaCard: (media, index, position, handlers, renderHelpers) => html`
    <div
      class="media-card"
      data-index="${index}"
      style="top: ${position.top}px; left: ${position.left}px; width: ${position.width}px; height: ${position.height}px;"
    >
      <div class="media-preview clickable" @click=${handlers.mediaClick}>
        ${renderHelpers.mediaPreview(media)}
      </div>
      <div class="media-info">
        <h3 class="media-name">${renderHelpers.highlightedName(media)}</h3>
        <div class="media-meta">
          <span class="media-type">${renderHelpers.displayType(media)}</span>
          <span class="media-used" title="Usage count">
            ${media.folderUsageCount !== undefined ? media.folderUsageCount : (media.usageCount || 0)}
          </span>
          <div class="media-actions">
            <sl-button variant="primary outline" size="small" @click=${(e) => { e.stopPropagation(); handlers.copyClick(); }} title="Copy to clipboard">
              COPY
            </sl-button>
            ${renderHelpers.altStatus(media)}
          </div>
        </div>
        ${renderHelpers.highlightedAlt(media)}
        ${renderHelpers.highlightedDoc(media)}
      </div>
    </div>
  `,

  // Grid container template
  gridContainer: (totalHeight, visibleItems, renderCard) => html`
    <main class="media-main">
      <div class="media-grid" style="height: ${totalHeight}px;">
        ${repeat(visibleItems, (media) => media.url, renderCard)}
      </div>
    </main>
  `,
};

// ============================================================================
// LIST TEMPLATES
// ============================================================================

export const listTemplates = {
  // List item template
  listItem: (media, index, position, handlers, renderHelpers) => html`
    <div
      class="media-item"
      data-index="${index}"
      style="top: ${position.top}px;"
    >
      <div class="item-preview clickable" @click=${handlers.mediaClick} title="Click to view media details">
        ${renderHelpers.mediaPreview(media)}
      </div>
      <div class="item-name">
        ${renderHelpers.highlightedName(media)}
      </div>
      <div class="item-type">
        ${renderHelpers.displayType(media)}
      </div>
      <div class="item-usage">
        <span class="media-used" title="Usage count">
          ${media._folderUsageCount !== undefined ? media._folderUsageCount : (media.usageCount || 0)}
        </span>
      </div>
      <div class="item-alt">
        ${renderHelpers.altStatus(media)}
      </div>
      <div class="item-actions">
        <sl-button variant="primary outline" size="small" @click=${(e) => { e.stopPropagation(); handlers.copyClick(); }} title="Copy to clipboard">
          COPY
        </sl-button>
      </div>
    </div>
  `,

  // List container template
  listContainer: (totalHeight, visibleItems, renderItem) => html`
    <main class="list-main">
      <div class="list-header">
        <div class="header-cell">Preview</div>
        <div class="header-cell">Name</div>
        <div class="header-cell">Type</div>
        <div class="header-cell">Usage</div>
        <div class="header-cell">Alt</div>
        <div class="header-cell">Media Info</div>
      </div>
      <div class="list-content">
        <div class="list-grid" style="height: ${totalHeight}px;">
          ${repeat(visibleItems, (media) => media.url, renderItem)}
        </div>
      </div>
    </main>
  `,

};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Handler factories for creating consistent event handlers
export const handlerFactories = {
  createGridHandlers: (media, eventHandlers) => ({
    mediaClick: () => eventHandlers.handleMediaClick(media),
    copyClick: () => eventHandlers.handleMediaCopy(media),
  }),

  createListHandlers: (media, eventHandlers) => ({
    mediaClick: () => eventHandlers.handleMediaClick(media),
    copyClick: () => eventHandlers.handleMediaCopy(media),
  }),
};

export const renderHelpers = {
  // Highlighted text helpers
  highlightedName: (media, searchQuery) => {
    const name = getMediaName(media);
    return html`<span .innerHTML=${highlightMatch(name, searchQuery)}></span>`;
  },

  highlightedAlt: (media, searchQuery) => {
    if (!media.alt) return '';
    return html`<div class="media-alt" .innerHTML=${highlightMatch(media.alt, searchQuery)}></div>`;
  },

  highlightedDoc: (media, searchQuery) => {
    if (!media.doc) return '';
    return html`<div class="media-doc" .innerHTML=${highlightMatch(media.doc, searchQuery)}></div>`;
  },

  // Alt status helper
  // eslint-disable-next-line no-unused-vars
  altStatus: (media, handlers) => {
    // Only show alt status for images
    if (media.type && media.type.startsWith('img >')) {
      if (media.alt === null) {
        return html`
          <span class="missing-alt-indicator" title="Missing alt text">
            <svg class="alert-icon" viewBox="0 0 18 18">
              <use href="#S2_Icon_AlertCircle_18_N"></use>
            </svg>
          </span>
        `;
      }
      if (media.alt === '') {
        return html`
          <span class="decorative-alt-indicator" title="Decorative alt text (empty)">
            <svg class="info-icon" viewBox="0 0 18 18">
              <use href="#S2_Icon_InfoCircle_18_N"></use>
            </svg>
          </span>
        `;
      }
      return staticTemplates.altPresent;
    }
    // Return empty for non-image files (PDFs, videos, etc.)
    return '';
  },

  // Display type helper - shows just the subtype in bold
  displayType: (media) => {
    if (media.type && media.type.includes(' > ')) {
      const [, subtype] = media.type.split(' > ');
      return html`<strong>${subtype.toUpperCase()}</strong>`;
    }
    return html`<strong>${getDisplayMediaType(media)}</strong>`;
  },

  // Media preview helper (from list.js)
  mediaPreview: (media, isImage, isExternalVideoUrl, getVideoThumbnail) => {
    if (isImage(media.url)) {
      const imageUrl = media.url;
      return html`
        <img src="${imageUrl}" alt="${media.alt || ''}" loading="lazy">
      `;
    }

    if (isExternalVideoUrl(media.url)) {
      const thumbnailUrl = getVideoThumbnail(media.url);
      if (thumbnailUrl) {
        return html`
          <div class="video-preview-container">
            <img src="${thumbnailUrl}" alt="Video thumbnail" class="video-thumbnail" loading="lazy">
            <div class="video-overlay">
              <svg class="play-icon" viewBox="0 0 20 20">
                <use href="#S2_Icon_Play_20_N"></use>
              </svg>
            </div>
          </div>
        `;
      }
    }

    if (isVideo(media.url)) {
      return html`
        <div class="video-preview-container">
          <svg class="video-icon" viewBox="0 0 20 20">
            <use href="#S2_Icon_Video_20_N"></use>
          </svg>
        </div>
      `;
    }

    if (isPdf(media.url)) {
      return html`
        <div class="pdf-preview-container">
          <svg class="pdf-icon" viewBox="0 0 20 20">
            <use href="#S2_Icon_PDF_20_N"></use>
          </svg>
        </div>
      `;
    }

    return html`
      <div class="unknown-placeholder">
        <svg class="unknown-icon">
          <use href="#S2_Icon_FileConvert_20_N"></use>
        </svg>
      </div>
    `;
  },
};

// Helper factories for creating consistent rendering helpers
export const helperFactories = {
  createGridHelpers: (media, searchQuery, renderMediaPreview, handlers) => ({
    mediaPreview: () => renderMediaPreview(media),
    highlightedName: () => renderHelpers.highlightedName(media, searchQuery),
    highlightedAlt: () => renderHelpers.highlightedAlt(media, searchQuery),
    highlightedDoc: () => renderHelpers.highlightedDoc(media, searchQuery),
    altStatus: () => renderHelpers.altStatus(media, handlers),
    displayType: () => renderHelpers.displayType(media),
  }),

  createListHelpers: (
    media,
    searchQuery,
    isImage,
    isExternalVideoUrl,
    getVideoThumbnail,
    handlers,
  ) => ({
    mediaPreview: () => renderHelpers.mediaPreview(
      media,
      isImage,
      isExternalVideoUrl,
      getVideoThumbnail,
    ),
    highlightedName: () => renderHelpers.highlightedName(media, searchQuery),
    altStatus: () => renderHelpers.altStatus(media, handlers),
    displayType: () => renderHelpers.displayType(media),
  }),
};
