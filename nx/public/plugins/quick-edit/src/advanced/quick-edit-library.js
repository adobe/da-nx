import { LitElement, html, until, createRef, ref, nothing } from 'da-lit';

const nx = `${new URL(import.meta.url).origin}/nx`;

const ICONS = [
  '/nx/img/icons/S2IconClose20N-icon.svg',
  '/nx/img/icons/S2IconAdd20N-icon.svg',
];

// Cache for block details
const blockDetailCache = new Map();

// Global request tracking
let requestId = 0;
const pendingRequests = new Map();

// Send a request to quick-edit-portal and wait for response
function sendRequest(port, type, payload) {
  return new Promise((resolve, reject) => {
    if (!port) {
      reject(new Error('Message port not initialized'));
      return;
    }

    const id = `block-library-${requestId++}`;
    pendingRequests.set(id, { resolve, reject });

    port.postMessage({
      type: 'block-library-request',
      requestType: type,
      payload,
      requestId: id,
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error('Request timeout'));
      }
    }, 10000);
  });
}

// Handle responses from quick-edit-portal
export function handleBlockLibraryResponse(data) {
  const { requestId, data: responseData, error } = data;
  
  if (pendingRequests.has(requestId)) {
    const { resolve, reject } = pendingRequests.get(requestId);
    pendingRequests.delete(requestId);
    
    if (error) {
      reject(new Error(error));
    } else {
      resolve(responseData);
    }
  }
}

// Helper to fetch block variants via postMessage
async function getBlockVariants(port, path) {
  try {
    return await sendRequest(port, 'get-block-variants', { path });
  } catch (e) {
    console.error('Error fetching block variants:', e);
    return [];
  }
}

// Helper to fetch blocks list via postMessage
async function getBlocks(port, sources) {
  try {
    return await sendRequest(port, 'get-blocks', { sources });
  } catch (error) {
    console.error('Error fetching blocks:', error);
    return [];
  }
}

class QuickEditLibrary extends LitElement {
  static properties = {
    _blocks: { state: true },
    _searchStr: { state: true },
    _selectedBlock: { state: true },
    config: { state: true },
    messagePort: { type: Object },
  };

  constructor() {
    super();
    this._blocks = [];
    this._searchStr = '';
    this._selectedBlock = null;
    this.config = null;
    this.messagePort = null;
  }

  searchInputRef = createRef();

  async connectedCallback() {
    this.style.display = 'none';
    super.connectedCallback();
    this.loadStyles();
    this.loadBlocks();
    window.addEventListener('keydown', this.handleKeydown.bind(this));
    
    // Make the library draggable after the component renders
    requestAnimationFrame(() => {
      this.makeDraggable();
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('keydown', this.handleKeydown.bind(this));
  }

  async loadStyles() {
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = `${nx}/public/plugins/quick-edit/src/advanced/quick-edit-library.css`;
    this.shadowRoot.appendChild(style);
    style.onload = () => { this.style.display = 'block'; }
  }

  async loadBlocks() {
    const url = this.config?.library?.data?.find((item) => item.title.toLowerCase() === 'blocks')?.path;
    console.log('url', url);
    if (!url) return;
    this._blocks = await getBlocks(this.messagePort, [url]);
  }

  handleKeydown(e) {
    if (e.key === 'Escape') {
      this.close();
    }
  }

  handleSearch({ target }) {
    this._searchStr = target.value.toLowerCase();
  }

  handleSearchInputKeydown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const firstButton = this.shadowRoot.querySelector('.qe-library-block-item button');
      firstButton?.focus();
    }
  }

  handleBlockClick(block) {
    if (this._selectedBlock === block.name) {
      this._selectedBlock = null;
    } else {
      this._selectedBlock = block.name;
    }
  }

  handleVariantClick(variant) {
    // Dispatch event to insert the block
    this.dispatchEvent(new CustomEvent('insert-block', {
      detail: { html: variant.html },
      bubbles: true,
      composed: true,
    }));
  }

  handleDragStart(e, variant) {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/html', variant.html);
    e.dataTransfer.setData('text/plain', variant.name);
    
    // Notify the page that dragging has started
    this.dispatchEvent(new CustomEvent('block-drag-start', {
      detail: { html: variant.html, name: variant.name },
      bubbles: true,
      composed: true,
    }));
  }

  handleDragEnd(e) {
    // Notify the page that dragging has ended
    this.dispatchEvent(new CustomEvent('block-drag-end', {
      bubbles: true,
      composed: true,
    }));
  }

  close() {
    this.dispatchEvent(new CustomEvent('close', {
      bubbles: true,
      composed: true,
    }));
  }

