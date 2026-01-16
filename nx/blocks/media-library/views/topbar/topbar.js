import { html, LitElement } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import getSvg from '../../../../public/utils/svg.js';
import { parseColonSyntax, generateSearchSuggestions, createSearchSuggestion } from '../../utils/filters.js';

const styles = await getStyle(import.meta.url);
const nx = `${new URL(import.meta.url).origin}/nx`;
const sl = await getStyle(`${nx}/public/sl/styles.css`);
const slComponents = await getStyle(`${nx}/public/sl/components.css`);
const ICONS = [
  `${nx}/public/icons/Smock_Folder_18_N.svg`,
  `${nx}/public/icons/Smock_FileHTML_18_N.svg`,
  `${nx}/img/icons/S2IconClassicGridView20N-icon.svg`,
  `${nx}/public/icons/S2_Icon_Close_20_N.svg`,
  `${nx}/public/icons/S2_Icon_Properties_20_N.svg`,
  `${nx}/public/icons/Smock_PinOff_18_N.svg`,
  `${nx}/public/icons/S2_Icon_PinOff_20_N.svg`,
];

class NxMediaTopBar extends LitElement {
  static properties = {
    searchQuery: { attribute: false },
    resultSummary: { attribute: false },
    isScanning: { attribute: false },
    scanProgress: { attribute: false },

    mediaData: { attribute: false },
    folderPathsCache: { attribute: false },
    selectedType: { attribute: false },
    selectedFolder: { attribute: false },
    selectedDocument: { attribute: false },
    _suggestions: { state: true },
    _activeIndex: { state: true },
    _originalQuery: { state: true },
    _showSuggestions: { state: true },
  };

  constructor() {
    super();
    this._suggestions = [];
    this._activeIndex = -1;
    this._originalQuery = '';
    this._suppressSuggestions = false;
    this._showSuggestions = false;
    this._debounceTimeout = null;
    this.selectedType = null;
    this._programmaticUpdate = false;
  }

  updated(changedProperties) {
    super.updated(changedProperties);

    if (changedProperties.has('searchQuery')) {
      if (!this.searchQuery) {
        this._showSuggestions = false;
        this._suggestions = [];
        this._activeIndex = -1;
        this._originalQuery = '';
        this.selectedType = null;
      }
    }
    if (changedProperties.has('selectedType')) {
      this.updateInputPadding();
    }
  }

