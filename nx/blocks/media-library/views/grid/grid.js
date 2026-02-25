import { html, LitElement } from '../../deps/lit/dist/index.js';
import { virtualize, grid } from '../../deps/virtualizer/index.js';
import getStyle from '../../../../utils/styles.js';
import getSvg from '../../../../public/utils/svg.js';
import {
  getVideoThumbnail,
  isExternalVideoUrl,
  isExternalUrl,
  isImage,
  isVideo,
  isPdfUrl,
  isFragmentMedia,
  isSvgFile,
  getSubtype,
  optimizeImageUrls,
  CARD_IMAGE_SIZES,
} from '../../utils/utils.js';
import { getAppState, onStateChange } from '../../utils/state.js';
import '../../../../public/sl/components.js';
import {
  createMediaEventHandlers,
  staticTemplates,
  getMediaName,
} from '../../utils/templates.js';
import { MediaType } from '../../utils/constants.js';

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
  `${nx}/public/icons/S2_Icon_Play_20_N.svg`,
  `${nx}/public/icons/C_Icon_Fragment.svg`,
  `${nx}/public/icons/S2_Icon_Accessibility_20_N.svg`,
];

class NxMediaGrid extends LitElement {
  static properties = {
    _appState: { state: true },
    mediaData: { type: Array },
  };

  constructor() {
    super();
    this._appState = getAppState();
    this.eventHandlers = createMediaEventHandlers(this);
    this.iconsLoaded = false;
    this._unsubscribe = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, slComponents, styles];
    this._unsubscribe = onStateChange(
      ['searchQuery'],
      (state) => {
        this._appState = state;
        this.requestUpdate();
      },
    );
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._unsubscribe) {
      this._unsubscribe();
    }
  }

  updated(changedProperties) {
    if (changedProperties.has('mediaData') && this.mediaData?.length > 0 && !this.iconsLoaded) {
      this.loadIcons();
      this.iconsLoaded = true;
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
    keyFunction: (media) => media?.url || '',
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
    if (!media) return html``;

    const handlers = {
      mediaClick: () => this.eventHandlers.handleMediaClick(media),
      copyClick: () => this.eventHandlers.handleMediaCopy(media),
    };
    const usageCount = media.usageCount || 0;

    return html`
      <div class="media-card">
        <div class="media-preview clickable" @click=${handlers.mediaClick}>
          ${this.renderMediaPreview(media)}
        </div>
        <div class="media-info clickable" @click=${handlers.mediaClick}>
          <div class="media-meta">
            <span class="media-label media-used">${usageCount}</span>
            <span class="media-label media-type" title="${getSubtype(media)}">${this.getDisplayTypeText(media)}</span>
          </div>
          <div class="media-actions">
            ${this.renderAltStatus(media)}
            <button
              class="icon-button share-button"
              @click=${(e) => { e.stopPropagation(); handlers.copyClick(); }}
              title="Copy to clipboard"
              aria-label="Copy media URL to clipboard"
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

  renderMediaPreview(media) {
    if (isExternalVideoUrl(media?.url)) {
      const thumbnailUrl = getVideoThumbnail(media.url);
      return html`
        <div class="video-preview-container">
          ${thumbnailUrl ? html`
            <img src="${thumbnailUrl}" alt="Video thumbnail" class="video-thumbnail" loading="lazy" decoding="async">
          ` : html`
            <div class="placeholder-full video-placeholder">
              <svg class="placeholder-icon" viewBox="0 0 20 20">
                <use href="#S2_Icon_Play_20_N"></use>
              </svg>
              <span class="placeholder-label">Video</span>
            </div>
          `}
          <div class="video-overlay">
            <svg class="play-icon" viewBox="0 0 20 20">
              <use href="#S2_Icon_Play_20_N"></use>
            </svg>
          </div>
        </div>
      `;
    }

    if (isFragmentMedia(media)) {
      return html`
        <div class="placeholder-full fragment-placeholder">
          <svg class="placeholder-icon fragment-icon" viewBox="0 0 60 60">
            <use href="#C_Icon_Fragment"></use>
          </svg>
          <span class="placeholder-label">${getMediaName(media)}</span>
        </div>
      `;
    }

    if (isImage(media.url) || (media.type === MediaType.IMAGE && isExternalUrl(media.url))) {
      const optimized = !isExternalUrl(media.url) ? optimizeImageUrls(media.url) : null;
      if (optimized) {
        return html`
          <picture>
            <source type="image/webp" srcset="${optimized.webpSrcset}" sizes="${CARD_IMAGE_SIZES}">
            <img src="${optimized.fallbackUrl}" srcset="${optimized.fallbackSrcset}" sizes="${CARD_IMAGE_SIZES}" alt="${media.alt || ''}" loading="lazy" decoding="async">
          </picture>
        `;
      }
      return html`
        <img src="${media.url}" alt="${media.alt || ''}" loading="lazy" decoding="async">
      `;
    }

    if (isVideo(media.url)) {
      return html`
        <div class="video-preview-container">
          <video src="${media.url}" muted playsinline preload="metadata" loading="lazy" class="video-thumbnail">
            <source src="${media.url}" type="video/mp4">
          </video>
          <div class="video-overlay">
            <svg class="play-icon" viewBox="0 0 20 20">
              <use href="#S2_Icon_Play_20_N"></use>
            </svg>
          </div>
        </div>
      `;
    }

    if (isPdfUrl(media.url)) {
      return html`
        <div class="placeholder-full pdf-placeholder">
          <svg class="placeholder-icon" viewBox="0 0 48 48" fill="none">
            <path d="M12 6h16l8 8v26a2 2 0 01-2 2H12a2 2 0 01-2-2V8a2 2 0 012-2z" stroke="currentColor" stroke-width="2"/>
            <path d="M28 6v8h8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <text x="24" y="30" font-size="10" text-anchor="middle" fill="currentColor" font-weight="600">PDF</text>
          </svg>
          <span class="placeholder-label">${getMediaName(media)}</span>
        </div>
      `;
    }

    return staticTemplates.unknownPlaceholder;
  }

  renderAltStatus(media) {
    if (media.type === MediaType.IMAGE && !isSvgFile(media)) {
      if (media.alt && media.alt !== '') {
        return html`
          <div class="filled-alt-indicator">
            <svg class="alt-text-icon icon" viewBox="0 0 22 20">
              <use href="#S2_Icon_Accessibility_20_N"></use>
            </svg>
          </div>
        `;
      }
    }
    return '';
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

  getDisplayType(media) {
    return html`<strong>${getSubtype(media)}</strong>`;
  }

  getDisplayTypeText(media) {
    return getSubtype(media);
  }
}

customElements.define('nx-media-grid', NxMediaGrid);
