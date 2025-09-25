import { html, LitElement } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import getSvg from '../../../../public/utils/svg.js';
import { getVideoThumbnail, isExternalVideoUrl, isImage, isVideo, isPdf } from '../../utils/utils.js';
import '../../../../public/sl/components.js';
import {
  SCROLL_CONSTANTS,
  calculateVisibleRange,
  calculateGridPosition,
  throttleScroll,
  createMediaEventHandlers,
  measurePerformance,
  staticTemplates,
  gridTemplates,
  handlerFactories,
  helperFactories,
} from '../../utils/templates.js';

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
    isScanning: { type: Boolean },
  };

  constructor() {
    super();

    this.visibleStart = 0;
    this.visibleEnd = SCROLL_CONSTANTS.MAX_VISIBLE_ITEMS;
    this.colCount = 4;
    this.renderedCards = new Set();
    this.previousMediaDataLength = 0;

    this.scrollTimeout = null;
    this.container = null;
    this.scrollListenerAttached = false;

    this.eventHandlers = createMediaEventHandlers(this);

    this.itemWidth = SCROLL_CONSTANTS.GRID_ITEM_WIDTH;
    this.itemHeight = SCROLL_CONSTANTS.GRID_ITEM_HEIGHT;
    this.cardSpacing = SCROLL_CONSTANTS.GRID_CARD_SPACING;
    this.bufferSize = SCROLL_CONSTANTS.BUFFER_SIZE;

    this.iconsLoaded = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, slComponents, styles];
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
    if (changedProperties.has('mediaData') && this.mediaData) {
      this.preprocessGridData();
    }
  }

  updated(changedProperties) {
    if (changedProperties.has('mediaData') && this.mediaData?.length > 0 && !this.iconsLoaded) {
      this.loadIcons();
      this.iconsLoaded = true;
    }

    if (changedProperties.has('mediaData') && this.mediaData) {
      this.handleDataChange();

      if (!this.scrollListenerAttached) {
        this.setupScrollListener();
      }

      this.updateColCount();
    }
  }

  async loadIcons() {
    const existingIcons = this.shadowRoot.querySelectorAll('svg[id]');
    const loadedIconIds = Array.from(existingIcons).map((icon) => icon.id);
    const missingIcons = ICONS.filter((iconPath) => {
      const iconId = iconPath.split('/').pop().replace('.svg', '');
      return !loadedIconIds.includes(iconId);
    });

    if (missingIcons.length > 0) {
      await getSvg({ parent: this.shadowRoot, paths: missingIcons });
    }
  }

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

      this.updateVisibleRange();
    });
  }

  updateVisibleRange() {
    if (this.container && this.mediaData?.length > 0) {
      const range = calculateVisibleRange(
        this.container,
        this.itemHeight,
        SCROLL_CONSTANTS.BUFFER_SIZE,
        this.mediaData.length,
        this.colCount,
      );
      if (range.start !== this.visibleStart || range.end !== this.visibleEnd) {
        this.visibleStart = range.start;
        this.visibleEnd = range.end;
        this.requestUpdate();
      }
    }
  }

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

  render() {
    if (!this.mediaData || this.mediaData.length === 0) {
      if (this.isScanning) {
        return html`
          <div class="scanning-state">
            <div class="scanning-spinner"></div>
            <h3>Discovering Media</h3>
            <p>Scanning pages and extracting media files...</p>
          </div>
        `;
      }
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
}

customElements.define('nx-media-grid', NxMediaGrid);
