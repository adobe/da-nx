import { html, LitElement } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import getSvg from '../../../../public/utils/svg.js';
import { getAppState, subscribeToAppState } from '../../utils/state.js';

const styles = await getStyle(import.meta.url);
const nx = `${new URL(import.meta.url).origin}/nx`;
const sl = await getStyle(`${nx}/public/sl/styles.css`);
const slComponents = await getStyle(`${nx}/public/sl/components.css`);
const ICONS = [
  `${nx}/img/icons/S2IconClassicGridView20N-icon.svg`,
  `${nx}/img/icons/S2IconHome20N-icon.svg`,
  `${nx}/public/icons/S2_Icon_Properties_20_N.svg`,
  `${nx}/public/icons/S2_GraphBarVertical_18_N.svg`,
  `${nx}/public/icons/C_Icon_Filters_20.svg`,
];

class NxMediaSidebar extends LitElement {
  static properties = {
    _appState: { state: true },
    isExpanded: { state: true },
    isIndexExpanded: { state: true },
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
    this._appState = getAppState();
    this.isExpanded = false;
    this.isIndexExpanded = false;
    this._unsubscribe = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, slComponents, styles];
    
    this._unsubscribe = subscribeToAppState((state) => {
      this._appState = state;
      this.requestUpdate();
    });
    
    getSvg({ parent: this.shadowRoot, paths: ICONS });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._unsubscribe) {
      this._unsubscribe();
    }
  }

  handleFiltersToggle() {
    if (this.isIndexExpanded) {
      this.isIndexExpanded = false;
    }
    this.isExpanded = !this.isExpanded;
    this.dispatchEvent(new CustomEvent('sidebarToggle', { detail: { expanded: this.isExpanded } }));
  }

  handleIndexToggle() {
    if (this.isExpanded) {
      this.isExpanded = false;
    }
    this.isIndexExpanded = !this.isIndexExpanded;
  }

  handleHome() {
    this.dispatchEvent(new CustomEvent('go-home', {
      bubbles: true,
      composed: true,
    }));
  }

  handleFilter(e) {
    const filterType = e.target.dataset.filter;
    this.dispatchEvent(new CustomEvent('filter', { detail: { type: filterType } }));
  }

  renderFilterButton(filter) {
    const isActive = this._appState.selectedFilterType === filter.key;

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

  renderIndexPanel() {
    if (this._appState.isScanning) {
      const pages = this._appState.scanProgress?.pages || 0;
      const files = this._appState.scanProgress?.mediaFiles || 0;
      const refs = this._appState.scanProgress?.mediaReferences || 0;
      return html`
        <div class="index-panel">
          <div class="index-message">
            ${pages} docs, ${files} files, ${refs} refs
          </div>
        </div>
      `;
    }

    const hasCompletedScan = this._appState.scanProgress?.duration
      || (!this._appState.isScanning && (this._appState.scanProgress?.pages > 0 || this._appState.scanProgress?.mediaReferences > 0));

    if (hasCompletedScan && this._appState.scanProgress.hasChanges === true) {
      const items = this._appState.scanProgress?.mediaReferences || 0;
      const docs = this._appState.scanProgress?.pages || 0;
      return html`
        <div class="index-panel">
          <div class="index-message">
            ${items} items in ${docs} documents
          </div>
        </div>
      `;
    }

    if (hasCompletedScan && this._appState.scanProgress.hasChanges === false) {
      return html`
        <div class="index-panel">
          <div class="index-message">
            No changes found
          </div>
        </div>
      `;
    }

    return html`
      <div class="index-panel">
        <div class="index-message empty">
          Ready to index
        </div>
      </div>
    `;
  }

  render() {
    const isExpanded = this.isExpanded || this.isIndexExpanded;
    return html`
      <aside class="media-sidebar ${isExpanded ? 'expanded' : 'collapsed'}">
        <div class="sidebar-icons">
          <button
            class="icon-btn ${this.isExpanded ? 'active' : ''}"
            @click=${this.handleFiltersToggle}
            title="Filters"
            aria-label="Toggle filters panel"
            aria-expanded="${this.isExpanded}"
          >
            <svg class="icon">
              <use href="#S2_Icon_Properties_20_N"></use>
            </svg>
            <span class="button-text">Filters</span>
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

        <div class="sidebar-icons secondary">
          <button
            class="icon-btn ${this.isIndexExpanded ? 'active' : ''}"
            @click=${this.handleIndexToggle}
            title="Index"
            aria-label="Toggle index panel"
            aria-expanded="${this.isIndexExpanded}"
          >
            <svg class="icon" viewBox="0 0 20 18">
              <use href="#S2_GraphBarVertical_18_N"></use>
            </svg>
            <span class="button-text">Index</span>
          </button>
        </div>

        ${this.isIndexExpanded ? this.renderIndexPanel() : ''}
      </aside>
    `;
  }
}

customElements.define('nx-media-sidebar', NxMediaSidebar);
