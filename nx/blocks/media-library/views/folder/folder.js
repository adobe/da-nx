import { html, LitElement } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import getSvg from '../../../../public/utils/svg.js';
import { getDisplayName } from '../../utils/utils.js';
import { buildCompleteFolderHierarchy } from '../../utils/folder-utils.js';

const styles = await getStyle(import.meta.url);
const nx = `${new URL(import.meta.url).origin}/nx`;
const ICONS = [
  `${nx}/public/icons/S2_Icon_Close_20_N.svg`,
  `${nx}/public/icons/Smock_ChevronDown_18_N.svg`,
];

class NxMediaFolderDialog extends LitElement {
  static properties = {
    isOpen: { attribute: false },
    selectedPaths: { attribute: false },
    mediaData: { attribute: false },
  };

  constructor() {
    super();
    this.isOpen = false;
    this._selectedPaths = new Set();
    this._expandedFolders = new Set();
    this._folderHierarchy = new Map();
    this._hierarchyBuilt = false;
  }

  // Ensure selectedPaths is always a Set
  set selectedPaths(value) {
    if (value instanceof Set) {
      this._selectedPaths = value;
    } else if (Array.isArray(value)) {
      this._selectedPaths = new Set(value);
    } else {
      this._selectedPaths = new Set();
    }
  }

  get selectedPaths() {
    return this._selectedPaths;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];

    getSvg({ parent: this.shadowRoot, paths: ICONS });

