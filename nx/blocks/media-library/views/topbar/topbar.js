import { html, LitElement } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import getSvg from '../../../../public/utils/svg.js';
import { parseColonSyntax, generateSearchSuggestions, createSearchSuggestion } from '../../utils/filters.js';
import { getAppState, subscribeToAppState } from '../../utils/state.js';

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
    _appState: { state: true },
    _inputValue: { state: true },
    _suggestions: { state: true },
    _activeIndex: { state: true },
    _originalQuery: { state: true },
    _showSuggestions: { state: true },
    selectedType: { state: true },
  };

  constructor() {
    super();
    this._appState = getAppState();
    this._inputValue = '';
    this._suggestions = [];
    this._activeIndex = -1;
    this._originalQuery = '';
    this._suppressSuggestions = false;
    this._showSuggestions = false;
    this._debounceTimeout = null;
    this.selectedType = null;
    this._programmaticUpdate = false;
    this._unsubscribe = null;
  }

  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, slComponents, styles];

    this._unsubscribe = subscribeToAppState((state) => {
      this._appState = state;
      this.requestUpdate();
    });

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
    if (this._unsubscribe) {
      this._unsubscribe();
    }
  }

  updated(changedProperties) {
    super.updated(changedProperties);

    if (changedProperties.has('_appState')) {
      const oldState = changedProperties.get('_appState') || {};
      const newState = this._appState;

      if (newState.searchQuery !== oldState.searchQuery) {
        this._inputValue = newState.searchQuery || '';
      }

      if (oldState.searchQuery && !newState.searchQuery) {
        this._showSuggestions = false;
        this._suggestions = [];
        this._activeIndex = -1;
        this._originalQuery = '';
        this.selectedType = null;
      }
    }
  }

  get canPinSearch() {
    return this._appState.selectedFolder;
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
              ${this._inputValue ? html`
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

        ${this._appState.resultSummary ? html`
          <div class="result-count">
            ${this._appState.resultSummary}
          </div>
        ` : ''}
        </form>
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
      detail: { folder: this._appState.selectedFolder },
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

    if (suggestion.type === 'doc') {
      this._inputValue = suggestion.value;
      this.dispatchEvent(new CustomEvent('search', {
        detail: {
          query: this._inputValue,
          type: 'doc',
          path: suggestion.absolutePath || suggestion.value,
        },
      }));
    } else if (suggestion.type === 'folder') {
      this._inputValue = suggestion.value;
      this.dispatchEvent(new CustomEvent('search', {
        detail: {
          query: this._inputValue,
          type: 'folder',
          path: suggestion.absolutePath || suggestion.value,
        },
      }));
    } else {
      this._inputValue = suggestion.value.name;
      this.dispatchEvent(new CustomEvent('search', {
        detail: {
          query: this._inputValue,
          type: 'media',
          media: suggestion.value,
        },
      }));
    }
  }

  clearSuggestions() {
    this._showSuggestions = false;
    this._suggestions = [];
    this._activeIndex = -1;
  }

  getOnDemandSearchSuggestions(query) {
    return generateSearchSuggestions(
      this._appState.rawMediaData || this._appState.mediaData,
      query,
      createSearchSuggestion,
      this._appState.folderPathsCache,
    );
  }

  getSuggestionText(suggestion) {
    if (suggestion.type === 'doc') return suggestion.value;
    if (suggestion.type === 'folder') return suggestion.value;
    if (suggestion.type === 'media') {
      return suggestion.value.name || suggestion.value.url;
    }
    return '';
  }

  highlightMatch(text, query) {
    if (!query || !text) return text;
    const regex = new RegExp(`(${query})`, 'ig');
    return text.replace(regex, '<mark>$1</mark>');
  }
}

customElements.define('nx-media-topbar', NxMediaTopBar);
