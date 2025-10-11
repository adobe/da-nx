import { html, LitElement } from '../../deps/lit/dist/index.js';
import { virtualize, grid } from '../../deps/virtualizer/index.js';
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
  staticTemplates,
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

class NxMediaGrid extends LitElement {
  static properties = {
    mediaData: { type: Array },
    searchQuery: { type: String },
    isScanning: { type: Boolean },
  };

  constructor() {
    super();
    this.eventHandlers = createMediaEventHandlers(this);
    this.iconsLoaded = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, slComponents, styles];
  }

  updated(changedProperties) {
    if (changedProperties.has('mediaData') && this.mediaData?.length > 0 && !this.iconsLoaded) {
      this.loadIcons();
      this.iconsLoaded = true;
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
      <main class="media-main" id="grid-scroller">
        ${virtualize({
    items: this.mediaData,
    renderItem: (media) => this.renderMediaCard(media),
    scroller: true,
    layout: grid({
      gap: '24px',
      minColumnWidth: '240px',
      maxColumnWidth: '350px',
    }),
  })}
      </main>
    `;
  }

  renderMediaCard(media) {
    const handlers = {
      mediaClick: () => this.eventHandlers.handleMediaClick(media),
      copyClick: () => this.eventHandlers.handleMediaCopy(media),
    };
    const usageCount = media.folderUsageCount !== undefined
      ? media.folderUsageCount
      : (media.usageCount || 0);

    return html`
      <div class="media-card">
        <div class="media-preview clickable" @click=${handlers.mediaClick}>
          ${this.renderMediaPreview(media)}
        </div>
        <div class="media-info clickable" @click=${handlers.mediaClick}>
          <div class="media-meta">
            <span class="media-label media-used">${usageCount}</span>
            <span class="media-label media-type">${this.getDisplayTypeText(media)}</span>
          </div>
          <div class="media-actions">
            ${media.alt && media.alt !== '' && media.alt !== 'null' ? html`
              <div class="filled-alt-indicator">
                <svg class="icon" viewBox="0 0 18 18">
                  <use href="#S2_Icon_CheckmarkCircle_18_N"></use>
                </svg>
              </div>
            ` : ''}
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
        return html`<strong>FRAGMENT</strong>`;
      }
      return html`<strong>${subtype.toUpperCase()}</strong>`;
    }
    return html`<strong>${getDisplayMediaType(media)}</strong>`;
  }

  getDisplayTypeText(media) {
    if (media.type && media.type.includes(' > ')) {
      const [baseType, subtype] = media.type.split(' > ');
      if (baseType === 'fragment') {
        return 'FRAGMENT';
      }
      return subtype.toUpperCase();
    }
    return getDisplayMediaType(media).toUpperCase();
  }

  renderAltStatus(media) {
    if (media.type && media.type.startsWith('img >')) {
      if (media.alt && media.alt !== '') {
        return html`
          <span class="filled-alt-indicator" title="Alt text present">
            <svg class="check-icon" viewBox="0 0 18 18">
              <use href="#S2_Icon_CheckmarkCircle_18_N"></use>
            </svg>
          </span>
        `;
      }
    }
    return '';
  }

  renderHighlightedAlt(media) {
    if (!media.alt) return '';
    const content = this.searchQuery ? highlightMatch(media.alt, this.searchQuery) : media.alt;
    return html`<div class="media-alt" .innerHTML=${content}></div>`;
  }

  renderHighlightedDoc(media) {
    if (!media.doc) return '';
    const content = this.searchQuery ? highlightMatch(media.doc, this.searchQuery) : media.doc;
    return html`<div class="media-doc" .innerHTML=${content}></div>`;
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
          <span class="placeholder-label">FRAGMENT</span>
        </div>
      `;
    }

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
          <span class="placeholder-label">DOCUMENT</span>
        </div>
      `;
    }

    return staticTemplates.unknownPlaceholder;
  }
}

customElements.define('nx-media-grid', NxMediaGrid);
