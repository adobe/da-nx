import { LitElement, html } from 'da-lit';

const nx = `${new URL(import.meta.url).origin}/nx`;

class QuickEditSidebar extends LitElement {
  static properties = {
    _libraryOpen: { state: true },
    _outlineOpen: { state: true },
    config: { type: Object },
    messagePort: { type: Object },
  };

  constructor() {
    super();
    this._libraryOpen = false;
    this._outlineOpen = false;
    this.config = null;
    this.messagePort = null;
    this.library = null;
    this.outline = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.loadStyles();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.library) {
      this.library.remove();
      this.library = null;
    }
    if (this.outline) {
      this.outline.remove();
      this.outline = null;
    }
  }

  async loadStyles() {
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = `${nx}/public/plugins/quick-edit/src/advanced/sidebar.css`;
    this.shadowRoot.appendChild(style);
  }

  handleToggleLibrary() {
    this._libraryOpen = !this._libraryOpen;
    
    if (this._libraryOpen) {
      this.createLibrary();
    } else {
      this.removeLibrary();
    }
  }

  createLibrary() {
    if (this.library) return;

    this.library = document.createElement('quick-edit-library');
    
    // Handle block drag start - bubble up to parent
    this.library.addEventListener('block-drag-start', (e) => {
      this.dispatchEvent(new CustomEvent('block-drag-start', {
        detail: e.detail,
        bubbles: true,
        composed: true,
      }));
    });

    // Handle block drag end - bubble up to parent
    this.library.addEventListener('block-drag-end', (e) => {
      this.dispatchEvent(new CustomEvent('block-drag-end', {
        detail: e.detail,
        bubbles: true,
        composed: true,
      }));
    });

    // Handle block insertion - bubble up to parent
    this.library.addEventListener('insert-block', (e) => {
      this.dispatchEvent(new CustomEvent('insert-block', {
        detail: e.detail,
        bubbles: true,
        composed: true,
      }));
    });
    
    // Handle library close
    this.library.addEventListener('close', () => {
      this.removeLibrary();
      this._libraryOpen = false;
    });

    // Set properties on the component
    this.library.config = this.config;
    this.library.messagePort = this.messagePort;
    
    document.body.appendChild(this.library);
  }

  removeLibrary() {
    if (this.library) {
      this.library.remove();
      this.library = null;
    }
  }

  handleToggleOutline() {
    this._outlineOpen = !this._outlineOpen;
    
    if (this._outlineOpen) {
      this.createOutline();
    } else {
      this.removeOutline();
    }
  }

  createOutline() {
    if (this.outline) return;

    this.outline = document.createElement('quick-edit-outline');
    this.outline.messagePort = this.messagePort;
    
    // Handle outline close
    this.outline.addEventListener('close', () => {
      this.removeOutline();
      this._outlineOpen = false;
    });
    
    document.body.appendChild(this.outline);
  }

  removeOutline() {
    if (this.outline) {
      this.outline.remove();
      this.outline = null;
    }
  }

  render() {
    return html`
      <div class="qe-sidebar">
        <button 
          class="qe-sidebar-button ${this._libraryOpen ? 'active' : ''}"
          @click=${this.handleToggleLibrary}
          title="${this._libraryOpen ? 'Close Library' : 'Open Library'}">
          <svg class="icon" viewBox="0 0 24 24">
            <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="2" fill="none"/>
            <rect x="3" y="13" width="7" height="7" rx="1" stroke="currentColor" stroke-width="2" fill="none"/>
            <rect x="13" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="2" fill="none"/>
            <rect x="13" y="13" width="7" height="7" rx="1" stroke="currentColor" stroke-width="2" fill="none"/>
          </svg>
        </button>
        <button 
          class="qe-sidebar-button ${this._outlineOpen ? 'active' : ''}"
          @click=${this.handleToggleOutline}
          title="${this._outlineOpen ? 'Close Outline' : 'Open Outline'}">
          <svg class="icon" viewBox="0 0 24 24">
            <line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <line x1="3" y1="18" x2="21" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    `;
  }
}

customElements.define('quick-edit-sidebar', QuickEditSidebar);

export default QuickEditSidebar;
