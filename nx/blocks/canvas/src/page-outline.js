/**
 * Page outline: shows block structure of the currently selected page.
 * Driven by editor-provided AEM HTML (prose2aem output); parses main > section > block.
 * Only active when a page (e.g. .html) is selected.
 */
// eslint-disable-next-line import/no-unresolved
import getStyle from 'https://da.live/nx/utils/styles.js';
// eslint-disable-next-line import/no-unresolved
import { LitElement, html } from 'da-lit';

const style = await getStyle(import.meta.url);

/**
 * True if the selected path represents a page we can load for outline (e.g. .html).
 * @param {string} selectedPath - e.g. org/repo/path/to/page.html
 * @returns {boolean}
 */
function isPagePath(selectedPath) {
  if (!selectedPath || typeof selectedPath !== 'string') return false;
  const trimmed = selectedPath.trim();
  if (!trimmed) return false;
  const segments = trimmed.split('/').filter(Boolean);
  if (segments.length < 2) return false;
  const last = segments[segments.length - 1];
  return last.toLowerCase().endsWith('.html') || last === 'index' || !last.includes('.');
}

/**
 * Parse HTML string and return list of { sectionIndex, blockName }.
 * Plain HTML structure: container (main or body) has direct div children = sections.
 * Each section has direct div children with a class = block (e.g. hero, card, section-metadata).
 * @param {string} htmlText
 * @returns {{ sectionIndex: number, blockName: string }[]}
 */
