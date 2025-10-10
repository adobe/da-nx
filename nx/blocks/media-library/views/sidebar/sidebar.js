import { html, LitElement } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import getSvg from '../../../../public/utils/svg.js';

const styles = await getStyle(import.meta.url);
const nx = `${new URL(import.meta.url).origin}/nx`;
const ICONS = [
  `${nx}/img/icons/S2IconClassicGridView20N-icon.svg`,
  `${nx}/public/icons/S2_Icon_ListBulleted_20_N.svg`,
  `${nx}/public/icons/S2_Icon_Properties_20_N.svg`,
];

class NxMediaSidebar extends LitElement {
  static properties = {
    activeFilter: { attribute: false },
    currentView: { attribute: false },
    isExpanded: { state: true },
  };

  static filterStructure = {
    main: [
      { key: 'all', label: 'All Media' },
      { key: 'images', label: 'Images' },
      { key: 'icons', label: 'SVGs' },
      { key: 'videos', label: 'Videos' },
      { key: 'documents', label: 'PDFs' },
      { key: 'fragments', label: 'Fragments' },
      { key: 'links', label: 'Links' },
    ],
    accessibility: [
      { key: 'filled', label: 'Filled' },
      { key: 'decorative', label: 'Decorative' },
      { key: 'empty', label: 'Empty' },
    ],
  };

  constructor() {
    super();
    this.activeFilter = 'all';
    this.currentView = 'grid';
    this.isExpanded = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
  }

  handleViewChange(view) {
    this.currentView = view;
    this.dispatchEvent(new CustomEvent('viewChange', { detail: { view } }));
  }

  handleFiltersToggle() {
    this.isExpanded = !this.isExpanded;
    this.dispatchEvent(new CustomEvent('sidebarToggle', { detail: { expanded: this.isExpanded } }));
  }

  handleFilter(e) {
    const filterType = e.target.dataset.filter;
    this.dispatchEvent(new CustomEvent('filter', { detail: { type: filterType } }));
  }

  renderFilterButton(filter) {
    const isActive = this.activeFilter === filter.key;

    return html`
      <li>
        <button
          data-filter="${filter.key}"
          @click=${this.handleFilter}
          class="${isActive ? 'active' : ''}"
        >
          ${filter.label}
        </button>
      </li>
    `;
  }

  handleViewToggle() {
    const newView = this.currentView === 'grid' ? 'list' : 'grid';
    this.handleViewChange(newView);
  }

  render() {
    return html`
      <aside class="media-sidebar ${this.isExpanded ? 'expanded' : 'collapsed'}">
        <div class="sidebar-icons">
          <button
            class="icon-btn"
            @click=${this.handleViewToggle}
            title="${this.currentView === 'grid' ? 'Switch to List view' : 'Switch to Grid view'}"
          >
            <svg class="icon">
              <use href="${this.currentView === 'grid' ? '#S2_Icon_ListBulleted_20_N' : '#S2IconClassicGridView20N-icon'}"></use>
            </svg>
            ${this.isExpanded ? html`<span>${this.currentView === 'grid' ? 'List' : 'Grid'}</span>` : ''}
          </button>
          <button
            class="icon-btn ${this.isExpanded ? 'active' : ''}"
            @click=${this.handleFiltersToggle}
            title="Filters"
          >
            <svg class="icon">
              <use href="#S2_Icon_Properties_20_N"></use>
            </svg>
            ${this.isExpanded ? html`<span>Filters</span>` : ''}
          </button>
        </div>
        
        ${this.isExpanded ? html`
          <div class="filter-panel">
            <div class="filter-section">
              <h3>Types</h3>
              <ul class="filter-list">
                ${NxMediaSidebar.filterStructure.main.map(
    (filter) => this.renderFilterButton(filter),
  )}
              </ul>
            </div>
            <div class="filter-section">
              <h3>Accessibility</h3>
              <ul class="filter-list">
                ${NxMediaSidebar.filterStructure.accessibility.map(
    (filter) => this.renderFilterButton(filter),
  )}
              </ul>
            </div>
          </div>
        ` : ''}
      </aside>
    `;
  }
}

customElements.define('nx-media-sidebar', NxMediaSidebar);
