import { html, LitElement } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import getSvg from '../../../../public/utils/svg.js';
import { getMediaType, isSvgFile } from '../../utils/utils.js';
import '../scan/scan.js';

const styles = await getStyle(import.meta.url);
const nx = `${new URL(import.meta.url).origin}/nx`;
const sl = await getStyle(`${nx}/public/sl/styles.css`);
const slComponents = await getStyle(`${nx}/public/sl/components.css`);
const ICONS = [
  `${nx}/img/icons/S2IconFolder20N-icon.svg`,
  `${nx}/img/icons/S2IconClassicGridView20N-icon.svg`,
  `${nx}/public/icons/S2_Icon_ListBulleted_20_N.svg`,
  `${nx}/public/icons/S2_Icon_Close_20_N.svg`,
  `${nx}/public/icons/S2_Icon_Refresh_20_N.svg`,
];

class NxMediaTopBar extends LitElement {
  static properties = {
    searchQuery: { attribute: false },
    currentView: { attribute: false },
    folderFilterPaths: { attribute: false },
    mediaData: { attribute: false },
    sitePath: { attribute: false },
    // Internal state
    _currentView: { state: true },
    _suggestions: { state: true },
    _activeIndex: { state: true },
    _originalQuery: { state: true },
    _isScanning: { state: true },
    _scanProgress: { state: true },
  };

  constructor() {
    super();
    this._currentView = 'grid';
    this._statusTimeout = null;
    this._suggestions = [];
    this._activeIndex = -1;
    this._originalQuery = '';
    this._isScanning = false;
    this._scanProgress = { pages: 0, media: 0, duration: null, hasChanges: null };
  }

  shouldUpdate(changedProperties) {
    // Only update when relevant properties change
    const hasSearchChange = changedProperties.has('searchQuery');
    const hasViewChange = changedProperties.has('currentView');
    const hasFolderChange = changedProperties.has('folderFilterPaths');
    const hasMediaDataChange = changedProperties.has('mediaData');
    const hasScanChange = changedProperties.has('_isScanning')
      || changedProperties.has('_scanProgress');

    return hasSearchChange || hasViewChange || hasFolderChange
      || hasMediaDataChange || hasScanChange;
  }

  updated(changedProperties) {
    super.updated(changedProperties);

    if (changedProperties.has('currentView') && this.currentView) {
      this._currentView = this.currentView;
    }

    if (changedProperties.has('searchQuery')) {
      // Clear suggestions when search query is cleared externally
      if (!this.searchQuery) {
        this._suggestions = [];
        this._activeIndex = -1;
        this._originalQuery = '';
      }
    }

    if (this._scanProgress?.duration && !this._isScanning && !this._statusTimeout) {
      this.setScanStatusTimeout();
    }

    if (this._isScanning && this._statusTimeout) {
      clearTimeout(this._statusTimeout);
      this._statusTimeout = null;
    }
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, slComponents, styles];

    getSvg({ parent: this.shadowRoot, paths: ICONS });

