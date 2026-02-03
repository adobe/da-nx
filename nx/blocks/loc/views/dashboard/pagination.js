import { LitElement, html, nothing } from '../../../../deps/lit/lit-core.min.js';
import { getConfig } from '../../../../scripts/nexter.js';
import getStyle from '../../../../utils/styles.js';

const { nxBase } = getConfig();
const style = await getStyle(import.meta.url);
const buttons = await getStyle(`${nxBase}/styles/buttons.js`);

const ELLIPSIS_HTML = html`<span class="pagination-ellipsis">. . .</span>`;

class NxPagination extends LitElement {
  static properties = {
    currentPage: { type: Number },
    totalItems: { type: Number },
    itemsPerPage: { type: Number },
    surroundingPages: { type: Number },
  };

  constructor() {
    super();
    this.currentPage = 0;
    this.surroundingPages = this.surroundingPages ?? 3;
    this.itemsPerPage = this.itemsPerPage ?? 25;
  }

  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style, buttons];
  }

  get totalPages() {
    return Math.ceil(this.totalItems / this.itemsPerPage);
  }

  get visiblePages() {
    // Maximum visible elements: first page + ellipsis +
    // (current ± surroundingPages) + ellipsis + last page
    const maxVisible = 3 + (this.surroundingPages * 2);

    // Show all pages if we have fewer than the maximum visible
    if (this.totalPages <= maxVisible) {
      return [...(Array(this.totalPages).keys())];
    }

    return this.calculateVisiblePages();
  }

  /**
   * Calculate which page numbers should be visible in the pagination control.
   * Target: Always show first, last, and current page, plus surroundingPages
   * on each side of current. When near boundaries, extend the range to
   * maintain consistent button count.
   */
  calculateVisiblePages() {
    const firstPage = 0;
    const lastPage = this.totalPages - 1;
    const { currentPage } = this;

    // Always include first, last and current page
    const pages = [firstPage, lastPage, currentPage];

    // Calculate how many pages we're missing on each side due to boundaries
    // missingOnLeft: if current is close to start, we can't show full surroundingPages on left
    // missingOnRight: if current is close to end, we can't show full surroundingPages on right
    const missingOnLeft = Math.max(0, this.surroundingPages + 1 - currentPage);
    const missingOnRight = Math.max(0, this.surroundingPages + 2 + currentPage - this.totalPages);

    // Adjust the range to compensate for missing pages
    // If we're missing pages on the left, extend the range to the right by that amount
    // If we're missing pages on the right, extend the range to the left by that amount
    const rangeStart = Math.max(firstPage, currentPage - this.surroundingPages - missingOnRight);
    const rangeEnd = Math.min(lastPage, currentPage + this.surroundingPages + missingOnLeft);

    // Add all pages in the calculated range around current page
    for (let page = rangeStart; page <= rangeEnd; page += 1) {
      pages.push(page);
    }

    // Remove duplicates and sort in ascending order
    return [...new Set(pages)].sort((a, b) => a - b);
  }

  handlePageChange(page) {
    if (page >= 0 && page < this.totalPages) {
      this.currentPage = page;
      const showFrom = this.currentPage * this.itemsPerPage;
      const showTo = Math.min((this.currentPage + 1) * this.itemsPerPage, this.totalItems);
      this.dispatchEvent(new CustomEvent('page-change', { detail: { page, showFrom, showTo } }));
    }
  }

  renderButtonNav() {
    const { visiblePages } = this;
    const pageButtons = [];

    const addPageButton = (page) => {
      pageButtons.push(html`
        <button
          class="pagination-btn ${this.currentPage === page ? 'active' : ''}"
          @click=${() => this.handlePageChange(page)}>
          ${page + 1}
        </button>`);
    };

    for (let i = 0; i < visiblePages.length; i += 1) {
      const page = visiblePages[i];
      const prevPage = visiblePages[i - 1];
      const hasGap = i > 0 && page - prevPage > 1;

      if (hasGap && i === 1) {
        // Gap right after first page: add ellipsis but skip this page button
        // (it's too close to first page and would create visual clutter)
        pageButtons.push(ELLIPSIS_HTML);
      } else {
        // Handle gap elsewhere or no gap
        if (hasGap) {
          // Remove previous button (too close to gap), then add ellipsis
          pageButtons.pop();
          pageButtons.push(ELLIPSIS_HTML);
        }
        // Add the page button
        addPageButton(page);
      }
    }
    return pageButtons;
  }

  render() {
    if (this.totalItems === 0) return nothing;

    return html`
      <div class="pagination">
        <div class="pagination-info">
          Showing ${(this.currentPage) * this.itemsPerPage + 1}–${Math.min((this.currentPage + 1) * this.itemsPerPage, this.totalItems)} of ${this.totalItems}
        </div>
        ${this.totalPages > 1 ? html`<div class="pagination-controls">
          <button class="pagination-btn pref-next" ?disabled=${this.currentPage === 0} @click=${() => this.handlePageChange(this.currentPage - 1)}>
            Previous
          </button>
          ${this.renderButtonNav()}
          <button class="pagination-btn pref-next" ?disabled=${this.currentPage === this.totalPages - 1} @click=${() => this.handlePageChange(this.currentPage + 1)}>Next</button>
        </div>` : nothing}
      </div>`;
  }
}

customElements.define('nx-pagination', NxPagination);
