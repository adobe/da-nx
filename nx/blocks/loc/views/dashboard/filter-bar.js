import { LitElement, html, nothing } from '../../../../deps/lit/lit-core.min.js';
import { getConfig } from '../../../../scripts/nexter.js';
import getStyle from '../../../../utils/styles.js';
import getSvg from '../../../../utils/svg.js';

const { nxBase } = getConfig();
const style = await getStyle(import.meta.url);
const buttons = await getStyle(`${nxBase}/styles/buttons.js`);

const FILTER_BAR_ICONS = [
  `${nxBase}/blocks/loc/img/clear.svg`,
];

const PROJECT_STATUSES = ['not started', 'in progress', 'complete', 'cancelled'];

class NxFilterBar extends LitElement {
  static properties = {
    searchQuery: { type: String },
    startDate: { type: String },
    endDate: { type: String },
    translationStatuses: { type: Array },
    rolloutStatuses: { type: Array },
    selectedTranslationStatuses: { type: Array },
    selectedRolloutStatuses: { type: Array },
    _showFilterPopup: { type: Boolean },
    viewAllProjects: { type: Boolean },
    showArchivedProjects: { type: Boolean },
  };

  constructor() {
    super();
    this.searchQuery = '';
    this.startDate = null;
    this.endDate = null;
    this.translationStatuses = PROJECT_STATUSES;
    this.rolloutStatuses = PROJECT_STATUSES;
    this.selectedTranslationStatuses = [];
    this.selectedRolloutStatuses = [];
    this._showFilterPopup = false; // Track popup visibility
    this.viewAllProjects = true; // Default to "All Projects"
    this.showArchivedProjects = false; // Default to not showing archived projects
    this._searchDebounceTimeout = null; // Debounce timeout for search input
    this._boundHandleOutsideClick = (e) => this.handleOutsideClick(e);
    this._popupPosition = { top: 0, left: 0 };
  }

  handleSearchInput(e) {
    this.searchQuery = e.target.value;

    // Clear existing timeout
    if (this._searchDebounceTimeout) {
      clearTimeout(this._searchDebounceTimeout);
    }

    // Set new timeout to emit change after 300ms
    this._searchDebounceTimeout = setTimeout(() => {
      this.emitFilterChange();
    }, 300);
  }

  clearSearch() {
    this.searchQuery = '';
    this.emitFilterChange();
  }

  emitFilterChange() {
    this.dispatchEvent(
      new CustomEvent('filter-change', {
        detail: {
          searchQuery: this.searchQuery,
          startDate: this.startDate,
          endDate: this.endDate,
          selectedTranslationStatuses: this.selectedTranslationStatuses,
          selectedRolloutStatuses: this.selectedRolloutStatuses,
          viewAllProjects: this.viewAllProjects,
          showArchivedProjects: this.showArchivedProjects,
        },
      }),
    );
  }

  toggleFilterPopup(event) {
    event.stopPropagation();
    this._showFilterPopup = !this._showFilterPopup;
    if (this._showFilterPopup) {
      const buttonRect = event.target.getBoundingClientRect();
      this._popupPosition = {
        top: buttonRect.bottom + window.scrollY,
        left: buttonRect.left + window.scrollX,
      };
    }
  }

  handleOutsideClick(event) {
    if (
      this._showFilterPopup
            && !event.composedPath().some((el) => el.classList?.contains('filter-popup'))
    ) {
      this._showFilterPopup = false;
    }
  }

  handleStatusChange(propertyName, event) {
    const { value, checked } = event.target;
    if (checked) {
      this[propertyName] = [...this[propertyName], value];
    } else {
      this[propertyName] = this[propertyName].filter((status) => status !== value);
    }
    this.emitFilterChange();
  }

  handleTranslationStatusChange(event) {
    this.handleStatusChange('selectedTranslationStatuses', event);
  }

  handleRolloutStatusChange(event) {
    this.handleStatusChange('selectedRolloutStatuses', event);
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('click', this._boundHandleOutsideClick);
    this.shadowRoot.adoptedStyleSheets = [style, buttons];
    getSvg({ parent: this.shadowRoot, paths: FILTER_BAR_ICONS });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('click', this._boundHandleOutsideClick);
    // Clear search debounce timeout on disconnect
    if (this._searchDebounceTimeout) {
      clearTimeout(this._searchDebounceTimeout);
    }
  }

  toggleViewAllProjects() {
    this.viewAllProjects = !this.viewAllProjects;
    this.emitFilterChange();
  }

  toggleArchivedProjects() {
    this.showArchivedProjects = !this.showArchivedProjects;
    this.emitFilterChange();
  }

  handleStartDateChange(e) {
    this.startDate = e.target.value;
    this.emitFilterChange();
  }

  handleEndDateChange(e) {
    this.endDate = e.target.value;
    this.emitFilterChange();
  }

  applyFilters() {
    this._showFilterPopup = false;
    this.emitFilterChange();
  }

  render() {
    return html`
      <div class="filter-bar">
        <!-- Search Input with Clear Button -->
        <div class="search-container">
          <input type="text" class="search-input" placeholder="Search projects..." .value=${this.searchQuery} @input=${this.handleSearchInput} />
          ${this.searchQuery ? html`<button class="clear-search-btn" @click=${this.clearSearch} title="Clear search"><svg class="icon"><use href="#da-loc-clear"/></svg></button>` : nothing}
        </div>

        <!-- Filter Button -->
        <button class="filter-button" @click=${this.toggleFilterPopup}>Filters</button>

          <!-- Filter Popup -->
          ${this._showFilterPopup ? html`
            <div class="filter-popup" style="top: ${this._popupPosition.top}px; left: ${this._popupPosition.left}px">
                <h3>Filter Options</h3>
                <div class="filter-section">
                    <h4>Translation Status</h4>
                    <div class="checkbox-grid">
                    ${this.translationStatuses.map((status) => html`
                        <label>
                            <input type="checkbox" .value=${status} .checked=${this.selectedTranslationStatuses.includes(status)} @change=${this.handleTranslationStatusChange} />
                            ${status}
                        </label>`)}
                    </div>
                </div>
                <div class="filter-section">
                    <h4>Rollout Status</h4>
                    <div class="checkbox-grid">
                    ${this.rolloutStatuses.map((status) => html`
                        <label>
                            <input type="checkbox" .value=${status} .checked=${this.selectedRolloutStatuses.includes(status)} @change=${this.handleRolloutStatusChange} />
                            ${status}
                        </label>`)}
                    </div>
                    <button class="apply-filter-button" @click=${this.applyFilters}>
                      Apply
                    </button>
                </div>
              </div>` : nothing}
          <!-- Filter Popup -->

        <!-- Date Range -->
        <input type="date" class="date-picker" .value=${this.startDate || ''} @change=${this.handleStartDateChange} />
        <span>to</span>
        <input type="date" class="date-picker" .value=${this.endDate || ''} @change=${this.handleEndDateChange} />

        <!-- Toggle Switch -->
        <div class="toggle-switch">
          <label>
              <input type="checkbox" .checked=${!this.viewAllProjects} @change=${this.toggleViewAllProjects}/>
              <span class="slider"></span>
              <span class="toggle-label">My Projects</span>
          </label>
        </div>

        <div class="toggle-switch">
          <label>
              <input type="checkbox" .checked=${this.showArchivedProjects} @change=${this.toggleArchivedProjects}/>
              <span class="slider"></span>
              <span class="toggle-label">Archived</span>
          </label>
        </div>
      </div>`;
  }
}

customElements.define('nx-filter-bar', NxFilterBar);