function parseBlockStructure(htmlText) {
  const blocks = [];
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');
    const container = doc.querySelector('main') || doc.body;
    if (!container) return blocks;

    const sections = container.querySelectorAll(':scope > div');
    sections.forEach((section, sectionIndex) => {
      let hasBlock = false;
      section.querySelectorAll(':scope > div[class]').forEach((blockEl) => {
        const blockName = blockEl.classList[0];
        if (blockName && blockName !== 'default-content-wrapper') {
          blocks.push({ sectionIndex, blockName });
          hasBlock = true;
        }
      });
      if (!hasBlock) {
        blocks.push({ sectionIndex, blockName: null });
      }
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[page-outline] parseBlockStructure failed', e?.message);
  }
  return blocks;
}

export default class PageOutline extends LitElement {
  static properties = {
    selectedPath: { type: String },
    org: { type: String },
    repo: { type: String },
    plainHtml: { type: String },
    blockPositions: { type: Array },
    activeBlockIndex: { type: Number },
    _blocks: { state: true },
    _dragOverIndex: { state: true },
  };

  constructor() {
    super();
    this.selectedPath = '';
    this.org = '';
    this.repo = '';
    this.plainHtml = '';
    this.blockPositions = [];
    this.activeBlockIndex = -1;
    this._blocks = [];
    this._dragOverIndex = -1;
    this._draggedFlatIndex = -1;
  }

  get _isPage() {
    return isPagePath(this.selectedPath);
  }

  /** Flat list { sectionIndex, blockName, flatIndex } for drag/drop. */
  get _flatBlocks() {
    const flat = [];
    this._sectionsWithBlocks.forEach((sec) => {
      sec.blocks.forEach((blockName) => {
        flat.push({
          sectionIndex: sec.sectionIndex,
          blockName,
          flatIndex: flat.length,
        });
      });
    });
    return flat;
  }

  updated(changed) {
    super.updated?.(changed);
    if (changed.has('plainHtml')) {
      this._blocks = this.plainHtml?.trim()
        ? parseBlockStructure(this.plainHtml)
        : [];
      this.requestUpdate();
    }
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  _onDragStart(e, flatIndex) {
    this._draggedFlatIndex = flatIndex;
    e.dataTransfer.setData('text/plain', String(flatIndex));
    e.dataTransfer.effectAllowed = 'move';
    if (e.target instanceof HTMLElement) {
      e.target.closest('.page-outline-block')?.classList.add('page-outline-block-dragging');
    }
  }

  _onDragEnd(e) {
    this._draggedFlatIndex = -1;
    this._dragOverIndex = -1;
    if (e.target instanceof HTMLElement) {
      e.target.closest('.page-outline-block')?.classList.remove('page-outline-block-dragging');
    }
    this.requestUpdate();
  }

  _onDragOver(e, flatIndex) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (this._draggedFlatIndex >= 0 && flatIndex !== this._draggedFlatIndex) {
      this._dragOverIndex = flatIndex;
      this.requestUpdate();
    }
  }

  _onDragLeave() {
    this._dragOverIndex = -1;
    this.requestUpdate();
  }

  _onDrop(e, dropFlatIndex) {
    e.preventDefault();
    this._dragOverIndex = -1;
    const fromFlat = this._draggedFlatIndex;
    if (fromFlat < 0 || fromFlat === dropFlatIndex) return;
    const positions = this.blockPositions ?? [];
    if (fromFlat >= positions.length || dropFlatIndex >= positions.length) return;
    const fromIndex = positions[fromFlat];
    const toIndex = positions[dropFlatIndex];
    if (typeof fromIndex !== 'number' || typeof toIndex !== 'number') return;
    this.dispatchEvent(new CustomEvent('da-outline-move-block', {
      bubbles: true,
      composed: true,
      detail: { fromIndex, toIndex },
    }));
    this._draggedFlatIndex = -1;
    this.requestUpdate();
  }

  _onAddSectionAtEnd() {
    const sections = this._sectionsWithBlocks;
    const sectionIndex = sections.length > 0
      ? sections[sections.length - 1].sectionIndex
      : 0;
    this.dispatchEvent(new CustomEvent('da-outline-add-section', {
      bubbles: true,
      composed: true,
      detail: { sectionIndex },
    }));
  }

  render() {
    if (!this.org || !this.repo) {
      return html`
        <div class="page-outline">
          <div class="page-outline-placeholder">
            Set hash to <code>#/org/site</code> to see outline.
          </div>
        </div>
      `;
    }

    if (!this._isPage) {
      return html`
        <div class="page-outline">
          <div class="page-outline-placeholder">
            Select a page (e.g. a .html file) to view its block outline.
          </div>
        </div>
      `;
    }

    const sections = this._sectionsWithBlocks;
    const flatBlocks = this._flatBlocks;
    const positionsLength = this.blockPositions?.length ?? 0;
    const canReorder = flatBlocks.length > 0 && positionsLength === flatBlocks.length;
    const showHandles = flatBlocks.length > 0;
    let flatIndexCounter = 0;

    return html`
<div class="page-outline">
  <div class="page-outline-header">
    <span class="page-outline-header-label">Page outline</span>
    <button
      type="button"
      class="page-outline-header-btn"
      title="Insert section"
      aria-label="Insert section at end"
      @click="${this._onAddSectionAtEnd}"
    ></button>
  </div>
  <div class="page-outline-list-wrap">
    ${sections.length === 0
    ? html`<div class="page-outline-placeholder">No blocks found.</div>`
    : html`
<ul class="page-outline-list" role="tree" aria-label="Page outline">
  ${sections.map((sec) => html`
<li class="page-outline-section" role="treeitem" aria-expanded="true">
  <span class="page-outline-section-label">Section ${sec.sectionIndex + 1}</span>
  <ul class="page-outline-block-list" role="group">
    ${sec.blocks.length === 0 ? html`
<li class="page-outline-block page-outline-block-empty" role="treeitem">
  <span class="page-outline-block-name page-outline-empty-label">No blocks</span>
</li>` : sec.blocks.map((blockName) => {
    const flatIndex = flatIndexCounter;
    flatIndexCounter += 1;
    const isDropTarget = canReorder && this._dragOverIndex === flatIndex;
    const isActive = this.activeBlockIndex === flatIndex;
    return html`
<li class="page-outline-block ${isDropTarget ? 'page-outline-block-drop-target' : ''} ${isActive ? 'page-outline-block-active' : ''}"
  role="treeitem"
  draggable="${canReorder}"
  @dragstart="${(ev) => this._onDragStart(ev, flatIndex)}"
  @dragend="${this._onDragEnd}"
  @dragover="${(ev) => this._onDragOver(ev, flatIndex)}"
  @dragleave="${this._onDragLeave}"
  @drop="${(ev) => this._onDrop(ev, flatIndex)}"
>
  ${showHandles ? html`
  <span class="page-outline-block-handle" aria-label="${canReorder ? 'Drag to reorder' : 'Reorder not available'}">
    <sp-icon-double-gripper size="s" class="page-outline-grip"></sp-icon-double-gripper>
  </span>
  ` : ''}
  <span class="page-outline-block-name">${blockName}</span>
</li>
    `;
  })}
  </ul>
</li>
  `)}
</ul>
      `}
  </div>
</div>
    `;
  }

  get _sectionsWithBlocks() {
    const bySection = new Map();
    this._blocks.forEach((entry) => {
      if (!bySection.has(entry.sectionIndex)) {
        bySection.set(entry.sectionIndex, []);
      }
      if (entry.blockName !== null) {
        bySection.get(entry.sectionIndex).push(entry.blockName);
      }
    });
    return Array.from(bySection.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([sectionIndex, blocks]) => ({ sectionIndex, blocks }));
  }
}

customElements.define('da-page-outline', PageOutline);
