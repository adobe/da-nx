import { html, LitElement } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import getSvg from '../../../../public/utils/svg.js';
import { getLeafTags } from '../../utils/tags.js';

const styles = await getStyle(import.meta.url);
const nx = `${new URL(import.meta.url).origin}/nx`;
const sl = await getStyle(`${nx}/public/sl/styles.css`);
const slComponents = await getStyle(`${nx}/public/sl/components.css`);
const ICONS = [
  `${nx}/img/icons/S2IconClassicGridView20N-icon.svg`,
  `${nx}/public/icons/S2_Icon_Properties_20_N.svg`,
  `${nx}/public/icons/S2_GraphBarVertical_18_N.svg`,
  `${nx}/public/icons/C_Icon_Filters_20.svg`,
  `${nx}/public/icons/S2_Icon_ListBulleted_20_N.svg`,
  `${nx}/public/icons/S2_Icon_Add_20_N.svg`,
  `${nx}/public/icons/S2_Icon_Tag_20_N.svg`,
  `${nx}/public/icons/S2_Icon_ViewAllTags_18_N.svg`,
];

class NxMediaSidebar extends LitElement {
  static properties = {
    activeFilter: { attribute: false },
    isScanning: { attribute: false, type: Boolean },
    scanProgress: { attribute: false, type: Object },
    tagConfig: { attribute: false },
    tagIndex: { attribute: false },
    selectedTag: { attribute: false },
    isExpanded: { state: true },
    isTagsExpanded: { state: true },
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
    this.activeFilter = 'all';
    this.isExpanded = false;
    this.isTagsExpanded = false;
    this.isIndexExpanded = false;
    this.isScanning = false;
    this.scanProgress = { pages: 0, media: 0, duration: null, hasChanges: null };
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, slComponents, styles];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
  }

  handleFiltersToggle() {
    if (this.isTagsExpanded) {
      this.isTagsExpanded = false;
    }
    if (this.isIndexExpanded) {
      this.isIndexExpanded = false;
    }
    this.isExpanded = !this.isExpanded;
    this.dispatchEvent(new CustomEvent('sidebarToggle', { detail: { expanded: this.isExpanded } }));
  }

  handleTagsToggle() {
    if (this.isExpanded) {
      this.isExpanded = false;
    }
    if (this.isIndexExpanded) {
      this.isIndexExpanded = false;
    }
    this.isTagsExpanded = !this.isTagsExpanded;
  }

  handleIndexToggle() {
    if (this.isExpanded) {
      this.isExpanded = false;
    }
    if (this.isTagsExpanded) {
      this.isTagsExpanded = false;
    }
    this.isIndexExpanded = !this.isIndexExpanded;
  }

  handleFilter(e) {
    const filterType = e.target.dataset.filter;
    this.dispatchEvent(new CustomEvent('filter', { detail: { type: filterType } }));
  }

  handleTagClick(e) {
    const tag = e.target.dataset.tag;
    this.dispatchEvent(new CustomEvent('tag-filter', { detail: { tag } }));
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

  handleStartTagging() {
    this.dispatchEvent(new CustomEvent('start-tagging', {
      bubbles: true,
      composed: true,
    }));
  }

  renderTagsPanel() {
    if (!this.tagConfig?.taxonomy) {
      return html`
        <div class="tags-panel">
          <div class="tags-message empty">
            No tags configured
          </div>
        </div>
      `;
    }

    const leafTags = getLeafTags(this.tagConfig.taxonomy);
    if (leafTags.length === 0) {
      return html`
        <div class="tags-panel">
          <div class="tags-message empty">
            No tags available
          </div>
        </div>
      `;
    }

    return html`
      <div class="tags-panel">
        <div class="tags-panel-header">
          <button class="tag-media-button" @click=${this.handleStartTagging}>
            <svg class="icon" viewBox="0 0 20 20">
              <use href="#S2_Icon_Add_20_N"></use>
            </svg>
            Tag Media
          </button>
        </div>
        <ul class="tags-list">
          ${leafTags.map((tag) => html`
            <li>
              <button
                data-tag="${tag.path}"
                @click=${this.handleTagClick}
                class="${this.selectedTag === tag.path ? 'active' : ''}"
                title="${tag.fullPath}"
              >
                <svg class="tag-icon">
                  <use href="#S2_Icon_Tag_20_N"></use>
                </svg>
                ${tag.name}
              </button>
            </li>
          `)}
        </ul>
      </div>
    `;
  }

  renderIndexPanel() {
    if (this.isScanning) {
      return html`
        <div class="index-panel">
          <div class="index-message">
            ${this.scanProgress?.pages || 0} pages, ${this.scanProgress?.media || 0} media
          </div>
        </div>
      `;
    }

    const hasCompletedScan = this.scanProgress?.duration
      || (!this.isScanning && (this.scanProgress?.pages > 0 || this.scanProgress?.media > 0));

    if (hasCompletedScan) {
      if (this.scanProgress.hasChanges === false) {
        return html`
          <div class="index-panel">
            <div class="index-message">
              No changes found
            </div>
          </div>
        `;
      }

      if (this.scanProgress.hasChanges === true) {
        return html`
          <div class="index-panel">
            <div class="index-message">
              Found ${this.scanProgress?.media || 0} media
            </div>
          </div>
        `;
      }

      return html`
        <div class="index-panel">
          <div class="index-message">
            Scan completed
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
    const isAnyExpanded = this.isExpanded || this.isTagsExpanded || this.isIndexExpanded;
    
    return html`
      <aside class="media-sidebar ${isAnyExpanded ? 'expanded' : 'collapsed'}">
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
            ${isAnyExpanded ? html`<span>Filters</span>` : ''}
          </button>
          
          <button
            class="icon-btn ${this.isTagsExpanded ? 'active' : ''}"
            @click=${this.handleTagsToggle}
            title="Tags"
            aria-label="Toggle tags panel"
            aria-expanded="${this.isTagsExpanded}"
          >
            <svg class="icon">
              <use href="#S2_Icon_ViewAllTags_18_N"></use>
            </svg>
            ${isAnyExpanded ? html`<span>Tags</span>` : ''}
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

        ${this.isTagsExpanded ? this.renderTagsPanel() : ''}

        <div class="sidebar-icons secondary">
          <button
            class="icon-btn ${this.isIndexExpanded ? 'active' : ''}"
            @click=${this.handleIndexToggle}
            title="Index"
            aria-label="Toggle index panel"
            aria-expanded="${this.isIndexExpanded}"
          >
            <svg class="icon">
              <use href="#S2_GraphBarVertical_18_N"></use>
            </svg>
            ${isAnyExpanded ? html`<span>Index</span>` : ''}
          </button>
        </div>

        ${this.isIndexExpanded ? this.renderIndexPanel() : ''}
      </aside>
    `;
  }
}

customElements.define('nx-media-sidebar', NxMediaSidebar);
