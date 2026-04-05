import { html, LitElement } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import getSvg from '../../../../public/utils/svg.js';
import { parseColonSyntax, getSearchSuggestions, createSearchSuggestion } from '../../features/filters.js';
import { formatDocPath, getBasePath } from '../../core/paths.js';
import { highlightMatch } from '../../features/templates.js';
import { t } from '../../core/messages.js';

const styles = await getStyle(import.meta.url);
const nx = `${new URL(import.meta.url).origin}/nx`;
const sl = await getStyle(`${nx}/public/sl/styles.css`);
const slComponents = await getStyle(`${nx}/public/sl/components.css`);
const iconsBase = new URL('../../../../img/icons/', import.meta.url).href;
const ICONS = [
  `${iconsBase}Smock_Folder_18_N.svg`,
  `${iconsBase}Smock_FileHTML_18_N.svg`,
  `${iconsBase}S2_Icon_PinOff_20_N.svg`,
];

class NxMediaTopBar extends LitElement {
  static properties = {
    _inputValue: { state: true },
    _suggestions: { state: true },
    _activeIndex: { state: true },
    _originalQuery: { state: true },
    _showSuggestions: { state: true },
    selectedType: { state: true },
    searchQuery: { attribute: false },
    resultSummary: { attribute: false },
    selectedFolder: { attribute: false },
    selectedDocument: { attribute: false },
    selectedFilterType: { attribute: false },
    mediaData: { attribute: false },
    processedData: { attribute: false },
    isIndexing: { type: Boolean },
    isRefreshing: { type: Boolean },
    isStreaming: { type: Boolean },
    org: { attribute: false },
    repo: { attribute: false },
  };

