import { html, LitElement } from '../../deps/lit/dist/index.js';
import { virtualize } from '../../deps/virtualizer/index.js';
import getStyle from '../../../../utils/styles.js';
import getSvg from '../../../../public/utils/svg.js';
import {
  getVideoThumbnail,
  isExternalVideoUrl,
  isImage,
  isVideo,
  isPdf,
  isFragment,
  getDisplayMediaType,
} from '../../utils/utils.js';
import '../../../../public/sl/components.js';
import {
  createMediaEventHandlers,
  highlightMatch,
  getMediaName,
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
  `${nx}/public/icons/S2_Icon_Share_20_N.svg`,
  `${nx}/public/icons/Smock_DocumentFragment_18_N.svg`,
];

class NxMediaList extends LitElement {
  static properties = {
    mediaData: { type: Array },
    searchQuery: { type: String },
    isScanning: { type: Boolean },
  };

  constructor() {
    super();
    this.eventHandlers = createMediaEventHandlers(this);
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, slComponents, styles];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
  }

  render() {
    if (!this.mediaData || this.mediaData.length === 0) {
      return html`
        <div class="empty-state">
          <h3>No results found</h3>
          <p>Try a different search or type selection</p>
        </div>
      `;
    }

    return html`
      <main class="list-main">
        <div class="list-header">
          <div class="header-cell">Preview</div>
          <div class="header-cell">Name</div>
          <div class="header-cell">Type</div>
          <div class="header-cell">Usage</div>
          <div class="header-cell">Actions</div>
        </div>
        <div class="list-content" id="list-scroller">
          ${virtualize({
    items: this.mediaData,
    renderItem: (media) => this.renderListItem(media),
    scroller: true,
  })}
        </div>
      </main>
    `;
  }

  renderListItem(media) {
    const handlers = {
      mediaClick: () => this.eventHandlers.handleMediaClick(media),
      copyClick: () => this.eventHandlers.handleMediaCopy(media),
    };

    return html`
      <div class="media-item">
        <div class="item-preview clickable" @click=${handlers.mediaClick} title="Click to view media details">
          ${this.renderMediaPreview(media)}
        </div>
        <div class="item-name">
          ${this.getHighlightedName(media)}
        </div>
        <div class="item-type">
          ${this.getDisplayType(media)}
        </div>
        <div class="item-usage">
          <span class="usage-badge" title="Usage count">
            ${media.folderUsageCount !== undefined ? media.folderUsageCount : (media.usageCount || 0)}
          </span>
        </div>
        <div class="item-actions">
          <button 
            class="icon-button share-button"
            @click=${(e) => { e.stopPropagation(); handlers.copyClick(); }} 
            title="Copy to clipboard"
          >
            <svg class="icon" viewBox="0 0 20 20">
              <use href="#S2_Icon_Share_20_N"></use>
            </svg>
          </button>
        </div>
      </div>
    `;
  }

  getHighlightedName(media) {
    const name = getMediaName(media);
    if (!this.searchQuery) return name;
    return html`<span .innerHTML=${highlightMatch(name, this.searchQuery)}></span>`;
  }

  getDisplayType(media) {
    if (media.type && media.type.includes(' > ')) {
      const [baseType, subtype] = media.type.split(' > ');
      if (baseType === 'fragment') {
        return 'FRAGMENT';
      }
      return subtype.toUpperCase();
    }
    return getDisplayMediaType(media);
  }

  renderMediaPreview(media) {
    if (isFragment(media)) {
      return html`
        <div class="placeholder-full fragment-placeholder">
          <svg class="placeholder-icon" viewBox="0 0 48 48" fill="none">
            <rect x="8" y="8" width="32" height="32" rx="2" stroke="currentColor" stroke-width="2"/>
            <line x1="14" y1="16" x2="26" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <line x1="14" y1="24" x2="34" y2="24" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <line x1="14" y1="32" x2="30" y2="32" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </div>
      `;
    }

    if (isImage(media.url)) {
      const optimizedUrl = media.url.replace('format=jpeg', 'format=webply').replace('format=png', 'format=webply');
      return html`<img src="${optimizedUrl}" alt="${media.alt || ''}" loading="lazy">`;
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
        <video src="${media.url}" muted playsinline preload="metadata" loading="lazy">
          <source src="${media.url}" type="video/mp4">
        </video>
      `;
    }

    if (isPdf(media.url)) {
      return html`
        <div class="placeholder-full pdf-placeholder">
          <svg class="placeholder-icon" viewBox="0 0 48 48" fill="none">
            <path d="M12 6h16l8 8v26a2 2 0 01-2 2H12a2 2 0 01-2-2V8a2 2 0 012-2z" stroke="currentColor" stroke-width="2"/>
            <path d="M28 6v8h8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <text x="24" y="30" font-size="10" text-anchor="middle" fill="currentColor" font-weight="600">PDF</text>
          </svg>
        </div>
      `;
    }

    return html`
      <div class="unknown-placeholder">
        <svg class="unknown-icon" viewBox="0 0 18 18">
          <use href="#Smock_DocumentFragment_18_N"></use>
        </svg>
      </div>
    `;
  }
}

customElements.define('nx-media-list', NxMediaList);
