import { LitElement, html } from '../../../../deps/lit/lit-core.min.js';
import { getConfig } from '../../../../scripts/nexter.js';
import getStyle from '../../../../utils/styles.js';

const { nxBase } = getConfig();
const style = await getStyle(import.meta.url);
const buttons = await getStyle(`${nxBase}/styles/buttons.js`);

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
  };

  constructor() {
    super();
    this.searchQuery = '';
    this.startDate = null;
    this.endDate = null;
    this.translationStatuses = ['Error', 'Completed', 'Created', 'In Progress'];
    this.rolloutStatuses = ['Error', 'Completed', 'Rollout Ready', 'In Progress'];
    this.selectedTranslationStatuses = [];
    this.selectedRolloutStatuses = [];
    this._showFilterPopup = false; // Track popup visibility
    this.viewAllProjects = true; // Default to "All Projects"
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

  handleTranslationStatusChange(event) {
    const { value, checked } = event.target;
    if (checked) {
      this.selectedTranslationStatuses = [...this.selectedTranslationStatuses, value];
    } else {
      this.selectedTranslationStatuses = this.selectedTranslationStatuses.filter(
        (status) => status !== value,
      );
    }
    this.emitFilterChange();
  }

  handleRolloutStatusChange(event) {
    const { value, checked } = event.target;
    if (checked) {
      this.selectedRolloutStatuses = [...this.selectedRolloutStatuses, value];
    } else {
      this.selectedRolloutStatuses = this.selectedRolloutStatuses.filter(
        (status) => status !== value,
      );
    }
    this.emitFilterChange();
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('click', (e) => this.handleOutsideClick(e));
    this.shadowRoot.adoptedStyleSheets = [style, buttons];
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('click', (e) => this.handleOutsideClick(e));
  }

  toggleViewAllProjects() {
    this.viewAllProjects = !this.viewAllProjects;
    this.emitFilterChange();
  }

  render() {
    return html`
      <div class="filter-bar">
        <!-- Search Input -->
        <input type="text" class="search-input" placeholder="Search projects..." .value=${this.searchQuery} @input=${(e) => { this.searchQuery = e.target.value; this.emitFilterChange(); }} />

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
                    <button class="apply-filter-button" @click=${() => { this._showFilterPopup = false; this.emitFilterChange(); }}>
                      Apply
                    </button>
                </div>
              </div>` : ''}
          <!-- Filter Popup -->

        <!-- Date Range -->
        <input type="date" class="date-picker" @change=${(e) => { this.startDate = e.target.value; this.emitFilterChange(); }} />
        <span>to</span>
        <input type="date" class="date-picker" @change=${(e) => { this.endDate = e.target.value; this.emitFilterChange(); }} />

        <!-- Toggle Switch -->
        <div class="toggle-switch">
          <label>
              <input type="checkbox" .checked=${!this.viewAllProjects} @change=${this.toggleViewAllProjects}/>
              <span class="slider"></span>
              <span class="toggle-label">My Projects</span>
          </label>
        </div>
      </div>`;
  }
}

customElements.define('nx-filter-bar', NxFilterBar);
