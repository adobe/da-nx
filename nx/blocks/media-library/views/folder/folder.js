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

  // Build hierarchy when mediaData is set
  set mediaData(value) {
    if (value && value !== this._mediaData) {
      this._mediaData = value;
      this._hierarchyBuilt = false; // Reset hierarchy flag
      if (this.isOpen) {
        this.buildFolderHierarchy();
      }
    }
  }

  get mediaData() {
    return this._mediaData;
  }

  // Sync with current filter paths when dialog opens
  set currentFilterPaths(value) {
    if (value && Array.isArray(value)) {
      this._selectedPaths = new Set(value);
      // Expand to show selected paths
      this.expandToSelectedPaths();
    }
  }

  get currentFilterPaths() {
    return Array.from(this._selectedPaths);
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
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
    if (!this.mediaData || this._hierarchyBuilt) {
      return;
    }

    this._folderHierarchy = buildCompleteFolderHierarchy(this.mediaData);
    this._hierarchyBuilt = true;

    // Force re-render after building hierarchy
    this.requestUpdate();
  }

  expandToPath(path) {
    const pathParts = path.split('/').filter(Boolean);

    // Expand all parent folders to make the path visible
    for (let i = 0; i < pathParts.length - 1; i += 1) {
      const parentPath = pathParts.slice(0, i + 1).join('/');
      this._expandedFolders.add(parentPath);
    }

    this.requestUpdate();
  }

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

  handleItemClick(e) {
    const item = e.currentTarget;
    const { path } = item.dataset;
    const hierarchyItem = this.findItemByPath(this.hierarchyData, path);

    if (!hierarchyItem) return;

    const isFile = hierarchyItem.type === 'file';
    const hasChildren = hierarchyItem.children && hierarchyItem.children.size > 0;

    if (isFile) {
      // For files, toggle selection and auto-refresh grid
      this.togglePathSelection(path);
    } else if (hasChildren) {
      // For folders with subfolders, toggle expansion
      this.toggleFolderExpansion(hierarchyItem);
    } else {
      // For folders with files (but no subfolders), select and auto-refresh
      this.togglePathSelection(path);
    }
  }

  handleCheckboxClick(e) {
    e.stopPropagation(); // Prevent triggering handleItemClick
    const { path } = e.currentTarget.dataset;
    const hierarchyItem = this.findItemByPath(this.hierarchyData, path);

    if (!hierarchyItem) return;

    const isFile = hierarchyItem.type === 'file';
    const hasChildren = hierarchyItem.children && hierarchyItem.children.size > 0;

    if (isFile) {
      // For files, toggle selection
      this.togglePathSelection(path);
    } else if (hasChildren) {
      // For folders, select/deselect all children
      this.toggleFolderSelection(hierarchyItem);
    } else {
      // For folders with files, toggle selection
      this.togglePathSelection(path);
    }
  }

  togglePathSelection(path) {
    const newSelectedPaths = new Set(this._selectedPaths);

    if (newSelectedPaths.has(path)) {
      newSelectedPaths.delete(path);
    } else {
      newSelectedPaths.add(path);
    }

    this._selectedPaths = newSelectedPaths;
    this.dispatchFilterChange();
  }

  toggleFolderExpansion(folder) {
    const newExpandedState = !folder.isExpanded;

    if (newExpandedState) {
      this._expandedFolders.add(folder.path);
    } else {
      this._expandedFolders.delete(folder.path);
    }

    this.requestUpdate();
  }

  toggleFolderSelection(folder) {
    // Get all file paths in this folder and its subfolders
    const allFilePaths = this.getAllFilePathsInFolder(folder);

    const isAllSelected = allFilePaths.every((path) => this._selectedPaths.has(path));

    if (isAllSelected) {
      // Deselect all files in folder
      allFilePaths.forEach((path) => this._selectedPaths.delete(path));
    } else {
      // Select all files in folder
      allFilePaths.forEach((path) => this._selectedPaths.add(path));
    }

    this.dispatchFilterChange();
  }

  getAllFilePathsInFolder(folder) {
    const filePaths = [];

    if (folder.type === 'file') {
      filePaths.push(folder.path);
    } else if (folder.children) {
      folder.children.forEach((childPath) => {
        const child = this._folderHierarchy.get(childPath);
        if (child) {
          filePaths.push(...this.getAllFilePathsInFolder(child));
        }
      });
    }

    return filePaths;
  }

  dispatchFilterChange() {
    this.dispatchEvent(new CustomEvent('filterChange', { detail: { paths: Array.from(this.selectedPaths) } }));
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
          .map((childPath) => this._folderHierarchy.get(childPath))
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

  handleClearAll() {
    this._selectedPaths = new Set();
    this.dispatchFilterChange();
  }

  getSelectionSummary() {
    if (this._selectedPaths.size === 0) return null;

    const selectedItems = Array.from(this._selectedPaths).map((path) => {
      // Normalize path for lookup (remove leading slash)
      const normalizedPath = path.startsWith('/') ? path.substring(1) : path;
      const item = this._folderHierarchy.get(normalizedPath);

      return {
        path,
        name: item?.name || getDisplayName(path),
        count: item?.count || 0,
      };
    });

    const totalCount = selectedItems.reduce((sum, item) => sum + item.count, 0);

    return {
      count: this._selectedPaths.size,
      totalMedia: totalCount,
      items: selectedItems,
    };
  }

  render() {
    if (!this.isOpen) return html``;

    const selectionSummary = this.getSelectionSummary();

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
                  <p>No pages found.</p>
                </div>
              ` : html`
                <div class="hierarchy-list">
                  ${this.renderHierarchyItems(this.hierarchyData, 0)}
                </div>
              `}
            </div>
          </div>

          ${selectionSummary ? html`
            <div class="dialog-footer">
              <div class="selection-summary">
                <div class="summary-header">
                  <span class="summary-count">Active: ${selectionSummary.count} pages (${selectionSummary.totalMedia} media)</span>
                  <sl-button type="button" size="small" class="secondary" @click=${this.handleClearAll}>
                    Clear All
                  </sl-button>
                </div>
                <div class="selected-items">
                  ${selectionSummary.items.map((item) => html`
                    <div class="selected-item">
                      <span class="selected-item-name">${item.name}</span>
                      <span class="selected-item-count">(${item.count})</span>
                    </div>
                  `)}
                </div>
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  renderHierarchyItems(items, level = 0) {
    return items.map((item) => {
      // Normalize paths for comparison (remove leading slash)
      const normalizedItemPath = item.path.startsWith('/') ? item.path.substring(1) : item.path;
      const isSelected = Array.from(this._selectedPaths).some((selectedPath) => {
        const normalizedSelectedPath = selectedPath.startsWith('/') ? selectedPath.substring(1) : selectedPath;
        return normalizedItemPath === normalizedSelectedPath;
      });
      const hasChildren = item.children && item.children.size > 0;
      const isFolder = item.type === 'folder';

      return html`
        <div class="hierarchy-item-wrapper">
          <div 
            class="hierarchy-item ${isSelected ? 'selected' : ''} ${isFolder ? 'folder-item' : 'file-item'}"
            data-path="${item.path}"
            @click=${this.handleItemClick}
            style="padding-left: ${level * 16}px;"
          >
            <div class="item-checkbox">
              <input 
                type="checkbox" 
                .checked=${isSelected}
                @click=${this.handleCheckboxClick}
                data-path="${item.path}"
                class="checkbox-input"
              />
            </div>
            
            <div class="item-icon">
              ${isFolder ? html`
                <svg class="chevron-icon ${item.isExpanded ? 'expanded' : ''}">
                  <use href="#spectrum-chevronDown"></use>
                </svg>
              ` : ''}
            </div>
            
            <div class="item-name">
              ${item.name || ''}
            </div>
            
            <div class="item-count">${item.count}</div>
          </div>
          
          ${item.isExpanded && hasChildren ? html`
            <div class="folder-children expanded">
              ${(() => {
    const childPaths = Array.from(item.children.values());
    const childItems = childPaths
      .map((path) => {
        const found = this._folderHierarchy.get(path);
        return found ? {
          ...found,
          isExpanded: this._expandedFolders.has(found.path),
        } : null;
      })
      .filter(Boolean)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    return this.renderHierarchyItems(childItems, level + 1);
  })()}
            </div>
          ` : ''}
        </div>
      `;
    });
  }
}

customElements.define('nx-media-folder-dialog', NxMediaFolderDialog);