  constructor() {
    super();
    this._inputValue = '';
    this._suggestions = [];
    this._activeIndex = -1;
    this._originalQuery = '';
    this._suppressSuggestions = false;
    this._showSuggestions = false;
    this._debounceTimeout = null;
    this.selectedType = null;
    this._programmaticUpdate = false;
    this.searchQuery = '';
    this.resultSummary = '';
    this.selectedFolder = null;
    this.selectedDocument = null;
    this.selectedFilterType = 'images';
    this.mediaData = [];
    this.processedData = null;
    this.isIndexing = false;
    this.isRefreshing = false;
    this.isStreaming = false;
    this.org = null;
    this.repo = null;
  }

  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, slComponents, styles];

    getSvg({ parent: this.shadowRoot, paths: ICONS });

    this.handleOutsideClick = this.handleOutsideClick.bind(this);
    document.addEventListener('click', this.handleOutsideClick);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('click', this.handleOutsideClick);
    if (this._debounceTimeout) {
      clearTimeout(this._debounceTimeout);
    }
  }

  getDisplaySearchTerm() {
    if (this.selectedDocument) {
      const basePath = getBasePath();
      const normalizedDoc = formatDocPath(this.selectedDocument);
      let displayPath = normalizedDoc;
      if (basePath && normalizedDoc.startsWith(basePath)) {
        displayPath = normalizedDoc.substring(basePath.length) || '/';
        if (displayPath && !displayPath.startsWith('/')) {
          displayPath = `/${displayPath}`;
        }
      }
      return `doc:${displayPath}`;
    }
    if (this.selectedFolder) return `folder:${this.selectedFolder}`;
    return this.searchQuery || '';
  }

  updated(changedProperties) {
    super.updated(changedProperties);

    const hasSearchStateChange = changedProperties.has('searchQuery')
      || changedProperties.has('selectedDocument')
      || changedProperties.has('selectedFolder');

    if (hasSearchStateChange) {
      const displayTerm = this.getDisplaySearchTerm();
      const currentValue = this._inputValue || '';

      if (displayTerm !== currentValue) {
        const input = this.shadowRoot?.getElementById('search-input');
        const isFocused = input && this.shadowRoot.activeElement === input;
        const parentLagsBehindTyping = isFocused
          && !this.selectedDocument
          && !this.selectedFolder
          && displayTerm === ''
          && currentValue !== '';
        if (!parentLagsBehindTyping) {
          this._inputValue = displayTerm;
        }
      }

      if (this.selectedDocument) {
        this.selectedType = 'doc';
      } else if (this.selectedFolder) {
        this.selectedType = 'folder';
      } else if (!this.searchQuery) {
        this.selectedType = null;
      }

      if (!this.searchQuery && !this.selectedDocument && !this.selectedFolder) {
        this._showSuggestions = false;
        this._suggestions = [];
        this._activeIndex = -1;
        this._originalQuery = '';
        this.selectedType = null;
      }
    }

    if (changedProperties.has('processedData') || changedProperties.has('mediaData')) {
      this._refreshSuggestionsAfterDataReady();
    }
  }

  /**
   * Folder/doc path suggestions need processedData (folderPaths / docPaths). If the user typed
   * "/" or colon syntax before that data existed, refresh when it arrives so they don't need to
   * type again.
   */
  _refreshSuggestionsAfterDataReady() {
    const q = this._inputValue || '';
    if (!q.trim()) return;

    const usesPathSuggestions = q.startsWith('/')
      || q.startsWith('doc:')
      || q.startsWith('folder:')
      || parseColonSyntax(q);

    if (!usesPathSuggestions) return;

    this._suggestions = this.getOnDemandSearchSuggestions(q);
    this._showSuggestions = this._suggestions.length > 0;
  }

  get canPinSearch() {
    return this.selectedFolder;
  }

  get hasActiveSearch() {
    return !!(this.selectedDocument || this.selectedFolder || this.searchQuery);
  }

  get searchPlaceholder() {
    const filterLabels = {
      images: 'images',
      videos: 'videos',
      documents: 'PDFs',
      fragments: 'fragments',
      links: 'external',
      icons: 'SVGs',
      noReferences: 'items',
    };
    const filterLabel = filterLabels[this.selectedFilterType] || 'items';
    return `Search ${filterLabel} or use doc: folder: /`;
  }

  render() {
    return html`
      <div class="top-bar">

        <div class="search-container">
          <div class="search-wrapper ${this.selectedType ? 'has-icon' : ''} ${this.canPinSearch ? 'has-pin' : ''}">
            <form @submit=${this.handleFormSubmit}>
              ${this.selectedType ? html`
                <div class="search-type-icon">
                  ${this.renderSearchIcon()}
                </div>
              ` : ''}
              <input
                type="text"
                id="search-input"
                role="combobox"
                aria-label="${t('UI_SEARCH_MEDIA')}"
                aria-autocomplete="list"
                aria-expanded="${this._showSuggestions}"
                aria-controls="suggestions-listbox"
                aria-activedescendant="${this._activeIndex >= 0 ? `suggestion-${this._activeIndex}` : ''}"
                placeholder="${this.searchPlaceholder}"
                .value=${this._inputValue}
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
              ${this.hasActiveSearch ? html`
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
              <div
                class="suggestions-dropdown ${this._showSuggestions ? 'visible' : 'hidden'}"
                role="listbox"
                id="suggestions-listbox"
              >
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
        role="option"
        id="suggestion-${index}"
        aria-selected="${index === this._activeIndex}"
        @click=${() => this.selectSuggestion(suggestion)}
      >
        <div class="suggestion-main">
          ${icon}
          <span class="suggestion-text" .innerHTML=${highlightMatch(suggestion.display, this._originalQuery)}></span>
        </div>
        ${suggestion.details ? html`
          <div class="suggestion-details">
            ${suggestion.details.doc ? html`<div class="detail-line">Doc: <span .innerHTML=${highlightMatch(suggestion.details.doc, this._originalQuery)}></span></div>` : ''}
          </div>
        ` : ''}
      </div>
    `;
  })}
            </div>
            </form>
          </div>
        </div>

        ${this.resultSummary ? html`
          <div class="result-count" aria-live="polite" aria-atomic="true">
            ${this.isIndexing || this.isRefreshing || this.isStreaming ? html`
              <span class="result-count-spinner" aria-hidden="true"></span>
            ` : ''}
            ${this.resultSummary}
          </div>
        ` : ''}
      </div>
    `;
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

  handleFormSubmit(e) {
    e.preventDefault();
  }

  handleSearchInput(e) {
    if (this._programmaticUpdate) {
      this._programmaticUpdate = false;
      return;
    }

    const query = e.target.value;

    this._inputValue = query;
    this._originalQuery = query;
    this._activeIndex = -1;

    if (this._debounceTimeout) {
      clearTimeout(this._debounceTimeout);
    }

    if (!query || !query.trim()) {
      this._suggestions = [];
      this._showSuggestions = false;
      this._suppressSuggestions = false;
      this.selectedType = null;
    } else {
      this._suppressSuggestions = false;

      const hasSpecialSyntax = query.startsWith('/')
        || query.startsWith('doc:')
        || query.startsWith('folder:')
        || query.startsWith('name:')
        || query.startsWith('url:')
        || query.startsWith('user:');

      if (hasSpecialSyntax) {
        this._showSuggestions = false;
        this._suggestions = this.getOnDemandSearchSuggestions(query);
        this._showSuggestions = this._suggestions.length > 0;
        this.requestUpdate();
      } else {
        this._debounceTimeout = setTimeout(() => {
          this._suggestions = this.getOnDemandSearchSuggestions(query);
          this._showSuggestions = this._suggestions.length > 0;
        }, 150);
      }
    }

    this.dispatchEvent(new CustomEvent('search', { detail: { query } }));
  }

  handleKeyDown(e) {
    if (e.key === 'Escape') {
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
          this._originalQuery = this._inputValue;
        }
        this._activeIndex = (this._activeIndex + 1) % this._suggestions.length;
        this._programmaticUpdate = true;
        this._inputValue = this.getSuggestionText(this._suggestions[this._activeIndex]);
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (this._activeIndex === -1) {
          this._originalQuery = this._inputValue;
        }
        this._activeIndex = (this._activeIndex - 1 + this._suggestions.length)
          % this._suggestions.length;
        this._programmaticUpdate = true;
        this._inputValue = this.getSuggestionText(this._suggestions[this._activeIndex]);
        break;

      case 'Enter':
        e.preventDefault();
        if (this._activeIndex >= 0) {
          this.selectSuggestion(this._suggestions[this._activeIndex]);
        } else {
          const colonSyntax = parseColonSyntax(this._inputValue);
          if (colonSyntax) {
            this._suggestions = [];
            this._activeIndex = -1;
            this._suppressSuggestions = true;
            this.selectedType = colonSyntax.field;
            this.dispatchEvent(new CustomEvent('search', {
              detail: {
                query: this._inputValue,
                type: colonSyntax.field,
                path: colonSyntax.value,
              },
            }));
            return;
          }

          this._suggestions = [];
          this._activeIndex = -1;
          this._suppressSuggestions = true;
          this.dispatchEvent(new CustomEvent('search', { detail: { query: this._inputValue } }));
        }
        break;

      default:
        break;
    }
  }

  handleClearSearch() {
    this._programmaticUpdate = true;
    this._inputValue = '';
    this._showSuggestions = false;
    this._suggestions = [];
    this._activeIndex = -1;
    this._suppressSuggestions = false;
    this._originalQuery = '';
    this.selectedType = null;
    this.dispatchEvent(new CustomEvent('clear-search'));
  }

  handlePinSearch() {
    this.dispatchEvent(new CustomEvent('pin-search', {
      detail: { folder: this.selectedFolder },
      bubbles: true,
      composed: true,
    }));
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

  selectSuggestion(suggestion) {
    this._showSuggestions = false;
    this._suggestions = [];
    this._activeIndex = -1;
    this._suppressSuggestions = true;
    this.selectedType = suggestion.type;
    this._programmaticUpdate = true;
    this._inputValue = this.getSuggestionText(suggestion);

    if (suggestion.type === 'doc') {
      this.dispatchEvent(new CustomEvent('search', {
        detail: {
          query: this._inputValue,
          type: 'doc',
          path: suggestion.absolutePath || suggestion.value,
        },
      }));
    } else if (suggestion.type === 'folder') {
      this.dispatchEvent(new CustomEvent('search', {
        detail: {
          query: this._inputValue,
          type: 'folder',
          path: suggestion.absolutePath || suggestion.value,
        },
      }));
    } else {
      this.dispatchEvent(new CustomEvent('search', {
        detail: {
          query: this._inputValue,
          type: 'media',
          media: suggestion.value,
        },
      }));
    }
  }

  getOnDemandSearchSuggestions(query) {
    return getSearchSuggestions(
      this.mediaData,
      query,
      createSearchSuggestion,
      this.processedData,
      this.selectedFilterType,
      this.org,
      this.repo,
    );
  }

  getSuggestionText(suggestion) {
    if (suggestion.type === 'doc') return suggestion.value;
    if (suggestion.type === 'folder') return suggestion.value;
    if (suggestion.type === 'media') {
      return suggestion.value.displayName || suggestion.value.url;
    }
    return '';
  }
}

customElements.define('nx-media-topbar', NxMediaTopBar);
