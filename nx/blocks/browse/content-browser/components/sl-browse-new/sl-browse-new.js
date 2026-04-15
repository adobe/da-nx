// eslint-disable-next-line import/no-unresolved
import getStyle from 'https://da.live/nx/utils/styles.js';
// eslint-disable-next-line import/no-unresolved
import { LitElement, html, createRef, ref } from 'da-lit';
import { readSearchControlValueFromInputEvent } from '../sl-browse-search/sl-browse-search.js';
import {
  buildCanvasEditHref,
  daPathToPathKey,
} from '../../lib/content-browser-actions.js';
import { browseRenameNameFieldCopy } from '../../lib/content-browser-utils.js';
import { replaceHtml } from '../../../../../utils/daFetch.js';
import { upsertSkillInConfig } from '../../../skills-lab-api.js';

const style = await getStyle(import.meta.url);

const INPUT_ERROR = 'sl-bn-input-error';

// DA list-style sheet shell (see test/loc/glaas/mocks/testData.js singleSheetJson).
const NEW_SHEET_JSON = JSON.stringify({
  ':type': 'sheet',
  total: '0',
  offset: '0',
  limit: '0',
  data: [],
});

/**
 * Create folder / document / sheet / media / link (legacy da-new behavior, Spectrum-friendly).
 *
 * Uses `overlay-trigger` + `sp-popover` + `sp-dialog` for the create step
 * (Spectrum overlay pattern).
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
    /**
     * `'menu' | 'input' | 'upload' | ''` — `input` / `upload` shows `sp-dialog` in the popover.
     */
    _mode: { state: true },
    _createType: { state: true },
    _createName: { state: true },
    _externalUrl: { state: true },
    _fileLabel: { state: true },
    _busy: { state: true },
    _nameInvalid: { state: true },
  };

  constructor() {
    super();
    this.folderFullpath = '';
    this.canvasEditBase = 'https://da.live/canvas';
    this.sheetEditBase = 'https://da.live/sheet';
    this.permissions = undefined;
    this.saveToSource = undefined;
    this._mode = '';
    this._createType = '';
    this._createName = '';
    this._externalUrl = '';
    this._fileLabel = 'Select file';
    this._busy = false;
    this._nameInvalid = false;
    this._nameInputRef = createRef();
    this._overlayTriggerRef = createRef();
  }

  get _createDialogOpen() {
    return this._mode === 'input' || this._mode === 'upload';
  }

  /** e.g. New Document — matches the type picked from the New menu. */
  get _createDialogHeading() {
    const labels = {
      folder: 'New Folder',
      document: 'New Document',
      sheet: 'New Sheet',
      media: 'New Media',
      link: 'New Link',
      skill: 'New Skill',
    };
    return labels[this._createType] ?? 'New';
  }

  /**
   * Strings for the primary name field (same copy helper as the rename dialog).
   */
  get _createNameFieldCopy() {
    /** @type {Record<string, string>} */
    const extByType = {
      folder: '',
      document: 'html',
      sheet: 'json',
      link: 'link',
      skill: 'md',
    };
    const t = this._createType;
    const ext = Object.prototype.hasOwnProperty.call(extByType, t)
      ? extByType[t]
      : 'x';
    return browseRenameNameFieldCopy(ext);
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  /**
   * @param {Map<PropertyKey, unknown>} changedProperties
   */
  updated(changedProperties) {
    super.updated(changedProperties);
    if (changedProperties.has('_mode') && this._createDialogOpen) {
      queueMicrotask(() => this._focusCreateDialogFirstField());
    }
  }

  get _hasWrite() {
    if (this.permissions == null) return true;
    return this.permissions.includes('write');
  }

  get _controlDisabled() {
    return this._busy || !this._hasWrite;
  }

  /** Close the overlay (fires `sp-closed` → `onOverlayClosed`). */
  _closeOverlay() {
    const ot = this._overlayTriggerRef.value;
    if (ot != null && 'open' in ot) {
      /** @type {{ open?: string }} */ (ot).open = undefined;
    }
  }

  _onOverlayClosed() {
    this._resetPanels();
  }

  _resetPanels() {
    this._mode = '';
    this._createType = '';
    this._createName = '';
    this._externalUrl = '';
    this._fileLabel = 'Select file';
    this._nameInvalid = false;
    this._clearInputErrors();
    const fileInput = this.shadowRoot?.querySelector('#sl-bn-file');
    if (fileInput) /** @type {HTMLInputElement} */ (fileInput).value = '';
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
    this._mode = type === 'media' ? 'upload' : 'input';
  }

  async _focusCreateDialogFirstField() {
    if (this._mode === 'input') {
      const el = this._nameInputRef.value;
      if (!el) return;
      await el.updateComplete;
      el.focus();
    }
  }

  /**
   * @param {Event} e
   */
  _onNameInput(e) {
    const raw = readSearchControlValueFromInputEvent(e);
    this._createName = raw.replaceAll(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    this._nameInvalid = false;
  }

  /**
   * @param {Event} e
   */
  _onUrlInput(e) {
    this._externalUrl = readSearchControlValueFromInputEvent(e);
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

  _onCreateDialogClose() {
    if (this._busy) return;
    this._closeOverlay();
  }

  _onCreateDialogCancel() {
    if (this._busy) return;
    this._closeOverlay();
  }

  async _onCreateDialogConfirm() {
    if (this._busy) return;
    if (this._mode === 'upload') {
      await this._submitUpload();
      return;
    }
    await this._onCreateClick();
  }

  async _onCreateClick() {
    if (!this._createName) {
      this._nameInvalid = true;
      return;
    }
    this._nameInvalid = false;

    const base = this.folderFullpath.replace(/\/$/, '');

    if (this._createType === 'skill') {
      const segments = base.replace(/^\/+/, '').split('/').filter(Boolean);
      const org = segments[0];
      const site = segments[1];
      if (!org || !site) {
        this._emitError('Create skill from the site root (org/site) so it can be saved to config.');
        return;
      }
      this._busy = true;
      try {
        const result = await upsertSkillInConfig(
          org,
          site,
          this._createName,
          '# New skill\n\nDescribe this skill here.\n',
        );
        if (result.error) {
          this._emitError(result.error);
          return;
        }
        this._emitNewItem({
          name: this._createName,
          path: `/${org}/${site}/config/skills/${this._createName}`,
          ext: 'md',
        });
        this._closeOverlay();
      } finally {
        this._busy = false;
      }
      return;
    }

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

    // PUT create: new document opens canvas; new sheet stays in browse (list refresh via event).
    if (ext === 'html' || ext === 'json') {
      if (!this.saveToSource) return;
      this._busy = true;
      try {
        const segments = daPath.replace(/^\/+/, '').split('/').filter(Boolean);
        const org = segments[0];
        const repo = segments[1];
        const putFormData = new FormData();
        if (ext === 'html') {
          const body = replaceHtml('', org, repo);
          putFormData.append('data', new Blob([body], { type: 'text/html' }));
        } else {
          putFormData.append(
            'data',
            new Blob([NEW_SHEET_JSON], { type: 'application/json' }),
          );
        }
        const result = await this.saveToSource(daPath, putFormData);
        if (!result?.ok) {
          this._emitError(result?.error || 'Create failed');
          return;
        }
        this._emitNewItem({ name: this._createName, path: daPath, ext });
        this._closeOverlay();
        if (ext === 'html') {
          const pathKey = daPathToPathKey(daPath);
          const qs = typeof window !== 'undefined' ? window.location.search || '' : '';
          window.location.assign(
            buildCanvasEditHref(this.canvasEditBase, pathKey, qs),
          );
        }
      } finally {
        this._busy = false;
      }
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
      this._closeOverlay();
    } finally {
      this._busy = false;
    }
  }

  /**
   * @param {SubmitEvent} e
   */
  _onUploadFormSubmit(e) {
    e.preventDefault();
  }

  async _submitUpload() {
    if (this._fileLabel === 'Select file') {
      const label = this.shadowRoot?.querySelector('.sl-bn-file-label');
      if (label) label.classList.add(INPUT_ERROR);
      return;
    }
    const form = this.shadowRoot?.querySelector('.sl-bn-upload-form');
    if (!(form instanceof HTMLFormElement) || !this.saveToSource) return;
    const formData = new FormData(form);
    const split = this._fileLabel.split('.');
    const fileExt = split.pop();
    const stem = split.join('.').replaceAll(/[^a-zA-Z0-9.]/g, '-').toLowerCase();
    const filename = `${stem}.${fileExt}`;
    const base = this.folderFullpath.replace(/\/$/, '');
    const daPath = `${base}/${filename}`;

    this._busy = true;
    try {
      const result = await this.saveToSource(daPath, formData);
      if (!result?.ok) {
        this._emitError(result?.error || 'Upload failed');
        return;
      }
      const item = { name: stem, path: daPath, ext: fileExt };
      this._emitNewItem(item);
      this._closeOverlay();
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
  _onCreateNameKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      this._onCreateDialogConfirm();
    }
  }

  render() {
    if (!this.folderFullpath || !this.saveToSource) {
      return html``;
    }

    return html`
      <div class="sl-bn-root">
        <overlay-trigger
          ${ref(this._overlayTriggerRef)}
          placement="top"
          type="auto"
          triggered-by="click"
          @sp-closed="${this._onOverlayClosed}"
        >
          <sp-button
            slot="trigger"
            size="m"
            variant="accent"
            ?disabled="${this._controlDisabled}"
          >
            New
          </sp-button>
          <sp-popover slot="click-content">
            ${!this._createDialogOpen
        ? html`
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
                    <li class="sl-bn-menu-item">
                      <button type="button" data-type="skill" ?disabled="${this._busy}">Skill</button>
                    </li>
                  </ul>
                `
        : html`
                  <sp-dialog
                    class="sl-browse-create-dialog"
                    size="s"
                    dismissable
                    @close="${this._onCreateDialogClose}"
                  >
                    <h2 slot="heading">${this._createDialogHeading}</h2>
                    <div class="sl-browse-create-dialog-body">
                      ${this._mode === 'input'
            ? html`
                            <sp-textfield
                              ${ref(this._nameInputRef)}
                              class="sl-browse-create-textfield"
                              label="${this._createNameFieldCopy.label}"
                              placeholder="${this._createNameFieldCopy.placeholder}"
                              autocomplete="off"
                              .value="${this._createName}"
                              ?invalid="${this._nameInvalid}"
                              ?disabled="${this._busy}"
                              @input="${this._onNameInput}"
                              @keydown="${this._onCreateNameKeydown}"
                            ></sp-textfield>
                            ${this._createType === 'link'
              ? html`
                                  <sp-textfield
                                    class="sl-browse-create-textfield"
                                    label="URL"
                                    placeholder="Enter a URL"
                                    autocomplete="off"
                                    .value="${this._externalUrl}"
                                    ?disabled="${this._busy}"
                                    @input="${this._onUrlInput}"
                                  ></sp-textfield>
                                `
              : ''}
                          `
            : ''}
                      ${this._mode === 'upload'
            ? html`
                            <form
                              class="sl-bn-upload-form"
                              enctype="multipart/form-data"
                              @submit="${this._onUploadFormSubmit}"
                            >
                              <label for="sl-bn-file" class="sl-bn-file-label">${this._fileLabel}</label>
                              <input
                                type="file"
                                id="sl-bn-file"
                                class="sl-bn-file"
                                name="data"
                                @change="${this._onFileChange}"
                                ?disabled="${this._busy}"
                              />
                            </form>
                          `
            : ''}
                    </div>
                    <div class="sl-browse-create-dialog-footer" slot="footer">
                      <sp-button
                        variant="secondary"
                        ?disabled="${this._busy}"
                        @click="${this._onCreateDialogCancel}"
                      >
                        Cancel
                      </sp-button>
                      <sp-button
                        variant="accent"
                        ?disabled="${this._busy}"
                        @click="${this._onCreateDialogConfirm}"
                      >
                        Create
                      </sp-button>
                    </div>
                  </sp-dialog>
                `}
          </sp-popover>
        </overlay-trigger>
      </div>
    `;
  }
}

customElements.define('sl-browse-new', SlBrowseNew);
