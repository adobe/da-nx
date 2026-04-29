import { html, LitElement } from '../../../../deps/ml-lit/dist/index.js';
import { virtualize, grid } from '../../../../deps/virtualizer/dist/index.js';
import getStyle from '../../../../utils/styles.js';
import getSvg from '../../../../public/utils/svg.js';
import {
  getVideoThumbnail,
  isExternalVideoUrl,
  isPdfUrl,
  isFragmentMedia,
  getSubtype,
  isImage,
  isVideo,
} from '../../core/media.js';
import {
  isExternalUrl,
  getDedupeKey,
  resolveMediaUrl,
  preferPreviewForMediaUrl,
  isPreviewPreferredForMediaUrl,
} from '../../core/urls.js';
import { optimizeImageUrls, CARD_IMAGE_SIZES } from '../../core/files.js';
import '../../../../public/sl/components.js';
import {
  createMediaEventHandlers,
  staticTemplates,
  getMediaCardLabel,
} from '../../features/templates.js';
import { MediaType } from '../../core/constants.js';
import { t } from '../../core/messages.js';

const styles = await getStyle(import.meta.url);
const nx = `${new URL(import.meta.url).origin}/nx`;
const sl = await getStyle(`${nx}/public/sl/styles.css`);
const slComponents = await getStyle(`${nx}/public/sl/components.css`);
const iconsBase = new URL('../../../../img/icons/', import.meta.url).href;

const ICONS = [
  `${iconsBase}Smock_Copy_18_N.svg`,
  `${iconsBase}S2_Icon_Play_20_N.svg`,
  `${iconsBase}C_Icon_Fragment.svg`,
  `${iconsBase}S2_Icon_AlertCircle_18_N.svg`,
];

class NxMediaGrid extends LitElement {
  static properties = {
    mediaData: { type: Array },
    org: { type: String },
    repo: { type: String },
    usePreviewDaLive: { type: Boolean },
    resultsBusy: { type: Boolean },
  };

