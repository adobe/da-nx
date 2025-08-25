import { html, LitElement } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import getSvg from '../../../../public/utils/svg.js';
import { getVideoThumbnail, isExternalVideoUrl } from '../../utils/utils.js';
import '../../../../public/sl/components.js';
import {
  SCROLL_CONSTANTS,
  calculateVisibleRange,
  calculateGridPosition,
  throttleScroll,
  createMediaEventHandlers,
  measurePerformance,
  getMediaName,
  highlightMatch,
} from '../../utils/templates.js';
import { isImage, isVideo, isPdf } from '../../utils/utils.js';
import { staticTemplates, gridTemplates, handlerFactories, helperFactories } from '../../utils/templates.js';

const styles = await getStyle(import.meta.url);
const nx = `${new URL(import.meta.url).origin}/nx`;
const sl = await getStyle(`${nx}/public/sl/styles.css`);
const slComponents = await getStyle(`${nx}/public/sl/components.css`);

const ICONS = [
  `${nx}/public/icons/S2_Icon_Video_20_N.svg`,
  `${nx}/public/icons/S2_Icon_PDF_20_N.svg`,
  `${nx}/public/icons/S2_Icon_AlertCircle_18_N.svg`,
  `${nx}/public/icons/S2_Icon_CheckmarkCircle_18_N.svg`,
];

class NxMediaGrid extends LitElement {
  static properties = {
    mediaData: { type: Array },
    searchQuery: { type: String },
  };

