import { html, LitElement } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import getSvg from '../../../../public/utils/svg.js';
import { getSearchSuggestions } from '../../utils/filters.js';

const styles = await getStyle(import.meta.url);
const nx = `${new URL(import.meta.url).origin}/nx`;
const sl = await getStyle(`${nx}/public/sl/styles.css`);
const slComponents = await getStyle(`${nx}/public/sl/components.css`);
const ICONS = [
  `${nx}/img/icons/S2IconFolder20N-icon.svg`,
  `${nx}/img/icons/S2IconClassicGridView20N-icon.svg`,
  `${nx}/public/icons/S2_Icon_ListBulleted_20_N.svg`,
  `${nx}/public/icons/S2_Icon_Close_20_N.svg`,
];

class NxMediaTopBar extends LitElement {
  static properties = {
    searchQuery: { attribute: false },
    currentView: { attribute: false },
    folderFilterPaths: { attribute: false },
    searchSuggestions: { attribute: false },
    isScanning: { attribute: false },
    scanProgress: { attribute: false },
    // Internal state
    _currentView: { state: true },
    _suggestions: { state: true },
    _activeIndex: { state: true },
    _originalQuery: { state: true },
  };

  constructor() {
    super();
    this._currentView = 'grid';
    this._statusTimeout = null;
    this._suggestions = [];
    this._activeIndex = -1;
    this._originalQuery = '';
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

    if (this.scanProgress?.duration && !this.isScanning && !this._statusTimeout) {
      this.setScanStatusTimeout();
    }

    if (this.isScanning && this._statusTimeout) {
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

  handleSearchInput(e) {
    const query = e.target.value;
    this.searchQuery = query;
    this._originalQuery = query;
    this._activeIndex = -1;
    this._suggestions = getSearchSuggestions(this.searchSuggestions || [], query);
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

  renderScanningStatus() {
    if (this.isScanning) {
      return html`
        <div class="scanning-indicator">
          <div class="spinner"></div>
          <span class="scanning-text">
            Scanning ${this.scanProgress?.pages || 0} pages, ${this.scanProgress?.media || 0} media files
          </span>
        </div>
      `;
    }

    if (this.scanProgress?.duration) {
      const durationText = ` in ${this.scanProgress.duration}`;

      if (this.scanProgress.hasChanges === false) {
        return html`
          <div class="scanning-indicator completed no-changes">
            <span class="scanning-text">
              Scan Completed${durationText}. No Changes Found.
            </span>
          </div>
        `;
      }

      return html`
        <div class="scanning-indicator completed">
          <span class="scanning-text">
            Scanned ${this.scanProgress?.pages || 0} pages, ${this.scanProgress?.media || 0} media files${durationText}
          </span>
        </div>
      `;
    }

    return '';
  }

  render() {
    return html`
      <div class="top-bar">
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
