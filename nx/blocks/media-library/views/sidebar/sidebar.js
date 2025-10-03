import { html, LitElement } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import { getDisplayName } from '../../utils/utils.js';

const styles = await getStyle(import.meta.url);

class NxMediaSidebar extends LitElement {
  static properties = {
    selectedDocument: { attribute: false },
    documentMediaBreakdown: { attribute: false },

    activeFilter: { attribute: false },
    filterCounts: { attribute: false },
    isLoading: { attribute: false },
  };

  static filterStructure = {
    main: [
      { key: 'all', label: 'All Media' },
      { key: 'images', label: 'Images' },
      { key: 'icons', label: 'SVGs' },
      { key: 'videos', label: 'Videos' },
      { key: 'documents', label: 'PDFs' },
      { key: 'fragments', label: 'Fragments' },
    ],
    usage: [
      { key: 'links', label: 'Links' },
    ],
    accessibility: [
      { key: 'filled', label: 'Filled' },
      { key: 'decorative', label: 'Decorative' },
    ],
  };

  constructor() {
    super();
    this.selectedDocument = null;
    this.documentMediaBreakdown = null;

    this.activeFilter = 'all';
    this.filterCounts = {};
    this.isLoading = true;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  updated(changedProperties) {
    super.updated(changedProperties);
  }

  handleFilter(e) {
    const filterType = e.target.dataset.filter;

    this.dispatchEvent(new CustomEvent('filter', { detail: { type: filterType } }));
  }

  get mediaCounts() {
    return this.filterCounts || {};
  }

  hasAccessibilityData(counts) {
    return (counts.filled > 0 || counts.decorative > 0 || counts.missingAlt > 0);
  }

  renderFilterButton(filter, counts, isLoading) {
    const count = counts[filter.key] || 0;
    const isActive = this.activeFilter === filter.key;
    const showButton = isLoading || count > 0;

    if (!showButton) return '';

    return html`
      <li>
        <button 
          data-filter="${filter.key}" 
          @click=${this.handleFilter}
          class="${isActive ? 'active' : ''} ${isLoading ? 'loading' : ''}"
          ${isLoading ? 'disabled' : ''}
        >
          ${filter.label}
          <span class="count ${isLoading ? 'loading' : ''}">
            ${isLoading ? '...' : count}
          </span>
        </button>
      </li>
    `;
  }

  handleDocumentFilter(e) {
    const filterType = e.target.dataset.filter;
    this.dispatchEvent(new CustomEvent('documentFilter', {
      detail: {
        type: filterType,
        document: this.selectedDocument,
      },
    }));
  }

  render() {
    const counts = this.mediaCounts;
    const isLoading = this.isLoading || Object.keys(counts).length === 0;

    return html`
      <aside class="media-sidebar">
        <div class="sidebar-header">
          <h1 class="sidebar-title">Media Library</h1>
        </div>
        <div class="filter-section">
          <h3>Filters</h3>
          <ul class="filter-list">
            ${NxMediaSidebar.filterStructure.main.map((filter) => this.renderFilterButton(filter, counts, isLoading))}
          </ul>
        </div>

        ${(counts.links > 0 || isLoading) ? html`
          <div class="filter-section">
            <h3>Usage</h3>
            <ul class="filter-list">
              ${NxMediaSidebar.filterStructure.usage.map((filter) => this.renderFilterButton(filter, counts, isLoading))}
            </ul>
          </div>
        ` : ''}

        ${(this.hasAccessibilityData(counts) || isLoading) ? html`
          <div class="filter-section">
            <h3>Accessibility</h3>
            <ul class="filter-list">
              ${NxMediaSidebar.filterStructure.accessibility.map((filter) => this.renderFilterButton(filter, counts, isLoading))}
            </ul>
          </div>
        ` : ''}

        ${this.selectedDocument && this.documentMediaBreakdown ? html`
          <div class="filter-section">
            <div class="document-header">
              <h3>References</h3>
            </div>
            <div class="document-info">
              <div class="document-name" title="${this.selectedDocument}">
                ${getDisplayName(this.selectedDocument)}(${this.documentMediaBreakdown.total})
              </div>
            </div>
            <ul class="filter-list">
              ${this.documentMediaBreakdown.images > 0 ? html`
                <li>
                  <button 
                    data-filter="documentImages" 
                    @click=${this.handleDocumentFilter}
                    class="${this.activeFilter === 'documentImages' ? 'active' : ''}"
                  >
                    Images
                    <span class="count">${this.documentMediaBreakdown.images}</span>
                  </button>
                </li>
              ` : ''}
              ${this.documentMediaBreakdown.icons > 0 ? html`
                <li>
                  <button 
                    data-filter="documentIcons" 
                    @click=${this.handleDocumentFilter}
                    class="${this.activeFilter === 'documentIcons' ? 'active' : ''}"
                  >
                    SVGs
                    <span class="count">${this.documentMediaBreakdown.icons}</span>
                  </button>
                </li>
              ` : ''}
              ${this.documentMediaBreakdown.videos > 0 ? html`
                <li>
                  <button 
                    data-filter="documentVideos" 
                    @click=${this.handleDocumentFilter}
                    class="${this.activeFilter === 'documentVideos' ? 'active' : ''}"
                  >
                    Videos
                    <span class="count">${this.documentMediaBreakdown.videos}</span>
                  </button>
                </li>
              ` : ''}
              ${this.documentMediaBreakdown.documents > 0 ? html`
                <li>
                  <button 
                    data-filter="documentDocuments" 
                    @click=${this.handleDocumentFilter}
                    class="${this.activeFilter === 'documentDocuments' ? 'active' : ''}"
                  >
                    PDFs
                    <span class="count">${this.documentMediaBreakdown.documents}</span>
                  </button>
                </li>
              ` : ''}
              ${this.documentMediaBreakdown.fragments > 0 ? html`
                <li>
                  <button 
                    data-filter="documentFragments" 
                    @click=${this.handleDocumentFilter}
                    class="${this.activeFilter === 'documentFragments' ? 'active' : ''}"
                  >
                    Fragments
                    <span class="count">${this.documentMediaBreakdown.fragments}</span>
                  </button>
                </li>
              ` : ''}
              ${this.documentMediaBreakdown.links > 0 ? html`
                <li>
                  <button 
                    data-filter="documentLinks" 
                    @click=${this.handleDocumentFilter}
                    class="${this.activeFilter === 'documentLinks' ? 'active' : ''}"
                  >
                    Links
                    <span class="count">${this.documentMediaBreakdown.links}</span>
                  </button>
                </li>
              ` : ''}
              ${(this.documentMediaBreakdown.filled > 0 || this.documentMediaBreakdown.decorative > 0 || this.documentMediaBreakdown.missingAlt > 0) ? html`
                <li class="accessibility-section">
                  <span class="section-label">Accessibility</span>
                </li>
              ` : ''}
              ${this.documentMediaBreakdown.filled > 0 ? html`
                <li>
                  <button 
                    data-filter="documentFilled" 
                    @click=${this.handleDocumentFilter}
                    class="${this.activeFilter === 'documentFilled' ? 'active' : ''}"
                  >
                    Filled
                    <span class="count">${this.documentMediaBreakdown.filled}</span>
                  </button>
                </li>
              ` : ''}
              ${this.documentMediaBreakdown.decorative > 0 ? html`
                <li>
                  <button 
                    data-filter="documentDecorative" 
                    @click=${this.handleDocumentFilter}
                    class="${this.activeFilter === 'documentDecorative' ? 'active' : ''}"
                  >
                    Decorative
                    <span class="count">${this.documentMediaBreakdown.decorative}</span>
                  </button>
                </li>
              ` : ''}
            </ul>
          </div>
        ` : ''}
      </aside>
    `;
  }
}

customElements.define('nx-media-sidebar', NxMediaSidebar);
