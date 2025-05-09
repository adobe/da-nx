import { LitElement, html } from '../../../../deps/lit/lit-core.min.js';
import { getConfig } from '../../../../scripts/nexter.js';
import getStyle from '../../../../utils/styles.js';

const { nxBase } = getConfig();
const style = await getStyle(import.meta.url);
const buttons = await getStyle(`${nxBase}/styles/buttons.js`);

class NxPagination extends LitElement {
  static properties = {
    currentPage: { type: Number },
    totalItems: { type: Number },
    itemsPerPage: { type: Number },
  };

  constructor() {
    super();
    this.currentPage = 1;
  }

  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style, buttons];
  }

  get totalPages() {
    return Math.ceil(this.totalItems / this.itemsPerPage);
  }

  handlePageChange(page) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.dispatchEvent(new CustomEvent('page-change', { detail: { page } }));
    }
  }

  render() {
    return html`
      <div class="pagination">
        <div class="pagination-info">
          Showing ${(this.currentPage - 1) * this.itemsPerPage + 1}–${Math.min(this.currentPage * this.itemsPerPage, this.totalItems)} of ${this.totalItems}
        </div>
        <div class="pagination-controls">
          <button class="pagination-btn" ?disabled=${this.currentPage === 1} @click=${() => this.handlePageChange(this.currentPage - 1)}>
            Previous
          </button>
          ${Array.from({ length: this.totalPages }, (_, i) => i + 1).map((page) => html`
            <button class="pagination-btn ${this.currentPage === page ? 'active' : ''}" @click=${() => this.handlePageChange(page)}>${page}</button>`)}
          <button class="pagination-btn" ?disabled=${this.currentPage === this.totalPages} @click=${() => this.handlePageChange(this.currentPage + 1)}>Next</button>
        </div>
      </div>`;
  }
}

customElements.define('nx-pagination', NxPagination);