  makeDraggable() {
    const handle = this.shadowRoot.querySelector('.qe-library-header');
    if (!handle) return;

    let pos1 = 0;
    let pos2 = 0;
    let pos3 = 0;
    let pos4 = 0;

    const closeDragElement = () => {
      document.onmouseup = null;
      document.onmousemove = null;
      handle.style.cursor = 'grab';
    };

    const elementDrag = (e) => {
      e.preventDefault();
      
      // Calculate new position
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      
      // Set the host element's new position
      this.style.top = `${this.offsetTop - pos2}px`;
      this.style.left = `${this.offsetLeft - pos1}px`;
      this.style.right = 'auto';
    };

    const dragMouseDown = (e) => {
      // Only drag if clicking on the header itself, not the close button
      if (e.target.closest('.qe-library-close')) return;
      
      e.preventDefault();
      // Get mouse position at startup
      pos3 = e.clientX;
      pos4 = e.clientY;
      handle.style.cursor = 'grabbing';
      
      // Add event listeners for mouse movement and release
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    };

    handle.onmousedown = dragMouseDown;
  }

  async renderBlockVariants(path) {
    if (!blockDetailCache.has(path)) {
      blockDetailCache.set(path, await getBlockVariants(this.messagePort, path));
    }
    const variants = blockDetailCache.get(path);
    
    if (variants.length === 0) {
      return html`<div class="qe-library-no-variants">No variants found</div>`;
    }
    
    return html`
      <ul class="qe-library-variant-list">
        ${variants.map((variant) => html`
          <li class="qe-library-variant-item">
            <div 
              class="qe-library-variant-drag"
              draggable="true"
              @dragstart=${(e) => this.handleDragStart(e, variant)}
              @dragend=${(e) => this.handleDragEnd(e)}
              @click=${() => this.handleVariantClick(variant)}>
              <span class="qe-library-variant-name">${variant.name}</span>
              ${variant.variants ? html`<span class="qe-library-variant-subtitle">${variant.variants}</span>` : nothing}
            </div>
          </li>
        `)}
      </ul>
    `;
  }

  renderBlock(block) {
    const isOpen = this._selectedBlock === block.name;
    
    return html`
      <li class="qe-library-block-item ${isOpen ? 'is-open' : ''}">
        <div class="qe-library-block-header">
          <button @click=${() => this.handleBlockClick(block)}>
            <span class="qe-library-block-name">${block.name}</span>
            <svg class="icon icon-chevron">
              <use href="#icon-chevron"/>
            </svg>
          </button>
        </div>
        ${isOpen ? html`
          <div class="qe-library-block-variants">
            ${until(this.renderBlockVariants(block.path), html`<div class="loading">Loading...</div>`)}
          </div>
        ` : nothing}
      </li>
    `;
  }

  getFilteredBlocks() {
    if (!this._searchStr) return this._blocks;
    
    return this._blocks.filter((block) => 
      block.name.toLowerCase().includes(this._searchStr)
    );
  }

  renderBlocks() {
    const blocks = this.getFilteredBlocks();
    
    if (blocks.length === 0) {
      return html`<div class="qe-library-empty">No blocks found</div>`;
    }
    
    return html`
      <ul class="qe-library-block-list">
        ${blocks.map((block) => this.renderBlock(block))}
      </ul>
    `;
  }

  render() {
    return html`
      <div class="qe-library-container">
        <div class="qe-library-header">
          <h2>Block Library</h2>
          <button class="qe-library-close" @click=${this.close}>
            <svg class="icon icon-close">
              <use href="#icon-close"/>
            </svg>
          </button>
        </div>
        
        <div class="qe-library-search">
          <input
            ${ref(this.searchInputRef)}
            class="qe-library-search-input"
            type="text"
            placeholder="Search blocks..."
            @input=${this.handleSearch}
            @keydown=${this.handleSearchInputKeydown}
          />
        </div>
        
        <div class="qe-library-content">
          ${this.renderBlocks()}
        </div>
      </div>
      
      <!-- Inline SVG icons -->
      <svg style="display: none;">
        <defs>
          <symbol id="icon-close" viewBox="0 0 20 20">
            <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </symbol>
          <symbol id="icon-add" viewBox="0 0 20 20">
            <circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="1.5" fill="none"/>
            <path d="M10 6v8M6 10h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </symbol>
          <symbol id="icon-chevron" viewBox="0 0 20 20">
            <path d="M7 6l4 4-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          </symbol>
          <symbol id="icon-drag" viewBox="0 0 20 20">
            <path d="M4 6h12M4 10h12M4 14h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </symbol>
        </defs>
      </svg>
    `;
  }
}

customElements.define('quick-edit-library', QuickEditLibrary);

export default QuickEditLibrary;
