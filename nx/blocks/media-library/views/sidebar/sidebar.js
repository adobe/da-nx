import { html, LitElement } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import getSvg from '../../../../public/utils/svg.js';
import { getAppState, onStateChange } from '../../core/state.js';
import { t } from '../../core/messages.js';

const styles = await getStyle(import.meta.url);
const nx = `${new URL(import.meta.url).origin}/nx`;
const sl = await getStyle(`${nx}/public/sl/styles.css`);
const slComponents = await getStyle(`${nx}/public/sl/components.css`);
const iconsBase = new URL('../../icons/', import.meta.url).href;
const ICONS = [
  `${iconsBase}S2_Icon_Properties_20_N.svg`,
  `${iconsBase}S2_GraphBarVertical_18_N.svg`,
];

class NxMediaSidebar extends LitElement {
  static properties = {
    _appState: { state: true },
    isExpanded: { state: true },
    isIndexExpanded: { state: true },
  };

  static filterStructure = {
    main: [
      { key: 'images', label: 'Images' },
      { key: 'icons', label: 'SVGs' },
      { key: 'videos', label: 'Videos' },
      { key: 'documents', label: 'PDFs' },
      { key: 'fragments', label: 'Fragments' },
      { key: 'links', label: 'External' },
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
    this._unsubscribe = onStateChange(
      ['selectedFilterType', 'mediaData'],
      (state) => {
        this._appState = state;
        this.requestUpdate();
      },
    );
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

  handleExport() {
    this.dispatchEvent(new CustomEvent('export-csv', {
      bubbles: true,
      composed: true,
    }));
  }

  handleReportFilter(filterType) {
    this.dispatchEvent(new CustomEvent('filter', { detail: { type: filterType } }));
  }

  renderDataPanel() {
    const isNoRefsActive = this._appState.selectedFilterType === 'noReferences';

    return html`
      <div class="data-panel">
        <button
          class="report-btn ${isNoRefsActive ? 'active' : ''}"
          @click=${() => this.handleReportFilter('noReferences')}
          title="Show items with no references"
          aria-pressed="${isNoRefsActive}"
        >
          No References
        </button>
        <button
          class="export-btn"
          @click=${this.handleExport}
          title="Export as CSV"
          ?disabled=${!this._appState.mediaData?.length}
        >
          Export
        </button>
      </div>
    `;
  }

  renderFilterButton(filter) {
    const isActive = this._appState.selectedFilterType === filter.key;

    return html`
      <li>
        <button
          data-filter="${filter.key}"
          @click=${this.handleFilter}
          class="${isActive ? 'active' : ''}"
          aria-pressed="${isActive}"
        >
          ${filter.label}
        </button>
      </li>
    `;
  }

  render() {
    const isExpanded = this.isExpanded || this.isIndexExpanded;
    return html`
      <aside
        class="media-sidebar ${isExpanded ? 'expanded' : 'collapsed'}"
        aria-label="${t('UI_MEDIA_FILTERS')}"
      >
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
          </div>
        ` : ''}

        <div class="sidebar-icons secondary">
          <button
            class="icon-btn ${this.isIndexExpanded ? 'active' : ''}"
            @click=${this.handleIndexToggle}
            title="Reports"
            aria-label="Toggle reports panel"
            aria-expanded="${this.isIndexExpanded}"
          >
            <svg class="icon" viewBox="0 0 20 18">
              <use href="#S2_GraphBarVertical_18_N"></use>
            </svg>
            <span class="button-text">Reports</span>
          </button>
        </div>

        ${this.isIndexExpanded ? this.renderDataPanel() : ''}
      </aside>
    `;
  }
}

customElements.define('nx-media-sidebar', NxMediaSidebar);
