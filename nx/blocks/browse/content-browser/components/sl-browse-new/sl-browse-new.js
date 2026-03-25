// eslint-disable-next-line import/no-unresolved
import getStyle from 'https://da.live/nx/utils/styles.js';
// eslint-disable-next-line import/no-unresolved
import { LitElement, html } from 'da-lit';
import {
  buildCanvasEditHref,
  buildSheetEditHref,
  daPathToPathKey,
} from '../../lib/content-browser-actions.js';

const style = await getStyle(import.meta.url);

const INPUT_ERROR = 'sl-bn-input-error';

/**
 * Create folder / document / sheet / media / link (legacy da-new behavior, Spectrum-friendly).
 *
 * @fires sl-browse-new-item - detail `{ item }` after server-side create
 * @fires sl-browse-new-error - detail: { message: string }
 * @customElement sl-browse-new
 */
export class SlBrowseNew extends LitElement {
  static properties = {
    /** Current folder fullpath e.g. `/org/site/sub` */
    folderFullpath: { type: String, attribute: 'folder-fullpath' },
    canvasEditBase: { type: String, attribute: 'canvas-edit-base' },
    sheetEditBase: { type: String, attribute: 'sheet-edit-base' },
    /** When set, require `'write'` to enable the control */
    permissions: { type: Array, attribute: false },
    /**
     * PUT `/source{path}` with optional FormData.
     * @type {((daPath: string, formData?: FormData) => Promise<
     *   { ok: boolean, error?: string }>) | undefined}
     */
    saveToSource: { attribute: false },
    _menuOpen: { state: true },
    /** `'menu' | 'input' | 'upload' | ''` */
    _mode: { state: true },
    _createType: { state: true },
    _createName: { state: true },
    _externalUrl: { state: true },
    _fileLabel: { state: true },
    _busy: { state: true },
  };

  constructor() {
    super();
    this.folderFullpath = '';
    this.canvasEditBase = 'https://da.live/canvas';
    this.sheetEditBase = 'https://da.live/sheet';
    this.permissions = undefined;
    this.saveToSource = undefined;
    this._menuOpen = false;
    this._mode = '';
    this._createType = '';
    this._createName = '';
    this._externalUrl = '';
    this._fileLabel = 'Select file';
    this._busy = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    document.addEventListener('pointerdown', this._onDocumentPointerDown, true);
    document.addEventListener('keydown', this._onDocumentKeydown, true);
  }

  disconnectedCallback() {
    document.removeEventListener('pointerdown', this._onDocumentPointerDown, true);
    document.removeEventListener('keydown', this._onDocumentKeydown, true);
    super.disconnectedCallback();
  }

  /**
   * Close menu / create panel when the user clicks or taps outside this element.
   * @param {PointerEvent} e
   */
  _onDocumentPointerDown = (e) => {
    if (!this._menuOpen && !this._mode) return;
    if (e.composedPath().includes(this)) return;
    this._menuOpen = false;
    this._resetPanels();
  };

  /**
   * Dismiss overlays with Escape (including when focus is outside the name field).
   * @param {KeyboardEvent} e
   */
  _onDocumentKeydown = (e) => {
    if (e.key !== 'Escape' || (!this._menuOpen && !this._mode)) return;
    this._menuOpen = false;
    this._resetPanels();
  };

  get _hasWrite() {
    if (this.permissions == null) return true;
    return this.permissions.includes('write');
  }

  get _controlDisabled() {
    return this._busy || !this._hasWrite;
  }

  _rootClass() {
    const parts = ['sl-bn-root'];
    if (this._menuOpen) parts.push('menu-open');
    if (this._mode === 'input') parts.push('panel-input');
    if (this._mode === 'upload') parts.push('panel-upload');
    return parts.join(' ');
  }

  _toggleMenu() {
    if (!this.saveToSource || !this.folderFullpath || this._controlDisabled) return;
    this._menuOpen = !this._menuOpen;
    if (!this._menuOpen) this._resetPanels();
  }

  _resetPanels() {
    this._mode = '';
    this._createType = '';
    this._createName = '';
    this._externalUrl = '';
    this._fileLabel = 'Select file';
    this._clearInputErrors();
  }

