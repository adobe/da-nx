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
  };

  constructor() {
    super();
    this.selectedDocument = null;
    this.documentMediaBreakdown = null;

    this.activeFilter = 'all';
    this.filterCounts = {};
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

    return html`
      <aside class="media-sidebar">
        <div class="sidebar-header">
          <h1 class="sidebar-title">Media Library</h1>
        </div>
        <div class="filter-section">
          <h3>Filters</h3>
          <ul class="filter-list">
            ${counts.all > 0 ? html`
              <li>
                <button 
                  data-filter="all" 
                  @click=${this.handleFilter}
                  class="${this.activeFilter === 'all' ? 'active' : ''}"
                >
                  All Media
                  <span class="count">${counts.all}</span>
                </button>
              </li>
            ` : ''}
            ${counts.images > 0 ? html`
              <li>
                <button 
                  data-filter="images" 
                  @click=${this.handleFilter}
                  class="${this.activeFilter === 'images' ? 'active' : ''}"
                >
                  Images
                  <span class="count">${counts.images}</span>
                </button>
              </li>
            ` : ''}
            ${counts.icons > 0 ? html`
              <li>
                <button 
                  data-filter="icons" 
                  @click=${this.handleFilter}
                  class="${this.activeFilter === 'icons' ? 'active' : ''}"
                >
                  SVGs
                  <span class="count">${counts.icons}</span>
                </button>
              </li>
            ` : ''}
            ${counts.videos > 0 ? html`
              <li>
                <button 
                  data-filter="videos" 
                  @click=${this.handleFilter}
                  class="${this.activeFilter === 'videos' ? 'active' : ''}"
                >
                  Videos
                  <span class="count">${counts.videos}</span>
                </button>
              </li>
            ` : ''}
            ${counts.documents > 0 ? html`
              <li>
                <button 
                  data-filter="documents" 
                  @click=${this.handleFilter}
                  class="${this.activeFilter === 'documents' ? 'active' : ''}"
                >
                  PDFs
                  <span class="count">${counts.documents}</span>
                </button>
              </li>
            ` : ''}
          </ul>
        </div>

        ${counts.links > 0 ? html`
          <div class="filter-section">
            <h3>Usage</h3>
            <ul class="filter-list">
              <li>
                <button 
                  data-filter="links" 
                  @click=${this.handleFilter}
                  class="${this.activeFilter === 'links' ? 'active' : ''}"
                >
                  Links
                  <span class="count">${counts.links}</span>
                </button>
              </li>
            </ul>
          </div>
        ` : ''}

        ${(counts.filled > 0 || counts.decorative > 0 || counts.missingAlt > 0) ? html`
          <div class="filter-section">
            <h3>Accessibility</h3>
            <ul class="filter-list">
              ${counts.filled > 0 ? html`
                <li>
                  <button 
                    data-filter="filled" 
                    @click=${this.handleFilter}
                    class="${this.activeFilter === 'filled' ? 'active' : ''}"
                  >
                    Filled
                    <span class="count">${counts.filled}</span>
                  </button>
                </li>
              ` : ''}
              ${counts.decorative > 0 ? html`
                <li>
                  <button 
                    data-filter="decorative" 
                    @click=${this.handleFilter}
                    class="${this.activeFilter === 'decorative' ? 'active' : ''}"
                  >
                    Decorative
                    <span class="count">${counts.decorative}</span>
                  </button>
                </li>
              ` : ''}
              ${counts.missingAlt > 0 ? html`
                <li>
                  <button 
                    data-filter="missingAlt" 
                    @click=${this.handleFilter}
                    class="${this.activeFilter === 'missingAlt' ? 'active' : ''}"
                  >
                    No Alt Text
                    <span class="count">${counts.missingAlt}</span>
                  </button>
                </li>
              ` : ''}
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
              ${this.documentMediaBreakdown.missingAlt > 0 ? html`
                <li>
                  <button 
                    data-filter="documentMissingAlt" 
                    @click=${this.handleDocumentFilter}
                    class="${this.activeFilter === 'documentMissingAlt' ? 'active' : ''}"
                  >
                    No Alt Text
                    <span class="count">${this.documentMediaBreakdown.missingAlt}</span>
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
