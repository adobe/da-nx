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
  `${nx}/public/icons/S2_Icon_Play_20_N.svg`,
  `${nx}/public/icons/C_Icon_Fragment.svg`,
  `${nx}/public/icons/S2_Icon_Accessibility_20_N.svg`,
];

class NxMediaGrid extends LitElement {
  static properties = {
    mediaData: { type: Array },
    searchQuery: { type: String },
    isScanning: { type: Boolean },
    isTaggingMode: { type: Boolean },
    selectedMediaUrls: { type: Object },
  };

  constructor() {
    super();
    this.eventHandlers = createMediaEventHandlers(this);
    this.iconsLoaded = false;
    this.isTaggingMode = false;
    this.selectedMediaUrls = new Set();
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
      <main class="media-main ${this.isTaggingMode ? 'tagging-mode' : ''}" id="grid-scroller">
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

  handleMediaSelection(media, e) {
    e.stopPropagation();
    const isSelected = this.selectedMediaUrls.has(media.url);
    this.dispatchEvent(new CustomEvent('media-select', {
      detail: { mediaUrl: media.url, selected: !isSelected },
    }));
  }

  renderMediaCard(media) {
    if (!media) return html``;

    const handlers = {
      mediaClick: () => this.isTaggingMode ? this.handleMediaSelection(media, { stopPropagation: () => {} }) : this.eventHandlers.handleMediaClick(media),
      copyClick: () => this.eventHandlers.handleMediaCopy(media),
    };
    const usageCount = media.usageCount || 0;
    const isSelected = this.selectedMediaUrls.has(media.url);

    return html`
      <div class="media-card ${isSelected ? 'selected' : ''}" data-url="${media.url}">
        ${this.isTaggingMode ? html`
          <input
            type="checkbox"
            class="media-checkbox"
            .checked=${isSelected}
            @click=${(e) => this.handleMediaSelection(media, e)}
          />
        ` : ''}
        <div class="media-preview clickable" @click=${handlers.mediaClick}>
          ${this.renderMediaPreview(media)}
        </div>
        <div class="media-info clickable" @click=${handlers.mediaClick}>
          <div class="media-meta">
            <span class="media-label media-used">${usageCount}</span>
            <span class="media-label media-type">${this.getDisplayTypeText(media)}</span>
          </div>
          <div class="media-actions">
            ${this.renderAltStatus(media)}
            ${!this.isTaggingMode ? html`
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
            ` : ''}
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
      if (baseType === 'document' || (baseType === 'link' && subtype === 'pdf')) {
        return html`<strong>PDF</strong>`;
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
      if (baseType === 'document' || (baseType === 'link' && subtype === 'pdf')) {
        return 'PDF';
      }
      return subtype.toUpperCase();
    }
    return getDisplayMediaType(media).toUpperCase();
  }

  renderAltStatus(media) {
    if (media.type && media.type.startsWith('img >') && !media.type.includes('svg')) {
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
          <svg class="placeholder-icon fragment-icon" viewBox="0 0 60 60">
            <use href="#C_Icon_Fragment"></use>
          </svg>
          <span class="placeholder-label">${getMediaName(media)}</span>
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

    if (isPdf(media.url)) {
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
}

customElements.define('nx-media-grid', NxMediaGrid);