  _clearInputErrors() {
    this.shadowRoot?.querySelectorAll(`.${INPUT_ERROR}`).forEach((el) => {
      el.classList.remove(INPUT_ERROR);
    });
  }

  /**
   * @param {Event} e
   */
  _onPickType(e) {
    const btn = e.target.closest('button[data-type]');
    if (!btn) return;
    const { type } = btn.dataset;
    if (!type) return;
    this._createType = type;
    this._menuOpen = false;
    this._mode = type === 'media' ? 'upload' : 'input';
    queueMicrotask(() => {
      const input = this.shadowRoot?.querySelector('.sl-bn-input-name');
      if (input) input.focus();
    });
  }

  /**
   * @param {Event} e
   */
  _onNameInput(e) {
    const t = /** @type {HTMLInputElement} */ (e.target);
    this._createName = t.value.replaceAll(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    if (t.classList.contains('sl-bn-input-name')) {
      t.classList.remove(INPUT_ERROR);
    }
  }

  /**
   * @param {Event} e
   */
  _onUrlInput(e) {
    const t = /** @type {HTMLInputElement} */ (e.target);
    this._externalUrl = t.value;
  }

  _emitNewItem(item) {
    this.dispatchEvent(
      new CustomEvent('sl-browse-new-item', {
        detail: { item },
        bubbles: true,
        composed: true,
      }),
    );
  }

  _emitError(message) {
    this.dispatchEvent(
      new CustomEvent('sl-browse-new-error', {
        detail: { message },
        bubbles: true,
        composed: true,
      }),
    );
  }

  async _onCreateClick() {
    const nameInput = this.shadowRoot?.querySelector('.sl-bn-input-name');
    if (!this._createName) {
      if (nameInput) nameInput.classList.add(INPUT_ERROR);
      return;
    }
    if (nameInput) nameInput.classList.remove(INPUT_ERROR);

    const base = this.folderFullpath.replace(/\/$/, '');
    let ext;
    /** @type {FormData | undefined} */
    let formData;

    switch (this._createType) {
      case 'document':
        ext = 'html';
        break;
      case 'sheet':
        ext = 'json';
        break;
      case 'link': {
        ext = 'link';
        formData = new FormData();
        const linkPayload = JSON.stringify({ externalUrl: this._externalUrl });
        formData.append(
          'data',
          new Blob([linkPayload], { type: 'application/json' }),
        );
        break;
      }
      case 'folder':
        break;
      default:
        return;
    }

    let daPath = `${base}/${this._createName}`;
    if (ext) daPath += `.${ext}`;

    const pathKey = daPathToPathKey(daPath);
    const qs = typeof window !== 'undefined' ? window.location.search || '' : '';

    if (ext && ext !== 'link') {
      const href = ext === 'html'
        ? buildCanvasEditHref(this.canvasEditBase, pathKey, qs)
        : buildSheetEditHref(this.sheetEditBase, pathKey, qs);
      this._resetPanels();
      window.location.assign(href);
      return;
    }

    if (!this.saveToSource) return;
    this._busy = true;
    try {
      const result = await this.saveToSource(daPath, formData);
      if (!result?.ok) {
        this._emitError(result?.error || 'Create failed');
        return;
      }
      const item = { name: this._createName, path: daPath };
      if (ext) item.ext = ext;
      this._emitNewItem(item);
      this._resetPanels();
    } finally {
      this._busy = false;
    }
  }

  /**
   * @param {Event} e
   */
  async _onUploadSubmit(e) {
    e.preventDefault();
    if (this._fileLabel === 'Select file') {
      const label = this.shadowRoot?.querySelector('.sl-bn-file-label');
      if (label) label.classList.add(INPUT_ERROR);
      return;
    }
    const form = /** @type {HTMLFormElement} */ (e.target);
    const formData = new FormData(form);
    const split = this._fileLabel.split('.');
    const fileExt = split.pop();
    const stem = split.join('.').replaceAll(/[^a-zA-Z0-9.]/g, '-').toLowerCase();
    const filename = `${stem}.${fileExt}`;
    const base = this.folderFullpath.replace(/\/$/, '');
    const daPath = `${base}/${filename}`;

    if (!this.saveToSource) return;
    this._busy = true;
    try {
      const result = await this.saveToSource(daPath, formData);
      if (!result?.ok) {
        this._emitError(result?.error || 'Upload failed');
        return;
      }
      const item = { name: stem, path: daPath, ext: fileExt };
      this._emitNewItem(item);
      this._resetPanels();
    } finally {
      this._busy = false;
    }
  }

  /**
   * @param {Event} e
   */
  _onFileChange(e) {
    const input = /** @type {HTMLInputElement} */ (e.target);
    const file = input.files?.[0];
    this._fileLabel = file ? file.name : 'Select file';
    const err = this.shadowRoot?.querySelector('.sl-bn-file-label.sl-bn-input-error');
    if (err) err.classList.remove(INPUT_ERROR);
  }

  /**
   * @param {KeyboardEvent} e
   */
  _onNameKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      this._onCreateClick();
    } else if (e.key === 'Escape') {
      this._resetPanels();
    }
  }

  _onCancel() {
    this._resetPanels();
  }

  render() {
    if (!this.folderFullpath || !this.saveToSource) {
      return html``;
    }

    return html`
      <div class="${this._rootClass()}">
        <sp-button
          size="m"
          variant="accent"
          ?disabled="${this._controlDisabled}"
          @click="${this._toggleMenu}"
        >
          New
        </sp-button>
        <ul class="sl-bn-menu" @click="${this._onPickType}">
          <li class="sl-bn-menu-item">
            <button type="button" data-type="folder" ?disabled="${this._busy}">Folder</button>
          </li>
          <li class="sl-bn-menu-item">
            <button type="button" data-type="document" ?disabled="${this._busy}">Document</button>
          </li>
          <li class="sl-bn-menu-item">
            <button type="button" data-type="sheet" ?disabled="${this._busy}">Sheet</button>
          </li>
          <li class="sl-bn-menu-item">
            <button type="button" data-type="media" ?disabled="${this._busy}">Media</button>
          </li>
          <li class="sl-bn-menu-item">
            <button type="button" data-type="link" ?disabled="${this._busy}">Link</button>
          </li>
        </ul>
        <div class="sl-bn-panel sl-bn-panel-input">
          <input
            type="text"
            class="sl-bn-input sl-bn-input-name"
            placeholder="name"
            .value="${this._createName}"
            @input="${this._onNameInput}"
            @keydown="${this._onNameKeydown}"
            ?disabled="${this._busy}"
          />
          ${this._createType === 'link'
        ? html`
                <input
                  type="text"
                  class="sl-bn-input"
                  placeholder="url"
                  .value="${this._externalUrl}"
                  @input="${this._onUrlInput}"
                  ?disabled="${this._busy}"
                />
              `
        : ''}
          <div class="sl-bn-actions">
            <sp-button
              variant="accent"
              ?disabled="${this._busy}"
              @click="${this._onCreateClick}"
            >
              Create ${this._createType}
            </sp-button>
            <sp-button variant="secondary" ?disabled="${this._busy}" @click="${this._onCancel}">
              Cancel
            </sp-button>
          </div>
        </div>
        <form class="sl-bn-panel sl-bn-panel-upload" enctype="multipart/form-data" @submit="${this._onUploadSubmit}">
          <label for="sl-bn-file" class="sl-bn-file-label">${this._fileLabel}</label>
          <input
            type="file"
            id="sl-bn-file"
            class="sl-bn-file"
            name="data"
            @change="${this._onFileChange}"
            ?disabled="${this._busy}"
          />
          <div class="sl-bn-actions">
            <sp-button variant="accent" type="submit" ?disabled="${this._busy}">Upload</sp-button>
            <sp-button variant="secondary" type="button" ?disabled="${this._busy}" @click="${this._onCancel}">
              Cancel
            </sp-button>
          </div>
        </form>
      </div>
    `;
  }
}

customElements.define('sl-browse-new', SlBrowseNew);
