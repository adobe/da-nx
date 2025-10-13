import { html, LitElement } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import getSvg from '../../../../public/utils/svg.js';
// eslint-disable-next-line no-unused-vars
import { getMediaType, isSvgFile } from '../../utils/utils.js';
// eslint-disable-next-line no-unused-vars
import { parseColonSyntax, generateSearchSuggestions, createSearchSuggestion } from '../../utils/filters.js';
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
  `${nx}/public/icons/S2_Icon_Properties_20_N.svg`,
];

class NxMediaTopBar extends LitElement {
  static properties = {
    searchQuery: { attribute: false },
    currentView: { attribute: false },
    sidebarVisible: { attribute: false },
    resultSummary: { attribute: false },

    mediaData: { attribute: false },
    sitePath: { attribute: false },
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
    this._suppressSuggestions = false;
  }

  shouldUpdate(changedProperties) {
    const hasSearchChange = changedProperties.has('searchQuery');
    const hasViewChange = changedProperties.has('currentView');

    const hasMediaDataChange = changedProperties.has('mediaData');
    const hasScanChange = changedProperties.has('_isScanning')
      || changedProperties.has('_scanProgress');

    return hasSearchChange || hasViewChange
      || hasMediaDataChange || hasScanChange
      || changedProperties.has('resultSummary');
  }

  updated(changedProperties) {
    super.updated(changedProperties);

    if (changedProperties.has('currentView') && this.currentView) {
      this._currentView = this.currentView;
    }

    if (changedProperties.has('searchQuery')) {
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

    this.handleOutsideClick = this.handleOutsideClick.bind(this);
    document.addEventListener('click', this.handleOutsideClick);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('click', this.handleOutsideClick);
  }

  handleOutsideClick(e) {
    const searchContainer = this.shadowRoot.querySelector('.search-container');
    if (searchContainer && !searchContainer.contains(e.target)) {
      this._suggestions = [];
      this._activeIndex = -1;
      this._suppressSuggestions = true;
    }
  }

  clearSuggestions() {
    this._suggestions = [];
    this._activeIndex = -1;
  }

  getOnDemandSearchSuggestions(query) {
    return generateSearchSuggestions(this.mediaData, query, createSearchSuggestion);
  }

  handleSearchInput(e) {
    const query = e.target.value;

    this.searchQuery = query;
    this._originalQuery = query;
    this._activeIndex = -1;

    if (!query || !query.trim() || this._suppressSuggestions) {
      this._suggestions = [];
      this._suppressSuggestions = false;
    } else {
      this._suggestions = this.getOnDemandSearchSuggestions(query);
    }

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
        } else {
          if (this.searchQuery === '/') {
            this.searchQuery = 'folder:/';
            this._suggestions = [];
            this._activeIndex = -1;
            this._suppressSuggestions = true;
            this.dispatchEvent(new CustomEvent('search', {
              detail: {
                query: this.searchQuery,
                type: 'folder',
                path: '',
              },
            }));
            return;
          }

          const colonSyntax = parseColonSyntax(this.searchQuery);
          if (colonSyntax) {
            this._suggestions = [];
            this._activeIndex = -1;
            this._suppressSuggestions = true;
            this.dispatchEvent(new CustomEvent('search', {
              detail: {
                query: this.searchQuery,
                type: colonSyntax.field,
                path: colonSyntax.value,
              },
            }));
            return;
          }

          this._suggestions = [];
          this._activeIndex = -1;
          this._suppressSuggestions = true;
          this.dispatchEvent(new CustomEvent('search', { detail: { query: this.searchQuery } }));
        }
        break;

      case 'Escape':
        e.preventDefault();
        this.searchQuery = this._originalQuery;
        this._suggestions = [];
        this._activeIndex = -1;
        this._suppressSuggestions = true;
        break;

      default:
        break;
    }
  }

  getSuggestionText(suggestion) {
    if (suggestion.type === 'doc') return `doc:${suggestion.value}`;
    if (suggestion.type === 'folder') {
      return suggestion.value === '' ? 'folder:/' : `folder:${suggestion.value}`;
    }
    if (suggestion.type === 'media') {
      return suggestion.value.name || suggestion.value.url;
    }
    return '';
  }

  selectSuggestion(suggestion) {
    this._suggestions = [];
    this._activeIndex = -1;
    this._suppressSuggestions = true;

    if (suggestion.type === 'doc') {
      this.searchQuery = `doc:${suggestion.value}`;
      this.dispatchEvent(new CustomEvent('search', {
        detail: {
          query: this.searchQuery,
          type: 'doc',
          path: suggestion.value,
        },
      }));
    } else if (suggestion.type === 'folder') {
      this.searchQuery = suggestion.value === '' ? 'folder:/' : `folder:${suggestion.value}`;
      this.dispatchEvent(new CustomEvent('search', {
        detail: {
          query: this.searchQuery,
          type: 'folder',
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

  handleClearSearch() {
    this.searchQuery = '';
    this._suggestions = [];
    this._activeIndex = -1;
    this._suppressSuggestions = false;
    this._originalQuery = '';
    this.dispatchEvent(new CustomEvent('clear-search'));
  }

  highlightMatch(text, query) {
    if (!query || !text) return text;
    const regex = new RegExp(`(${query})`, 'ig');
    return text.replace(regex, '<mark>$1</mark>');
  }

  handleSearch(e) {
    this.dispatchEvent(new CustomEvent('search', { detail: { query: e.target.value } }));
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

  // ============================================================================
  // SCAN EVENT HANDLERS
  // ============================================================================

  handleScanStart() {
    this._isScanning = true;
    this._scanProgress = { pages: 0, media: 0, duration: null, hasChanges: null };
  }

  handleScanProgress(e) {
    this._scanProgress = { ...e.detail.progress };
  }

  handleScanComplete(e) {
    this._isScanning = false;

    const { mediaData, hasChanges, duration } = e.detail;

    this._scanProgress = {
      ...this._scanProgress,
      duration,
      hasChanges,
      media: hasChanges && mediaData ? mediaData.length : this._scanProgress.media,
    };

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

      if (this._scanProgress.hasChanges === true) {
        return html`
          <div class="scanning-indicator completed">
            <span class="scanning-text">
              Found ${this._scanProgress?.media || 0} media${durationText}
            </span>
          </div>
        `;
      }

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
    this.dispatchEvent(new CustomEvent('mediaDataUpdated', { detail: e.detail }));
  }

  render() {
    return html`
      <div class="top-bar">
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
              placeholder="Search"
              .value=${this.searchQuery}
              @input=${this.handleSearchInput}
              @keydown=${this.handleKeyDown}
            ></sl-input>
            ${this.searchQuery ? html`
              <button 
                class="clear-search-btn" 
                @click=${this.handleClearSearch}
                title="Clear search"
                aria-label="Clear search"
              >
                ✕
              </button>
            ` : ''}
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

        ${this.resultSummary ? html`
          <div class="result-count">
            ${this.resultSummary}
          </div>
        ` : ''}

        <div class="scanning-status">
          ${this.renderScanningStatus()}
        </div>
      </div>
    `;
  }
}

customElements.define('nx-media-topbar', NxMediaTopBar);