  updateInputPadding() {
    const input = this.shadowRoot.querySelector('input');
    if (!input) return;

    if (this.selectedType) {
      input.style.paddingInlineStart = '36px';
    } else {
      input.style.paddingInlineStart = '';
    }
  }

  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, slComponents, styles];

    getSvg({ parent: this.shadowRoot, paths: ICONS });

    this.handleOutsideClick = this.handleOutsideClick.bind(this);
    document.addEventListener('click', this.handleOutsideClick);

    await this.updateComplete;
    this.updateInputPadding();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('click', this.handleOutsideClick);
    if (this._debounceTimeout) {
      clearTimeout(this._debounceTimeout);
    }
  }

  handleOutsideClick(e) {
    const searchContainer = this.shadowRoot.querySelector('.search-container');
    if (searchContainer && !searchContainer.contains(e.target)) {
      this._showSuggestions = false;
      this._suggestions = [];
      this._activeIndex = -1;
      this._suppressSuggestions = true;
    }
  }

  clearSuggestions() {
    this._showSuggestions = false;
    this._suggestions = [];
    this._activeIndex = -1;
  }

  getOnDemandSearchSuggestions(query) {
    return generateSearchSuggestions(
      this.mediaData,
      query,
      createSearchSuggestion,
      this.folderPathsCache,
    );
  }

  handleSearchInput(e) {
    if (this._programmaticUpdate) {
      this._programmaticUpdate = false;
      return;
    }

    const query = e.target.value;

    this.searchQuery = query;
    this._originalQuery = query;
    this._activeIndex = -1;

    // Clear any pending debounce
    if (this._debounceTimeout) {
      clearTimeout(this._debounceTimeout);
    }

    if (!query || !query.trim()) {
      this._suggestions = [];
      this._showSuggestions = false;
      this._suppressSuggestions = false;
      this._selectedType = null;
    } else {
      this._suppressSuggestions = false;

      this._debounceTimeout = setTimeout(() => {
        this._suggestions = this.getOnDemandSearchSuggestions(query);
        this._showSuggestions = this._suggestions.length > 0;
      }, 150);
    }

    this.dispatchEvent(new CustomEvent('search', { detail: { query } }));
  }

  handleKeyDown(e) {
    if (e.key === 'Escape' || e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      this._showSuggestions = false;
      this._suggestions = [];
      this._activeIndex = -1;
      this._suppressSuggestions = true;
      return;
    }

    if (!this._suggestions.length) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (this._activeIndex === -1) {
          this._originalQuery = this.searchQuery;
        }
        this._activeIndex = (this._activeIndex + 1) % this._suggestions.length;
        this._programmaticUpdate = true;
        this.searchQuery = this.getSuggestionText(this._suggestions[this._activeIndex]);
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (this._activeIndex === -1) {
          this._originalQuery = this.searchQuery;
        }
        this._activeIndex = (this._activeIndex - 1 + this._suggestions.length)
          % this._suggestions.length;
        this._programmaticUpdate = true;
        this.searchQuery = this.getSuggestionText(this._suggestions[this._activeIndex]);
        break;

      case 'Enter':
        e.preventDefault();
        if (this._activeIndex >= 0) {
          this.selectSuggestion(this._suggestions[this._activeIndex]);
        } else {
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

      default:
        break;
    }
  }

  getSuggestionText(suggestion) {
    if (suggestion.type === 'doc') return suggestion.value;
    if (suggestion.type === 'folder') return suggestion.value;
    if (suggestion.type === 'media') {
      return suggestion.value.name || suggestion.value.url;
    }
    return '';
  }

  selectSuggestion(suggestion) {
    this._showSuggestions = false;
    this._suggestions = [];
    this._activeIndex = -1;
    this._suppressSuggestions = true;
    this.selectedType = suggestion.type;
    this._programmaticUpdate = true;

    if (suggestion.type === 'doc') {
      this.searchQuery = suggestion.value;
      this.dispatchEvent(new CustomEvent('search', {
        detail: {
          query: this.searchQuery,
          type: 'doc',
          path: suggestion.absolutePath || suggestion.value,
        },
      }));
    } else if (suggestion.type === 'folder') {
      this.searchQuery = suggestion.value;
      this.dispatchEvent(new CustomEvent('search', {
        detail: {
          query: this.searchQuery,
          type: 'folder',
          path: suggestion.absolutePath || suggestion.value,
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
    this._programmaticUpdate = true;
    this.searchQuery = '';
    this._showSuggestions = false;
    this._suggestions = [];
    this._activeIndex = -1;
    this._suppressSuggestions = false;
    this._originalQuery = '';
    this.selectedType = null;
    this.dispatchEvent(new CustomEvent('clear-search'));
  }

  get canPinSearch() {
    return this.selectedFolder;
  }

  handlePinSearch() {
    this.dispatchEvent(new CustomEvent('pin-search', {
      detail: { folder: this.selectedFolder },
      bubbles: true,
      composed: true,
    }));
  }

  highlightMatch(text, query) {
    if (!query || !text) return text;
    const regex = new RegExp(`(${query})`, 'ig');
    return text.replace(regex, '<mark>$1</mark>');
  }

  handleSearch(e) {
    this.dispatchEvent(new CustomEvent('search', { detail: { query: e.target.value } }));
  }

  renderSearchIcon() {
    if (this.selectedType === 'folder') {
      return html`
        <svg class="search-icon folder-icon">
          <use href="#Smock_Folder_18_N"></use>
        </svg>
      `;
    }
    if (this.selectedType === 'doc') {
      return html`
        <svg class="search-icon doc-icon">
          <use href="#Smock_FileHTML_18_N"></use>
        </svg>
      `;
    }
    return '';
  }

  render() {
    return html`
      <div class="top-bar">

        <div class="search-container">
          <div class="search-wrapper ${this.selectedType ? 'has-icon' : ''}">
            <form>
              ${this.selectedType ? html`
                <div class="search-type-icon">
                  ${this.renderSearchIcon()}
                </div>
              ` : ''}
              <input
                type="text"
                id="search-input"
                placeholder="Enter search"
                .value=${this.searchQuery}
                @input=${this.handleSearchInput}
                @keydown=${this.handleKeyDown}
              ></input>
              ${this.canPinSearch ? html`
                <button
                  type="button"
                  class="pin-search-btn"
                  @click=${this.handlePinSearch}
                  title="Pin Folder"
                  aria-label="Pin Folder"
                >
                  <svg class="icon search-icon">
                    <use href="#S2_Icon_PinOff_20_N"></use>
                  </svg>
                </button>
              ` : ''}
              ${this.searchQuery ? html`
                <button
                  type="button"
                  class="clear-search-btn"
                  @click=${this.handleClearSearch}
                  title="Clear search"
                  aria-label="Clear search"
                >
                  ✕
                </button>
              ` : ''}
              <div class="suggestions-dropdown ${this._showSuggestions ? 'visible' : 'hidden'}">
                ${this._suggestions.map((suggestion, index) => {
    let icon = '';
    if (suggestion.type === 'folder') {
      icon = html`
        <svg class="suggestion-icon folder-icon">
          <use href="#Smock_Folder_18_N"></use>
        </svg>
      `;
    } else if (suggestion.type === 'doc') {
      icon = html`
        <svg class="suggestion-icon doc-icon">
          <use href="#Smock_FileHTML_18_N"></use>
        </svg>
      `;
    }

    return html`
      <div
        class="suggestion-item ${index === this._activeIndex ? 'active' : ''}"
        @click=${() => this.selectSuggestion(suggestion)}
      >
        <div class="suggestion-main">
          ${icon}
          <span class="suggestion-text" .innerHTML=${this.highlightMatch(suggestion.display, this._originalQuery)}></span>
        </div>
        ${suggestion.details ? html`
          <div class="suggestion-details">
            ${suggestion.details.alt ? html`<div class="detail-line">Alt: <span .innerHTML=${this.highlightMatch(suggestion.details.alt, this._originalQuery)}></span></div>` : ''}
            ${suggestion.details.doc ? html`<div class="detail-line">Doc: <span .innerHTML=${this.highlightMatch(suggestion.details.doc, this._originalQuery)}></span></div>` : ''}
          </div>
        ` : ''}
      </div>
    `;
  })}
            </div>
          </div>
        </div>

        ${this.resultSummary ? html`
          <div class="result-count">
            ${this.resultSummary}
          </div>
        ` : ''}
        </form>
      </div>
    `;
  }
}

customElements.define('nx-media-topbar', NxMediaTopBar);
