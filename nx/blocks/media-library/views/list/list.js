import { html, LitElement } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import getSvg from '../../../../public/utils/svg.js';
import { getVideoThumbnail, isExternalVideoUrl, isImage } from '../../utils/utils.js';
import '../../../../public/sl/components.js';
import {
  SCROLL_CONSTANTS,
  calculateVisibleRange,
  calculateListPosition,
  throttleScroll,
  createMediaEventHandlers,
  measurePerformance,
  staticTemplates,
  listTemplates,
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

class NxMediaList extends LitElement {
  static properties = {
    mediaData: { type: Array },
    searchQuery: { type: String },
    isScanning: { type: Boolean },
  };

  constructor() {
    super();

    // Virtual scroll state
    this.visibleStart = 0;
    this.visibleEnd = SCROLL_CONSTANTS.MAX_VISIBLE_ITEMS;
    this.renderedItems = new Set();
    this.previousMediaDataLength = 0;

    // Scroll handling
    this.scrollTimeout = null;
    this.container = null;
    this.scrollListenerAttached = false;

    // Event handlers
    this.eventHandlers = createMediaEventHandlers(this);

    // Constants from scroll.js
    this.itemHeight = SCROLL_CONSTANTS.LIST_ITEM_HEIGHT;
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
    window.addEventListener('resize', () => this.updateVisibleRange());
  }

  willUpdate(changedProperties) {
    // Pre-process when mediaData changes
    if (changedProperties.has('mediaData') && this.mediaData) {
      this.preprocessListData();
    }
  }

  updated(changedProperties) {
    if (changedProperties.has('mediaData') && this.mediaData) {
      this.handleDataChange();
    }
  }

  // ============================================================================
  // PRE-PROCESSING METHODS
  // ============================================================================

  preprocessListData() {
    measurePerformance('list preprocessing', () => {
      this.resetVirtualScrollState();
    });
  }

  resetVirtualScrollState() {
    this.visibleStart = 0;
    this.visibleEnd = Math.min(SCROLL_CONSTANTS.MAX_VISIBLE_ITEMS, this.mediaData?.length || 0);
    this.renderedItems.clear();
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
      this.container = this.shadowRoot.querySelector('.list-content');
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
      this.itemHeight,
      this.bufferSize,
      this.mediaData.length,
    );

    if (range.start !== this.visibleStart || range.end !== this.visibleEnd) {
      this.visibleStart = range.start;
      this.visibleEnd = range.end;
      this.requestUpdate();
    }
  }

  updateVisibleRange() {
    this.onScroll();
  }

  // ============================================================================
  // RENDERING METHODS
  // ============================================================================

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

    const totalHeight = this.mediaData.length * this.itemHeight;
    const visibleItems = this.mediaData.slice(this.visibleStart, this.visibleEnd);

    return listTemplates.listContainer(
      totalHeight,
      visibleItems,
      (media, i) => {
        const index = this.visibleStart + i;
        const position = calculateListPosition(index, this.itemHeight);

        this.renderedItems.add(index);

        const handlers = handlerFactories.createListHandlers(
          media,
          this.eventHandlers,
        );

        const helpers = helperFactories.createListHelpers(
          media,
          this.searchQuery,
          isImage,
          isExternalVideoUrl,
          getVideoThumbnail,
          handlers,
        );

        return listTemplates.listItem(
          media,
          index,
          position,
          handlers,
          helpers,
        );
      },
    );
  }

  // ============================================================================
  // CARD RENDERING HELPERS
  // ============================================================================

  // All rendering helpers are now handled by fragments.js

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  // Usage click behavior removed - no longer needed
}

customElements.define('nx-media-list', NxMediaList);