    // Listen for navigation events
    this.addEventListener('navigateToPath', this.handleNavigateToPath);
  }

  updated(changedProperties) {
    super.updated(changedProperties);

    // Build folder hierarchy when dialog opens and mediaData is available
    if (changedProperties.has('isOpen') && this.isOpen && this.mediaData && !this._hierarchyBuilt) {
      this.buildFolderHierarchy();
    }

    // Auto-expand to show selected paths when they change or when dialog opens
    if ((changedProperties.has('selectedPaths') && this.selectedPaths.size > 0)
        || (changedProperties.has('isOpen') && this.isOpen && this.selectedPaths.size > 0)) {
      this.expandToSelectedPaths();
    }
  }

  buildFolderHierarchy() {
    if (!this.mediaData || this._hierarchyBuilt) return;

    this._folderHierarchy = buildCompleteFolderHierarchy(this.mediaData);
    this._hierarchyBuilt = true;
  }

  // NEW METHOD
  handleNavigateToPath(e) {
    const { path } = e.detail;
    if (!path) return;

    // Find the item in hierarchy
    const item = this.findItemByPath(this.hierarchyData, path);
    if (!item) return;

    // Select the path
    this._selectedPaths = new Set([path]);

    // Expand parent folders to show this item
    this.expandToPath(path);

    // Dispatch filter change
    this.dispatchEvent(new CustomEvent('filterChange', { detail: { paths: Array.from(this.selectedPaths) } }));
  }

  // NEW METHOD
  expandToPath(path) {
    const pathParts = path.split('/').filter(Boolean);

    // Expand all parent folders to make the path visible
    for (let i = 0; i < pathParts.length - 1; i += 1) {
      const parentPath = pathParts.slice(0, i + 1).join('/');
      this._expandedFolders.add(parentPath);
    }

    this.requestUpdate();
  }

  // NEW METHOD
  expandToSelectedPaths() {
    // Expand to show all selected paths
    this.selectedPaths.forEach((path) => {
      this.expandToPath(path);
    });
  }

  get hierarchyData() {
    if (!this._folderHierarchy || this._folderHierarchy.size === 0) {
      return [];
    }

    // Build hierarchical structure - only show root level items
    const rootItems = [];

    this._folderHierarchy.forEach((folder) => {
      // Only add items that don't have a parent (root level)
      if (!folder.parent) {
        const itemWithExpansion = {
          ...folder,
          isExpanded: this._expandedFolders.has(folder.path),
        };
        rootItems.push(itemWithExpansion);
      }
    });

    // Sort alphabetically
    rootItems.sort((a, b) => {
      const aName = a.name || '';
      const bName = b.name || '';
      return aName.localeCompare(bName);
    });

    return rootItems;
  }

  findParent(tree, childPath) {
    const pathParts = childPath.split('/');
    if (pathParts.length <= 1) return tree;

    let current = tree;
    for (let i = 0; i < pathParts.length - 1; i += 1) {
      if (current.children.has(pathParts[i])) {
        current = current.children.get(pathParts[i]);
      } else {
        return tree;
      }
    }
    return current;
  }

  get filteredHierarchy() {
    // Remove search filtering - just return all items
    return this.hierarchyData;
  }

  handleItemClick(e) {
    const item = e.currentTarget;
    const { path } = item.dataset;

    const hierarchyItem = this.findItemByPath(this.hierarchyData, path);

    // Check if it's a file or folder
    const isFile = hierarchyItem && hierarchyItem.type === 'file';
    const hasChildren = hierarchyItem && hierarchyItem.children && hierarchyItem.children.size > 0;
    const hasFiles = hierarchyItem && hierarchyItem.hasFiles;

    if (isFile) {
      // For files, select and close the dialog
      const newSelectedPaths = new Set(this._selectedPaths);
      if (newSelectedPaths.has(path)) {
        newSelectedPaths.delete(path);
      } else {
        newSelectedPaths.add(path);
      }
      this._selectedPaths = newSelectedPaths;
      this.dispatchEvent(new CustomEvent('filterChange', { detail: { paths: Array.from(this.selectedPaths) } }));
      this.handleClose();
    } else if (hasChildren) {
      // For folders with subfolders, toggle expansion
      const newExpandedState = !hierarchyItem.isExpanded;

      if (newExpandedState) {
        this._expandedFolders.add(hierarchyItem.path);
      } else {
        this._expandedFolders.delete(hierarchyItem.path);
      }

      this.requestUpdate();
    } else if (hasFiles) {
      // For folders with files (but no subfolders), select and close the dialog
      const newSelectedPaths = new Set(this._selectedPaths);
      if (newSelectedPaths.has(path)) {
        newSelectedPaths.delete(path);
      } else {
        newSelectedPaths.add(path);
      }
      this._selectedPaths = newSelectedPaths;
      this.dispatchEvent(new CustomEvent('filterChange', { detail: { paths: Array.from(this.selectedPaths) } }));
      this.handleClose();
    } else {
      // For truly empty folders, select and close the dialog
      const newSelectedPaths = new Set(this._selectedPaths);
      if (newSelectedPaths.has(path)) {
        newSelectedPaths.delete(path);
      } else {
        newSelectedPaths.add(path);
      }
      this._selectedPaths = newSelectedPaths;
      this.dispatchEvent(new CustomEvent('filterChange', { detail: { paths: Array.from(this.selectedPaths) } }));
      this.handleClose();
    }
  }

  findItemByPath(items, path) {
    for (const item of items) {
      if (item.path === path) {
        return item;
      }
    }

    // Search in children if they exist
    for (const item of items) {
      if (item.children && item.children.size > 0) {
        const childPaths = Array.from(item.children.values());
        const childItems = childPaths
          .map((childPath) => this.folderHierarchy.get(childPath))
          .filter(Boolean);
        const found = this.findItemByPath(childItems, path);
        if (found) {
          return found;
        }
      }
    }

    return null;
  }

  handleClose() {
    this.isOpen = false;
    this.dispatchEvent(new CustomEvent('close'));
  }

  handleApply() {
    this.dispatchEvent(new CustomEvent('apply', { detail: { paths: Array.from(this.selectedPaths) } }));
    this.handleClose();
  }

  handleClear() {
    this._selectedPaths = new Set();
    this.dispatchEvent(new CustomEvent('filterChange', { detail: { paths: [] } }));
  }

  handleClearPath(path) {
    const newSelectedPaths = new Set(this._selectedPaths);
    newSelectedPaths.delete(path);
    this._selectedPaths = newSelectedPaths;
    this.dispatchEvent(new CustomEvent('filterChange', { detail: { paths: Array.from(this._selectedPaths) } }));
  }

  // Cache no longer needed - using pre-calculated hierarchy

  // Folder counts are now pre-calculated in media-library

  render() {
    if (!this.isOpen) return html``;

    return html`
      <div class="dialog-overlay" @click=${this.handleClose}>
        <div class="dialog-content" @click=${(e) => e.stopPropagation()}>
          <div class="dialog-header">
            <h2>Filter by Folder Structure</h2>
            <div class="header-actions">
              <sl-button type="button" size="small" class="primary outline" @click=${this.handleClose}>
                Close
              </sl-button>
            </div>
          </div>

          <div class="dialog-body">
            <div class="hierarchy-content">
              ${this.hierarchyData.length === 0 ? html`
                <div class="empty-state">
                  <p>No media files found.</p>
                </div>
              ` : html`
                <div class="hierarchy-list">
                  ${this.renderHierarchyItems(this.hierarchyData, 0)}
                </div>
              `}
            </div>
          </div>

          <div class="dialog-footer">
            ${this.selectedPaths.size > 0 ? html`
              <div class="selected-paths-container">
                <div class="selected-paths">
                  ${Array.from(this.selectedPaths).map((path) => html`
                    <div class="selected-path-item">
                      <span class="path-name">${getDisplayName(path)}</span>
                      <button 
                        class="clear-path-btn" 
                        @click=${() => this.handleClearPath(path)}
                        title="Remove ${getDisplayName(path)}"
                      >
                        <svg class="icon">
                          <use href="#S2_Icon_Close_20_N"></use>
                        </svg>
                      </button>
                    </div>
                  `)}
                </div>
                <div class="clear-all-row">
                  <sl-button type="button" size="small" class="secondary" @click=${this.handleClear}>
                    Clear All
                  </sl-button>
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }

  renderHierarchyItems(items, level = 0) {
    return items.map((item) => {
      // Check if this item is selected by comparing with path
      const isSelected = Array.from(this.selectedPaths)
        .some((selectedPath) => selectedPath === item.path);
      return html`
      <div class="hierarchy-item-wrapper">
        <div 
          class="hierarchy-item ${isSelected ? 'selected' : ''} ${item.type === 'folder' ? 'folder-item' : 'file-item'}"
          data-path="${item.path}"
          @click=${this.handleItemClick}
          style="padding-left: ${level * 16}px; margin-left: 0;"
        >
          <div class="item-icon">
            ${item.type === 'folder' ? html`
              <div class="folder-icon-container">
                ${item.children && item.children.size > 0 ? html`
                  <svg class="expand-icon ${item.isExpanded ? 'expanded' : ''}">
                    <use href="#spectrum-chevronDown"></use>
                  </svg>
                ` : html`
                  <svg class="folder-icon">
                    <use href="#S2IconFolder20N-icon"></use>
                  </svg>
                `}
                ${item.hasFiles && (!item.children || item.children.size === 0) ? html`
                  <svg class="file-indicator" title="Contains files">
                    <use href="#S2IconFileConvert20N-icon"></use>
                  </svg>
                ` : ''}
              </div>
            ` : ''}
            ${item.type === 'file' ? html`
              <div class="file-icon-container">
                <svg class="file-icon">
                  <use href="#S2IconFileConvert20N-icon"></use>
                </svg>
              </div>
            ` : ''}
          </div>
          <div class="item-name">
            ${item.name || ''}
          </div>
          <div class="item-count">${item.count}</div>
        </div>
        
        ${item.isExpanded ? html`
          <div class="folder-children expanded">
            ${(() => {
    const allItems = [];

    if (item.children && item.children.size > 0) {
      const childPaths = Array.from(item.children.values());

      // Get all child items from the hierarchy
      const childItems = childPaths.map((path) => {
        const found = this._folderHierarchy.get(path);
        if (found) {
          // Ensure child items have the isExpanded property set
          return {
            ...found,
            isExpanded: this._expandedFolders.has(found.path),
          };
        }
        return found;
      }).filter(Boolean);

      allItems.push(...childItems);
    }

    allItems.sort((a, b) => {
      const aName = a.name || '';
      const bName = b.name || '';
      return aName.localeCompare(bName);
    });

    return this.renderHierarchyItems(allItems, level + 1);
  })()}
          </div>
        ` : ''}
      </div>
    `;
    });
  }
}

customElements.define('nx-media-folder-dialog', NxMediaFolderDialog);