  constructor() {
    super();

    // Virtual scroll state
    this.visibleStart = 0;
    this.visibleEnd = SCROLL_CONSTANTS.MAX_VISIBLE_ITEMS;
    this.colCount = 4;
    this.renderedCards = new Set();
    this.previousMediaDataLength = 0;

    // Scroll handling
    this.scrollTimeout = null;
    this.container = null;
    this.scrollListenerAttached = false;

    // Event handlers
    this.eventHandlers = createMediaEventHandlers(this);

    // Constants from scroll.js
    this.itemWidth = SCROLL_CONSTANTS.GRID_ITEM_WIDTH;
    this.itemHeight = SCROLL_CONSTANTS.GRID_ITEM_HEIGHT;
    this.cardSpacing = SCROLL_CONSTANTS.GRID_CARD_SPACING;
    this.bufferSize = SCROLL_CONSTANTS.BUFFER_SIZE;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, slComponents, styles];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
    }
    if (this.container && this.scrollListenerAttached) {
      this.container.removeEventListener('scroll', this.throttledScroll);
      this.scrollListenerAttached = false;
    }
  }

  firstUpdated() {
    this.setupScrollListener();
    window.addEventListener('resize', () => this.updateColCount());
  }

  willUpdate(changedProperties) {
    // Pre-process when mediaData changes
    if (changedProperties.has('mediaData') && this.mediaData) {
      this.preprocessGridData();
    }
  }

  updated(changedProperties) {
    if (changedProperties.has('mediaData') && this.mediaData) {
      this.handleDataChange();

      // Set up scroll listener if container exists but listener isn't attached
      if (!this.scrollListenerAttached) {
        this.setupScrollListener();
      }

      // Update column count
      this.updateColCount();
    }
  }

  // ============================================================================
  // PRE-PROCESSING METHODS
  // ============================================================================

  preprocessGridData() {
    measurePerformance('grid preprocessing', () => {
      this.updateColCount();
      this.resetVirtualScrollState();
    });
  }

  updateColCount() {
    if (!this.container) return;
    const width = this.container.clientWidth;
    if (width === 0) return;

    this.colCount = Math.max(1, Math.floor(width / (this.itemWidth + this.cardSpacing)));
  }

  resetVirtualScrollState() {
    this.visibleStart = 0;
    this.visibleEnd = Math.min(SCROLL_CONSTANTS.MAX_VISIBLE_ITEMS, this.mediaData?.length || 0);
    this.renderedCards.clear();
  }

  handleDataChange() {
    this.updateComplete.then(() => {
      if (this.container && this.previousMediaDataLength > 0) {
        this.container.scrollTop = 0;
      }
      this.previousMediaDataLength = this.mediaData.length;
    });
  }

  // ============================================================================
  // SCROLL HANDLING
  // ============================================================================

  setupScrollListener() {
    this.updateComplete.then(() => {
      this.container = this.shadowRoot.querySelector('.media-main');
      if (this.container && !this.scrollListenerAttached) {
        this.throttledScroll = throttleScroll(this.onScroll.bind(this));
        this.container.addEventListener('scroll', this.throttledScroll);
        this.scrollListenerAttached = true;
      }
    });
  }

  onScroll() {
    if (!this.container || !this.mediaData) return;

    const range = calculateVisibleRange(
      this.container,
      this.itemHeight + this.cardSpacing,
      this.bufferSize,
      this.mediaData.length,
      this.colCount,
    );

    if (range.start !== this.visibleStart || range.end !== this.visibleEnd) {
      this.visibleStart = range.start;
      this.visibleEnd = range.end;
      this.requestUpdate();
    }
  }

  // ============================================================================
  // RENDERING METHODS
  // ============================================================================

  render() {
    if (!this.mediaData || this.mediaData.length === 0) {
      return staticTemplates.emptyState;
    }

    const totalRows = Math.ceil(this.mediaData.length / this.colCount);
    const totalHeight = totalRows * (this.itemHeight + this.cardSpacing);
    const visibleItems = this.mediaData.slice(this.visibleStart, this.visibleEnd);

    return gridTemplates.gridContainer(
      totalHeight,
      visibleItems,
      (media, i) => {
        const index = this.visibleStart + i;
        const position = calculateGridPosition(
          index,
          this.colCount,
          this.itemWidth,
          this.itemHeight,
          this.cardSpacing,
        );

        this.renderedCards.add(index);

        const handlers = handlerFactories.createGridHandlers(
          media,
          this.eventHandlers,
          this.handleUsageClick.bind(this),
        );

        const helpers = helperFactories.createGridHelpers(
          media,
          this.searchQuery,
          this.renderMediaPreview.bind(this),
          handlers,
        );

        return gridTemplates.mediaCard(
          media,
          index,
          { ...position, width: this.itemWidth, height: this.itemHeight },
          handlers,
          helpers,
        );
      },
    );
  }

  // ============================================================================
  // CARD RENDERING HELPERS
  // ============================================================================

  renderHighlightedName(media) {
    const name = getMediaName(media);
    return html`<span .innerHTML=${highlightMatch(name, this.searchQuery)}></span>`;
  }

  renderHighlightedAlt(media) {
    if (!media.alt) return '';
    return html`<div class="media-alt" .innerHTML=${highlightMatch(media.alt, this.searchQuery)}></div>`;
  }

  renderHighlightedDoc(media) {
    if (!media.doc) return '';
    return html`<div class="media-doc" .innerHTML=${highlightMatch(media.doc, this.searchQuery)}></div>`;
  }

  renderAltStatus(media) {
    if (!media.alt && media.type && media.type.startsWith('img >')) {
      return staticTemplates.missingAlt;
    }
    return staticTemplates.altPresent;
  }

  renderMediaPreview(media) {
    if (isImage(media.url)) {
      const optimizedUrl = media.url.replace('format=jpeg', 'format=webply').replace('format=png', 'format=webply');
      return html`
        <img src="${optimizedUrl}" alt="${media.alt || ''}" loading="lazy">
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
      return staticTemplates.videoPlaceholder;
    }

    if (isPdf(media.url)) {
      return staticTemplates.pdfPlaceholder;
    }

    return staticTemplates.unknownPlaceholder;
  }

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  handleUsageClick(media) {
    this.eventHandlers.handleInfoClick(media);
  }
}

customElements.define('nx-media-grid', NxMediaGrid);
