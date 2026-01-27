import { LitElement, html } from 'da-lit';

const style = await fetch(new URL('./quick-edit-outline.css', import.meta.url)).then(res => res.text());

export class QuickEditOutline extends LitElement {
  static properties = {
    _blocks: { state: true },
    messagePort: { type: Object },
  };

  constructor() {
    super();
    this._blocks = [];
    this.messagePort = null;
    this._draggedBlock = null;
    this.updateBlocks();
  }

  connectedCallback() {
    super.connectedCallback();
    this.makeDraggable();
    // Set up mutation observer to update when DOM changes
    this._observer = new MutationObserver(() => this.updateBlocks());
    this._observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-block-index'],
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._observer) {
      this._observer.disconnect();
    }
  }

  updateBlocks() {
    const blockElements = document.querySelectorAll('[data-block-index]');
    this._blocks = Array.from(blockElements).map((el) => {
      const blockType = this.getBlockType(el);
      const proseIndex = el.dataset.blockIndex;
      return { blockType, proseIndex, element: el };
    });
  }

  getBlockType(element) {
    // Try to find block type from class names
    const classes = Array.from(element.classList);
    
    // Look for common block patterns
    for (const className of classes) {
      // Skip utility classes
      if (className === 'tableWrapper' || className === 'block') {
        continue;
      }
      // Return the first meaningful class name
      if (className) {
        return className;
      }
    }

    // Fallback to element tag name
    return element.tagName.toLowerCase();
  }

  handleBlockClick(block) {
    // Scroll to the block
    block.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Highlight the block briefly
    block.element.style.outline = '2px solid #1473e6';
    setTimeout(() => {
      block.element.style.outline = '';
    }, 2000);
  }

  handleBlockDelete(block, e) {
    e.stopPropagation(); // Prevent triggering the scroll-to behavior
    if (confirm(`Delete block "${block.blockType}"?`)) {
      this.messagePort.postMessage({
        type: 'delete-block-at',
        proseIndex: parseInt(block.proseIndex, 10)
      });
    }
  }

  handleDragStart(block, e) {
    this._draggedBlock = block;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', block.blockType);
    e.currentTarget.style.opacity = '0.5';
  }

  handleDragEnd(e) {
    e.currentTarget.style.opacity = '1';
    this._draggedBlock = null;
  }

  handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    
    // Add the drag-over class to the current target
    const item = e.currentTarget;
    if (item.classList.contains('qe-outline-item') && !item.classList.contains('qe-outline-item-drag-over')) {
      item.classList.add('qe-outline-item-drag-over');
    }
  }

  handleDragEnter(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  handleDragLeave(e) {
    e.stopPropagation();
    const item = e.currentTarget;
    const relatedTarget = e.relatedTarget;
    
    // Only remove the class if we're actually leaving the item (not entering a child)
    if (item.classList.contains('qe-outline-item') && !item.contains(relatedTarget)) {
      item.classList.remove('qe-outline-item-drag-over');
    }
  }

  handleDrop(targetBlock, e) {
    e.preventDefault();
    e.stopPropagation();
    
    // Remove drag-over class from all items
    const allItems = this.shadowRoot.querySelectorAll('.qe-outline-item');
    allItems.forEach(item => item.classList.remove('qe-outline-item-drag-over'));

    if (!this._draggedBlock || this._draggedBlock === targetBlock) {
      return;
    }

    // Move the dragged block to before the target block
    this.messagePort.postMessage({
      type: 'move-block',
      fromIndex: parseInt(this._draggedBlock.proseIndex, 10),
      toIndex: parseInt(targetBlock.proseIndex, 10)
    });
  }

  handleClose() {
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  makeDraggable() {
    requestAnimationFrame(() => {
      const handle = this.shadowRoot.querySelector('.qe-outline-header');
      if (!handle) return;

      let pos1 = 0; let pos2 = 0; let pos3 = 0; let pos4 = 0;

      const closeDragElement = () => {
        document.onmouseup = null;
        document.onmousemove = null;
        handle.style.cursor = 'grab';
      };

      const elementDrag = (e) => {
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        this.style.top = `${this.offsetTop - pos2}px`;
        this.style.left = `${this.offsetLeft - pos1}px`;
        this.style.right = 'auto';
      };

      const dragMouseDown = (e) => {
        if (e.target.closest('.qe-outline-close')) return;
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        handle.style.cursor = 'grabbing';
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
      };

      handle.onmousedown = dragMouseDown;
    });
  }

  render() {
    return html`
      <style>${style}</style>
      <div class="qe-outline-container">
        <div class="qe-outline-header">
          <h3>Block Outline</h3>
          <button class="qe-outline-close" @click=${this.handleClose}>×</button>
        </div>
        <div class="qe-outline-content">
          ${this._blocks.length === 0
            ? html`<div class="qe-outline-empty">No blocks found</div>`
            : html`
              <ul class="qe-outline-list">
                ${this._blocks.map((block) => html`
                  <li 
                    class="qe-outline-item"
                    draggable="true"
                    @dragstart=${(e) => this.handleDragStart(block, e)}
                    @dragend=${(e) => this.handleDragEnd(e)}
                    @dragover=${(e) => this.handleDragOver(e)}
                    @dragenter=${(e) => this.handleDragEnter(e)}
                    @dragleave=${(e) => this.handleDragLeave(e)}
                    @drop=${(e) => this.handleDrop(block, e)}>
                    <div class="qe-outline-item-info" @click=${() => this.handleBlockClick(block)}>
                      <span class="qe-outline-block-type">${block.blockType}</span>
                    </div>
                    <button class="qe-outline-delete" @click=${(e) => this.handleBlockDelete(block, e)} title="Delete block">×</button>
                  </li>
                `)}
              </ul>
            `}
        </div>
      </div>
    `;
  }
}

customElements.define('quick-edit-outline', QuickEditOutline);
