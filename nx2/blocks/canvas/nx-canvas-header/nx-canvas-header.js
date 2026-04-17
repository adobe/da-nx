import { LitElement, html, nothing } from 'da-lit';

import { loadStyle } from '../../../utils/utils.js';
import { loadHrefSvg, ICONS_BASE } from '../../../utils/svg.js';

const style = await loadStyle(import.meta.url);

const ICONS = {
  undo: `${ICONS_BASE}S2_Icon_Undo_20_N.svg`,
  redo: `${ICONS_BASE}S2_Icon_Redo_20_N.svg`,
  splitLeft: `${ICONS_BASE}S2_Icon_SplitLeft_20_N.svg`,
  splitRight: `${ICONS_BASE}S2_Icon_SplitRight_20_N.svg`,
};

const EDITOR_VIEWS = /** @type {const} */ (['layout', 'content']);

class NXCanvasHeader extends LitElement {
  static properties = {
    _icons: { state: true },
    /** `'layout'` = doc editor (ProseMirror), `'content'` = WYSIWYG preview */
    editorView: { type: String, reflect: true },
    redoAvailable: { type: Boolean },
  };

  constructor() {
    super();
    this.editorView = 'layout';
    this.redoAvailable = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  async firstUpdated() {
    const entries = Object.entries(ICONS);
    const svgs = await Promise.all(entries.map(([, href]) => loadHrefSvg(href)));
    const icons = {};
    entries.forEach(([key], i) => { icons[key] = svgs[i]; });
    this._icons = icons;
  }

  _openPanel(position) {
    this.dispatchEvent(
      new CustomEvent('nx-canvas-open-panel', {
        bubbles: true,
        composed: true,
        detail: { position },
      }),
    );
  }

  _setEditorView(view) {
    if (!EDITOR_VIEWS.includes(view) || view === this.editorView) return;
    this.editorView = view;
    this.dispatchEvent(
      new CustomEvent('nx-canvas-editor-view', {
        bubbles: true,
        composed: true,
        detail: { view },
      }),
    );
  }

  _renderIcon(name) {
    const svg = this._icons?.[name];
    return svg ?? nothing;
  }

  render() {
    return html`
      <header class="bar" part="bar">
        <div class="group group-start" part="group-start">
          <button type="button" class="icon-btn" part="btn toggle-before" data-action="open-panel-before" aria-label="Open before panel" @click=${() => this._openPanel('before')}>
            ${this._renderIcon('splitLeft')}
          </button>
          <button type="button" class="icon-btn" part="btn" data-action="undo" aria-label="Undo">
            ${this._renderIcon('undo')}
          </button>
          <button
            type="button"
            class="icon-btn"
            part="btn"
            data-action="redo"
            aria-label="Redo"
            ?disabled=${!this.redoAvailable}
          >
            ${this._renderIcon('redo')}
          </button>
        </div>

        <div class="group group-center" part="group-center">
          <div class="segmented" role="group" aria-label="Editor view" part="editor-view-toggle">
            <button
              type="button"
              class="segment ${this.editorView === 'layout' ? 'is-selected' : ''}"
              aria-pressed=${this.editorView === 'layout'}
              @click=${() => this._setEditorView('layout')}
            >Layout</button>
            <button
              type="button"
              class="segment ${this.editorView === 'content' ? 'is-selected' : ''}"
              aria-pressed=${this.editorView === 'content'}
              @click=${() => this._setEditorView('content')}
            >Content</button>
          </div>
        </div>

        <div class="group group-end" part="group-end">
          <button type="button" class="icon-btn" part="btn toggle-after" data-action="open-panel-after" aria-label="Open after panel" @click=${() => this._openPanel('after')}>
            ${this._renderIcon('splitRight')}
          </button>
        </div>
      </header>
    `;
  }
}

customElements.define('nx-canvas-header', NXCanvasHeader);
