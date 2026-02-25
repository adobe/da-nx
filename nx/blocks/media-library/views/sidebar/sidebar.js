import { html, LitElement } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import getSvg from '../../../../public/utils/svg.js';
import { getAppState, onStateChange } from '../../utils/state.js';

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
      { key: 'documents', label: 'PDFs' },
      { key: 'fragments', label: 'Fragments' },
      { key: 'images', label: 'Images' },
      { key: 'icons', label: 'SVGs' },
      { key: 'links', label: 'Links' },
      { key: 'videos', label: 'Videos' },
      { key: 'noReferences', label: 'No References' },
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
      ['selectedFilterType', 'isIndexing', 'indexProgress', 'mediaData', 'indexLockedByOther'],
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

  renderDataPanel() {
    return html`
      <div class="data-panel">
        <button
          class="export-btn"
          @click=${this.handleExport}
          title="Export as CSV"
          ?disabled=${!this._appState.mediaData?.length}
        >
          Export
        </button>
        ${this.renderIndexPanel()}
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
        >
          ${filter.label}
        </button>
      </li>
    `;
  }

  renderIndexPanel() {
    const { isIndexing, indexProgress, indexLockedByOther } = this._appState;

    if (indexLockedByOther) {
      return html`
        <div class="index-panel data-index-status">
          <div class="index-message">
            Discovery in progress (another session)
          </div>
        </div>
      `;
    }

    if (isIndexing) {
      const percent = indexProgress?.percent ?? 0;
      return html`
        <div class="index-panel data-index-status">
          <div class="index-message">
            Discovering...
            ${percent > 0 && percent < 100 ? html`<span class="index-percent">${percent}%</span>` : ''}
          </div>
        </div>
      `;
    }

    const hasCompleted = indexProgress?.stage === 'complete';

    if (hasCompleted && indexProgress?.hasChanges === true) {
      const items = indexProgress?.mediaReferences ?? this._appState.mediaData?.length ?? 0;
      return html`
        <div class="index-panel data-index-status">
          <div class="index-message">
            ${items} items
            ${indexProgress?.duration ? html`<span class="index-duration">(${indexProgress.duration})</span>` : ''}
          </div>
        </div>
      `;
    }

    if (hasCompleted && indexProgress?.hasChanges === false) {
      return html`
        <div class="index-panel data-index-status">
          <div class="index-message">
            Up to date
          </div>
        </div>
      `;
    }

    return html`
      <div class="index-panel data-index-status">
        <div class="index-message empty">
          Ready to discover
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
          </div>
        ` : ''}

        <div class="sidebar-icons secondary">
          <button
            class="icon-btn ${this.isIndexExpanded ? 'active' : ''}"
            @click=${this.handleIndexToggle}
            title="Data"
            aria-label="Toggle data panel"
            aria-expanded="${this.isIndexExpanded}"
          >
            <svg class="icon" viewBox="0 0 20 18">
              <use href="#S2_GraphBarVertical_18_N"></use>
            </svg>
            <span class="button-text">Data</span>
          </button>
        </div>

        ${this.isIndexExpanded ? this.renderDataPanel() : ''}
      </aside>
    `;
  }
}

customElements.define('nx-media-sidebar', NxMediaSidebar);