    // Add click outside handler to hide suggestions
    this.handleOutsideClick = this.handleOutsideClick.bind(this);
    document.addEventListener('click', this.handleOutsideClick);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('click', this.handleOutsideClick);
  }

  handleOutsideClick(e) {
    // Hide suggestions if clicking outside the search container
    if (!this.shadowRoot.querySelector('.search-container').contains(e.target)) {
      this._suggestions = [];
      this._activeIndex = -1;
    }
  }

  getOnDemandSearchSuggestions(query) {
    if (!query || !query.trim() || !this.mediaData) {
      return [];
    }

    const q = query.toLowerCase().trim();
    const suggestions = [];
    const matchingDocs = new Set();

    // Check for colon syntax (doc:, alt:, name:, url:)
    const colonMatch = q.match(/^(\w+):(.*)$/);
    if (colonMatch) {
      const [, field, value] = colonMatch;

      this.mediaData.forEach((item) => {
        switch (field) {
          case 'doc':
            if (item.doc && item.doc.toLowerCase().includes(value)) {
              matchingDocs.add(item.doc);
            }
            break;
          case 'alt':
            if (item.alt && item.alt.toLowerCase().includes(value) && !isSvgFile(item)) {
              suggestions.push(this.createSearchSuggestion(item));
            }
            break;
          case 'name':
            if (item.name && item.name.toLowerCase().includes(value) && !isSvgFile(item)) {
              suggestions.push(this.createSearchSuggestion(item));
            }
            break;
          case 'url':
            if (item.url && item.url.toLowerCase().includes(value) && !isSvgFile(item)) {
              suggestions.push(this.createSearchSuggestion(item));
            }
            break;
          default:
            // Handle unknown field types
            break;
        }
      });

      // Add doc suggestions
      const docSuggestions = Array.from(matchingDocs).map((doc) => ({
        type: 'doc',
        value: doc,
        display: doc,
      }));

      return [...docSuggestions, ...suggestions].slice(0, 10);
    }

    // General search across all fields
    this.mediaData.forEach((item) => {
      // Check doc paths
      if (item.doc && item.doc.toLowerCase().includes(q)) {
        matchingDocs.add(item.doc);
      }

      // Check media fields (exclude SVGs)
      if (!isSvgFile(item) && (
        (item.name && item.name.toLowerCase().includes(q))
          || (item.alt && item.alt.toLowerCase().includes(q))
          || (item.url && item.url.toLowerCase().includes(q))
      )) {
        suggestions.push(this.createSearchSuggestion(item));
      }
    });

    // Combine doc and media suggestions
    const docSuggestions = Array.from(matchingDocs).map((doc) => ({
      type: 'doc',
      value: doc,
      display: doc,
    }));

    return [...docSuggestions, ...suggestions].slice(0, 10);
  }

  createSearchSuggestion(item) {
    if (!item.name && !item.url && !item.doc) return null;

    // Exclude SVG files from search suggestions (consistent with 'all' filter)
    if (isSvgFile(item)) return null;

    return {
      type: 'media',
      value: item,
      display: item.name || item.url || 'Unnamed Media',
      details: {
        alt: item.alt,
        doc: item.doc,
        url: item.url,
        type: getMediaType(item),
      },
    };
  }

  handleSearchInput(e) {
    const query = e.target.value;
    this.searchQuery = query;
    this._originalQuery = query;
    this._activeIndex = -1;
    this._suggestions = this.getOnDemandSearchSuggestions(query);
    this.dispatchEvent(new CustomEvent('search', { detail: { query } }));
  }

  handleKeyDown(e) {
    if (!this._suggestions.length) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (this._activeIndex === -1) {
          this._originalQuery = this.searchQuery;
        }
        this._activeIndex = (this._activeIndex + 1) % this._suggestions.length;
        this.searchQuery = this.getSuggestionText(this._suggestions[this._activeIndex]);
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (this._activeIndex === -1) {
          this._originalQuery = this.searchQuery;
        }
        this._activeIndex = (this._activeIndex - 1 + this._suggestions.length)
          % this._suggestions.length;
        this.searchQuery = this.getSuggestionText(this._suggestions[this._activeIndex]);
        break;

      case 'Enter':
        e.preventDefault();
        if (this._activeIndex >= 0) {
          this.selectSuggestion(this._suggestions[this._activeIndex]);
        }
        break;

      case 'Escape':
        this.searchQuery = this._originalQuery;
        this._suggestions = [];
        this._activeIndex = -1;
        break;

      default:
        // Handle other keys normally
        break;
    }
  }

  getSuggestionText(suggestion) {
    if (suggestion.type === 'doc') return `doc:${suggestion.value}`;
    if (suggestion.type === 'media') {
      return suggestion.value.name || suggestion.value.url;
    }
    return '';
  }

  selectSuggestion(suggestion) {
    this._suggestions = [];
    this._activeIndex = -1;

    if (suggestion.type === 'doc') {
      this.searchQuery = `doc:${suggestion.value}`;
      this.dispatchEvent(new CustomEvent('search', {
        detail: {
          query: this.searchQuery,
          type: 'doc',
          path: suggestion.value,
        },
      }));
    } else {
      this.searchQuery = suggestion.value.name;
      this.dispatchEvent(new CustomEvent('search', {
        detail: {
          query: this.searchQuery,
          type: 'media',
          media: suggestion.value,
        },
      }));
    }
  }

  highlightMatch(text, query) {
    if (!query || !text) return text;
    const regex = new RegExp(`(${query})`, 'ig');
    return text.replace(regex, '<mark>$1</mark>');
  }

  handleSearch(e) {
    this.dispatchEvent(new CustomEvent('search', { detail: { query: e.target.value } }));
  }

  handleViewChange(e) {
    const button = e.target.closest('button') || e.target;
    const { view } = button.dataset;
    this._currentView = view;
    this.dispatchEvent(new CustomEvent('viewChange', { detail: { view } }));
  }

  handleFolderClick() {
    this.dispatchEvent(new CustomEvent('openFolderDialog'));
  }

  setScanStatusTimeout(duration = 5000) {
    if (this._statusTimeout) {
      clearTimeout(this._statusTimeout);
    }

    this._statusTimeout = setTimeout(() => {
      this.dispatchEvent(new CustomEvent('clearScanStatus'));
      this._statusTimeout = null;
    }, duration);
  }

  handleClearFolderFilter() {
    this.dispatchEvent(new CustomEvent('clearFolderFilter'));
  }

  // ============================================================================
  // SCAN EVENT HANDLERS
  // ============================================================================

  handleScanStart() {
    this._isScanning = true;
    this._scanProgress = { pages: 0, media: 0, duration: null, hasChanges: null };
  }

  handleScanProgress(e) {
    // Update scan progress - let lit handle the re-render efficiently
    this._scanProgress = { ...e.detail.progress };
  }

  handleScanComplete(e) {
    this._isScanning = false;

    const { mediaData, hasChanges, duration } = e.detail;

    // Update scan progress with completion data
    this._scanProgress = {
      ...this._scanProgress, // Keep current pages count
      duration,
      hasChanges,
      // Only update media count if there are actual changes
      media: hasChanges && mediaData ? mediaData.length : this._scanProgress.media,
    };

    // Emit event to main component if there are changes
    if (hasChanges && mediaData) {
      this.dispatchEvent(new CustomEvent('mediaDataUpdated', { detail: { mediaData, hasChanges } }));
    }
  }

  handleScanError(e) {
    this._isScanning = false;
    console.error('Scan error:', e.detail.error); // eslint-disable-line no-console
  }

  handleClearScanStatus() {
    this._scanProgress = { pages: 0, media: 0, duration: null, hasChanges: null };
  }

  renderScanningStatus() {
    if (this._isScanning) {
      return html`
        <div class="scanning-indicator">
          <svg class="spinner-icon">
            <use href="#S2_Icon_Refresh_20_N"></use>
          </svg>
          <span class="scanning-text">
            ${this._scanProgress?.pages || 0} pages, ${this._scanProgress?.media || 0} media
          </span>
        </div>
      `;
    }

    if (this._scanProgress?.duration) {
      const durationText = ` in ${this._scanProgress.duration}`;

      if (this._scanProgress.hasChanges === false) {
        return html`
          <div class="scanning-indicator completed no-changes">
            <span class="scanning-text">
              No changes found${durationText}
            </span>
          </div>
        `;
      }

      // Show success message only if hasChanges is explicitly true
      if (this._scanProgress.hasChanges === true) {
        return html`
          <div class="scanning-indicator completed">
            <span class="scanning-text">
              Found ${this._scanProgress?.media || 0} media${durationText}
            </span>
          </div>
        `;
      }

      // Default case
      return html`
        <div class="scanning-indicator completed">
          <span class="scanning-text">
            Scan completed${durationText}
          </span>
        </div>
      `;
    }

    return '';
  }

  handleMediaDataUpdated(e) {
    // Bubble up the media data update event to the main component
    this.dispatchEvent(new CustomEvent('mediaDataUpdated', { detail: e.detail }));
  }

  render() {
    return html`
      <div class="top-bar">
        <!-- Hidden scan component that provides scan functionality -->
        <nx-media-scan
          .sitePath=${this.sitePath}
          @scanStart=${this.handleScanStart}
          @scanProgress=${this.handleScanProgress}
          @scanComplete=${this.handleScanComplete}
          @scanError=${this.handleScanError}
          @mediaDataUpdated=${this.handleMediaDataUpdated}
          style="display: none;"
        ></nx-media-scan>

        <div class="search-container">
          <div class="search-wrapper">
            <sl-input
              type="text"
              placeholder="Search media or doc:path..."
              .value=${this.searchQuery}
              @input=${this.handleSearchInput}
              @keydown=${this.handleKeyDown}
            >
            </sl-input>
            ${this._suggestions.length ? html`
              <div class="suggestions-dropdown">
                ${this._suggestions.map((suggestion, index) => html`
                  <div 
                    class="suggestion-item ${index === this._activeIndex ? 'active' : ''}"
                    @click=${() => this.selectSuggestion(suggestion)}
                  >
                    <div class="suggestion-main">
                      <span class="suggestion-text" .innerHTML=${this.highlightMatch(suggestion.display, this._originalQuery)}></span>
                    </div>
                    ${suggestion.details ? html`
                      <div class="suggestion-details">
                        ${suggestion.details.alt ? html`<div class="detail-line">Alt: <span .innerHTML=${this.highlightMatch(suggestion.details.alt, this._originalQuery)}></span></div>` : ''}
                        ${suggestion.details.doc ? html`<div class="detail-line">Doc: <span .innerHTML=${this.highlightMatch(suggestion.details.doc, this._originalQuery)}></span></div>` : ''}
                      </div>
                    ` : ''}
                  </div>
                `)}
              </div>
            ` : ''}
          </div>
        </div>

        <div class="scanning-status">
          ${this.renderScanningStatus()}
        </div>

        <div class="view-controls">
          <button
            class="view-btn ${this._currentView === 'grid' ? 'active' : ''}"
            data-view="grid"
            @click=${this.handleViewChange}
            title="Grid view"
          >
            <svg class="icon">
              <use href="#S2IconClassicGridView20N-icon"></use>
            </svg>
          </button>
          <button
            class="view-btn ${this._currentView === 'list' ? 'active' : ''}"
            data-view="list"
            @click=${this.handleViewChange}
            title="List view"
          >
            <svg class="icon">
              <use href="#S2_Icon_ListBulleted_20_N"></use>
            </svg>
          </button>
          <button
            class="view-btn folder-btn ${this.folderFilterPaths && this.folderFilterPaths.length > 0 ? 'active' : ''}"
            title="Folder view"
            @click=${this.handleFolderClick}
          >
            <svg class="icon">
              <use href="#S2IconFolder20N-icon"></use>
            </svg>
            ${this.folderFilterPaths && this.folderFilterPaths.length > 0 ? html`
              <span class="filter-badge">${this.folderFilterPaths.length}</span>
            ` : ''}
          </button>
        </div>
      </div>
    `;
  }
}

customElements.define('nx-media-topbar', NxMediaTopBar);
