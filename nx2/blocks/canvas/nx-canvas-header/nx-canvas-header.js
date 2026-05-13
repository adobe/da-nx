import { LitElement, html, nothing } from 'da-lit';

import { loadStyle } from '../../../utils/utils.js';
import { loadHrefSvg, ICONS_BASE } from '../../../utils/svg.js';
import { DEFAULT_STATIC_BRANCH, getStaticBranch, setStaticBranch } from '../editor-utils/preview.js';

const style = await loadStyle(import.meta.url);

const ICONS = {
  undo: `${ICONS_BASE}S2_Icon_Undo_20_N.svg`,
  redo: `${ICONS_BASE}S2_Icon_Redo_20_N.svg`,
  splitLeft: `${ICONS_BASE}S2_Icon_SplitLeft_20_N.svg`,
  splitRight: `${ICONS_BASE}S2_Icon_SplitRight_20_N.svg`,
  gridCompare: `${ICONS_BASE}S2_Icon_GridCompare_20_N.svg`,
};

const EDITOR_VIEWS = /** @type {const} */ (['layout', 'content', 'split']);

class NXCanvasHeader extends LitElement {
  static properties = {
    _icons: { state: true },
    /** `'layout'` / `'content'` = single pane; `'split'` = doc + WYSIWYG side by side */
    editorView: { type: String, reflect: true },
    undoAvailable: { type: Boolean },
    redoAvailable: { type: Boolean },
    /** Branch used to serve preview static files (CSS / JS). */
    staticBranch: { type: String, attribute: 'static-branch', reflect: true },
  };

  constructor() {
    super();
    this.editorView = 'layout';
    this.undoAvailable = false;
    this.redoAvailable = false;
    this.staticBranch = getStaticBranch();
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

  _undo() {
    this.dispatchEvent(
      new CustomEvent('nx-canvas-undo', { bubbles: true, composed: true }),
    );
  }

  _redo() {
    this.dispatchEvent(
      new CustomEvent('nx-canvas-redo', { bubbles: true, composed: true }),
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

  _commitStaticBranch(e) {
    const value = setStaticBranch(e.target.value);
    // Render the default branch as an empty input so the native `main`
    // placeholder shows in its lighter colour — a visual cue that no
    // override is active.
    const displayValue = value === DEFAULT_STATIC_BRANCH ? '' : value;
    e.target.value = displayValue;
    if (value === this.staticBranch) return;
    this.staticBranch = value;
    this.dispatchEvent(
      new CustomEvent('nx-canvas-static-branch', {
        bubbles: true,
        composed: true,
        detail: { branch: value },
      }),
    );
  }

  _onStaticBranchKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.target.blur();
    }
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
          <button type="button" class="icon-btn" part="btn" data-action="undo" aria-label="Undo" ?disabled=${!this.undoAvailable} @click=${this._undo}>
            ${this._renderIcon('undo')}
          </button>
          <button
            type="button"
            class="icon-btn"
            part="btn"
            data-action="redo"
            aria-label="Redo"
            ?disabled=${!this.redoAvailable}
            @click=${this._redo}
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
            <button
              type="button"
              class="segment segment-icon ${this.editorView === 'split' ? 'is-selected' : ''}"
              aria-pressed=${this.editorView === 'split'}
              aria-label="Split view"
              title="Split view"
              @click=${() => this._setEditorView('split')}
            >${this._renderIcon('gridCompare')}</button>
          </div>
          <label class="static-branch-field" part="static-branch-field">
            <span class="static-branch-label">Branch</span>
            <input
              type="text"
              class="static-branch-input"
              part="static-branch-input"
              .value=${this.staticBranch === DEFAULT_STATIC_BRANCH ? '' : this.staticBranch}
              placeholder=${DEFAULT_STATIC_BRANCH}
              spellcheck="false"
              autocomplete="off"
              aria-label="Preview static files branch"
              title="Branch used to serve static files (CSS / JS) for the preview"
              @change=${this._commitStaticBranch}
              @keydown=${this._onStaticBranchKeydown}
            />
          </label>
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