  constructor() {
    super();
    this.eventHandlers = createMediaEventHandlers(this);
    this.iconsLoaded = false;
    this.usePreviewDaLive = false;
    this.resultsBusy = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, slComponents, styles];
  }

  handleKeyDown(e) {
    const scroller = e.currentTarget;
    if (!scroller) return;

    const scrollAmount = 100; // pixels
    const pageScrollAmount = scroller.clientHeight - 50; // leave some overlap

    let handled = false;

    switch (e.key) {
      case 'ArrowDown':
        scroller.scrollBy({ top: scrollAmount, behavior: 'smooth' });
        handled = true;
        break;
      case 'ArrowUp':
        scroller.scrollBy({ top: -scrollAmount, behavior: 'smooth' });
        handled = true;
        break;
      case 'PageDown':
        scroller.scrollBy({ top: pageScrollAmount, behavior: 'smooth' });
        handled = true;
        break;
      case 'PageUp':
        scroller.scrollBy({ top: -pageScrollAmount, behavior: 'smooth' });
        handled = true;
        break;
      case 'Home':
        if (e.ctrlKey || e.metaKey) {
          scroller.scrollTo({ top: 0, behavior: 'smooth' });
          handled = true;
        }
        break;
      case 'End':
        if (e.ctrlKey || e.metaKey) {
          scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
          handled = true;
        }
        break;
      default:
        break;
    }

    if (handled) {
      e.preventDefault();
    }
  }

  updated(changedProperties) {
    if (changedProperties.has('mediaData') && this.mediaData?.length > 0 && !this.iconsLoaded) {
      this.loadIcons();
      this.iconsLoaded = true;
    }
    const sizer = this.shadowRoot?.querySelector('[virtualizer-sizer]');
    if (sizer) {
      sizer.setAttribute('role', 'presentation');
      sizer.setAttribute('aria-hidden', 'true');
    }
  }

  render() {
    if (!this.mediaData || this.mediaData.length === 0) {
      return html``;
    }

    return html`
      <main
        class="media-main"
        id="grid-scroller"
        aria-label="${t('UI_MEDIA_RESULTS')}"
        aria-busy="${this.resultsBusy}"
        tabindex="0"
        @keydown=${this.handleKeyDown}
      >
        ${virtualize({
    items: this.mediaData,
    renderItem: (media) => this.renderMediaCard(media),
    keyFunction: (media) => {
      const key = media?.url ? getDedupeKey(media.url) : (media?.hash || '');
      const doc = media?.doc ?? '';
      return `${key}|${doc}`;
    },
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
    const usageCount = media.usageCount ?? '-';
    const cardLabel = this.getCardAriaLabel(media, usageCount);

    return html`
      <div class="media-card" role="listitem" aria-label="${cardLabel}">
        <div class="media-preview clickable" @click=${handlers.mediaClick}>
          ${this.renderMediaPreview(media)}
        </div>
        <div class="media-info clickable" @click=${handlers.mediaClick}>
          <div class="media-meta">
            <span class="media-label media-used">${usageCount}</span>
            <span class="media-label media-type" title="${getSubtype(media)}">${this.getDisplayTypeText(media)}</span>
          </div>
          <div class="media-actions">
            <button
              class="icon-button share-button"
              @click=${(e) => { e.stopPropagation(); handlers.copyClick(); }}
              title="Copy to clipboard"
              aria-label="Copy media URL to clipboard"
            >
              <svg class="icon" viewBox="0 0 20 20">
                <use href="#Smock_Copy_18_N"></use>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  renderMediaPreview(media) {
    const resolvedUrl = resolveMediaUrl(media?.url, this.org, this.repo, this.usePreviewDaLive);

    if (isExternalVideoUrl(resolvedUrl)) {
      const thumbnailUrl = getVideoThumbnail(resolvedUrl);
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
          <span class="placeholder-label">${getMediaCardLabel(media)}</span>
        </div>
      `;
    }

    if (isImage(resolvedUrl) || (media.type === MediaType.IMAGE && isExternalUrl(resolvedUrl))) {
      const optimized = !isExternalUrl(resolvedUrl) ? optimizeImageUrls(resolvedUrl) : null;
      if (optimized) {
        return html`
          <picture>
            <source type="image/webp" srcset="${optimized.webpSrcset}" sizes="${CARD_IMAGE_SIZES}">
            <img
              src="${optimized.fallbackUrl}"
              srcset="${optimized.fallbackSrcset}"
              sizes="${CARD_IMAGE_SIZES}"
              alt=""
              loading="lazy"
              decoding="async"
              @error=${() => this.handleImageLoadError(media, resolvedUrl)}
            >
          </picture>
        `;
      }
      return html`
        <img
          src="${resolvedUrl}"
          alt=""
          loading="lazy"
          decoding="async"
          @error=${() => this.handleImageLoadError(media, resolvedUrl)}
        >
      `;
    }

    if (isVideo(resolvedUrl)) {
      return html`
        <div class="video-preview-container">
          <video src="${resolvedUrl}" muted playsinline preload="metadata" loading="lazy" class="video-thumbnail">
            <source src="${resolvedUrl}" type="video/mp4">
          </video>
          <div class="video-overlay">
            <svg class="play-icon" viewBox="0 0 20 20">
              <use href="#S2_Icon_Play_20_N"></use>
            </svg>
          </div>
        </div>
      `;
    }

    if (isPdfUrl(resolvedUrl)) {
      return html`
        <div class="placeholder-full pdf-placeholder">
          <svg class="placeholder-icon" viewBox="0 0 48 48" fill="none">
            <path d="M12 6h16l8 8v26a2 2 0 01-2 2H12a2 2 0 01-2-2V8a2 2 0 012-2z" stroke="currentColor" stroke-width="2"/>
            <path d="M28 6v8h8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <text x="24" y="30" font-size="10" text-anchor="middle" fill="currentColor" font-weight="600">PDF</text>
          </svg>
          <span class="placeholder-label">${getMediaCardLabel(media)}</span>
        </div>
      `;
    }

    return staticTemplates.unknownPlaceholder;
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

  getDisplayTypeText(media) {
    return getSubtype(media);
  }

  getCardAriaLabel(media, usageDisplay) {
    const name = getMediaCardLabel(media);
    const type = this.getDisplayTypeText(media);
    const parts = [];
    if (name) parts.push(name);
    if (type) parts.push(type);
    if (typeof media.usageCount === 'number') {
      parts.push(t('UI_CARD_REFERENCES', { count: media.usageCount }));
    } else if (usageDisplay && usageDisplay !== '-') {
      parts.push(String(usageDisplay));
    }
    return parts.join(', ') || name || 'Media';
  }

  handleImageLoadError(media, resolvedUrl) {
    if (!media?.url || isExternalUrl(resolvedUrl) || isPreviewPreferredForMediaUrl(media.url)) {
      return;
    }

    if (preferPreviewForMediaUrl(media.url)) {
      this.requestUpdate();
    }
  }
}

customElements.define('nx-media-grid', NxMediaGrid);
