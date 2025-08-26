import { html, LitElement } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import { getDisplayName } from '../../utils/utils.js';

const styles = await getStyle(import.meta.url);

class NxMediaSidebar extends LitElement {
  static properties = {
    selectedDocument: { attribute: false },
    documentMediaBreakdown: { attribute: false },
    folderFilterPaths: { attribute: false },
    activeFilter: { attribute: false },
    filterCounts: { attribute: false },
  };

  constructor() {
    super();
    this.selectedDocument = null;
    this.documentMediaBreakdown = null;
    this.folderFilterPaths = [];
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

    // Clear document filter when "All Media" is clicked
    if (filterType === 'all' && this.folderFilterPaths && this.folderFilterPaths.length > 0) {
      this.dispatchEvent(new CustomEvent('clearDocumentFilter'));
    }

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
          <h3>FILTERS</h3>
          <ul class="filter-list">
            <li>
              <button 
                data-filter="all" 
                @click=${this.handleFilter}
                class="${this.activeFilter === 'all' ? 'active' : ''}"
              >
                All Media
                <span class="count">${counts.all || 0}</span>
              </button>
            </li>
            <li>
              <button 
                data-filter="images" 
                @click=${this.handleFilter}
                class="${this.activeFilter === 'images' ? 'active' : ''}"
              >
                Images
                <span class="count">${counts.images || 0}</span>
              </button>
            </li>
            <li>
              <button 
                data-filter="icons" 
                @click=${this.handleFilter}
                class="${this.activeFilter === 'icons' ? 'active' : ''}"
              >
                Icons
                <span class="count">${counts.icons || 0}</span>
              </button>
            </li>
            <li>
              <button 
                data-filter="videos" 
                @click=${this.handleFilter}
                class="${this.activeFilter === 'videos' ? 'active' : ''}"
              >
                Videos
                <span class="count">${counts.videos || 0}</span>
              </button>
            </li>
            <li>
              <button 
                data-filter="documents" 
                @click=${this.handleFilter}
                class="${this.activeFilter === 'documents' ? 'active' : ''}"
              >
                Documents
                <span class="count">${counts.documents || 0}</span>
              </button>
            </li>
            <li>
              <button 
                data-filter="links" 
                @click=${this.handleFilter}
                class="${this.activeFilter === 'links' ? 'active' : ''}"
              >
                Links
                <span class="count">${counts.links || 0}</span>
              </button>
            </li>
            <li>
              <button 
                data-filter="missingAlt" 
                @click=${this.handleFilter}
                class="${this.activeFilter === 'missingAlt' ? 'active' : ''}"
              >
                No Alt
                <span class="count">${counts.missingAlt || 0}</span>
              </button>
            </li>
          </ul>
        </div>

        ${this.selectedDocument && this.documentMediaBreakdown ? html`
          <div class="filter-section">
            <div class="document-header">
              <h3>DOCUMENT FILTERS</h3>
            </div>
            <div class="document-info">
              <div class="document-name" title="${this.selectedDocument}">
                ${getDisplayName(this.selectedDocument)}
              </div>
            </div>
            <ul class="filter-list">
              <li>
                <button 
                  data-filter="documentTotal" 
                  @click=${this.handleDocumentFilter}
                  class="${this.activeFilter === 'documentTotal' ? 'active' : ''}"
                >
                  Total Media
                  <span class="count">${this.documentMediaBreakdown.total}</span>
                </button>
              </li>
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
                    Icons
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
                    Documents
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
              ${this.documentMediaBreakdown.missingAlt > 0 ? html`
                <li>
                  <button 
                    data-filter="documentMissingAlt" 
                    @click=${this.handleDocumentFilter}
                    class="${this.activeFilter === 'documentMissingAlt' ? 'active' : ''}"
                  >
                    No Alt
                    <span class="count">${this.documentMediaBreakdown.missingAlt}</span>
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
