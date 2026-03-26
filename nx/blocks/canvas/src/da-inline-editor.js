/**
 * Inline ProseMirror editor panel. Uses minimal prose init from prose-inline.js
 * and mounts the editor when org, repo, and path are set. No toolbars/headers.
 * Auth via initIms / daFetch (nx), same as file-browser.
 */
// eslint-disable-next-line import/no-unresolved
import getStyle from 'https://da.live/nx/utils/styles.js';
// eslint-disable-next-line import/no-unresolved
import { LitElement, html } from 'da-lit';
// eslint-disable-next-line import/no-unresolved
import { DA_ORIGIN } from 'https://da.live/blocks/shared/constants.js';
import { initIms, daFetch } from '../../../utils/daFetch.js';
import initProse from './prose-inline.js';
import {
  updateDocument,
  updateCursors,
  getEditor,
  getInstrumentedHTML,
  getBlockPositions,
  getActiveBlockFlatIndex,
  moveBlockAt,
  insertSectionAfter,
  insertBlockAtSection,
  createControllerOnMessage,
} from './quick-edit-controller.js';
import { applyAemHtmlToYdoc, snapshotAemHtmlFromYdoc } from './yjs-aem-apply.js';
import { getPreviewOrigin } from './preview-origin.js';

const style = await getStyle(import.meta.url);
const imsInitial = await initIms();
const token = imsInitial?.accessToken?.token ?? null;
/** Refreshed before Yjs WebSocket init; sync getter required by prose-inline. */
let imsAccessTokenForCollab = token;

/** Set cookie on preview domain so the iframe can load images (mirrors da-nx getImageCookie). */
function setImageCookie(owner, repo) {
  if (!owner || !repo) return;
  const url = `${getPreviewOrigin(owner, repo)}/gimme_cookie`;
  daFetch(url, { credentials: 'include' }).catch(() => {});
}

function afterRender(cb) {
  Promise.resolve().then(() => requestAnimationFrame(cb));
}

function buildSourceUrl(path) {
  if (!path || typeof path !== 'string') return null;
  const trimmed = path.replace(/^\//, '').trim();
  if (!trimmed) return null;
  const normalized = trimmed.endsWith('.html') || trimmed.endsWith('.json')
    ? trimmed
    : `${trimmed}.html`;
  return `${DA_ORIGIN}/source/${normalized}`;
}

function parsePermissions(resp) {
  const hint = resp.headers.get('x-da-child-actions') ?? resp.headers.get('x-da-actions');
  if (hint) resp.permissions = hint.split('=').pop().split(',');
  else resp.permissions = ['read', 'write'];
  return resp;
}

async function checkDoc(sourceUrl) {
  const resp = await daFetch(sourceUrl, { method: 'HEAD' });
  return parsePermissions(resp);
}

/** Match chat-controller / _notifyDocumentUpdated path normalization. */
function normalizeRepoPath(path) {
  if (typeof path !== 'string') return '';
  return path
    .trim()
    .split('?')[0]
    .split('#')[0]
    .replace(/^\/+/, '')
    .replace(/\.html$/i, '');
}

export default class DaInlineEditor extends LitElement {
  static properties = {
    org: { type: String },
    repo: { type: String },
    path: { type: String },
    autoFocus: { type: Boolean },
    quickEditPort: { type: Object },
    onEditorHtmlChange: { type: Function },
    onBlockPositions: { type: Function },
    onActiveBlockChange: { type: Function },
    pendingMove: { type: Object },
    onMoveBlockDone: { type: Function },
    pendingAddSection: { type: Object },
    onAddSectionDone: { type: Function },
    pendingAddBlock: { type: Object },
    onAddBlockDone: { type: Function },
    _proseEl: { state: true },
    _wsProvider: { state: true },
    _view: { state: true },
    _loading: { state: true },
    _error: { state: true },
  };

  constructor() {
    super();
    this.org = '';
    this.repo = '';
    this.path = '';
    this.quickEditPort = null;
    this.onActiveBlockChange = null;
    this._proseEl = null;
    this._wsProvider = null;
    this._view = null;
    /** @type {import('yjs').Doc | null} */
    this._ydoc = null;
    this._loading = false;
    this._error = null;
    /** Controller ctx for quick-edit; set when quickEditPort and _view are both set. */
    this._controllerCtx = null;
  }

  /**
   * @param {{ org?: string, repo?: string, path?: string }} toolInput
   * @returns {boolean}
   */
  _editorPathMatchesToolInput(toolInput) {
    const o = String(toolInput?.org ?? '').trim();
    const r = String(toolInput?.repo ?? '').trim();
    if (!o || !r || o !== this.org || r !== this.repo) return false;
    const segments = (this.path || '').replace(/^\//, '').split('/').filter(Boolean);
    const relPath = segments.slice(2).join('/');
    return normalizeRepoPath(relPath) === normalizeRepoPath(String(toolInput?.path ?? ''));
  }

  /**
   * EDS HTML from live Y.Doc for revert snapshot (when this file is the tool target).
   * @param {{ org?: string, repo?: string, path?: string }} toolInput
   * @returns {string | null}
   */
  getRevertSnapshotAemHtml(toolInput) {
    if (!this._ydoc || !toolInput || !this._editorPathMatchesToolInput(toolInput)) return null;
    return snapshotAemHtmlFromYdoc(this._ydoc);
  }

  /**
   * Restore document from stored EDS HTML (collab Y.Doc update).
   * @param {string} aemHtml
   */
  applyRevertSnapshotAemHtml(aemHtml) {
    if (!this._ydoc || typeof aemHtml !== 'string' || !aemHtml.trim()) return;
    // While Y→ProseMirror applies the replace, the iframe may still report a pre-revert
    // cursor; prose-inline's getEditor would resolve a stale offset and throw. Suppress
    // during the transaction; we push fresh HTML to the iframe in rAF below.
    if (this._controllerCtx) {
      this._controllerCtx.suppressRerender = true;
    }
    try {
      applyAemHtmlToYdoc(this._ydoc, aemHtml);
    } finally {
      if (this._controllerCtx) {
        this._controllerCtx.suppressRerender = false;
      }
    }
    requestAnimationFrame(() => {
      if (!this._view) return;
      if (typeof this.onEditorHtmlChange === 'function') {
        this.onEditorHtmlChange(getInstrumentedHTML(this._view));
      }
      if (typeof this.onBlockPositions === 'function') {
        this.onBlockPositions(getBlockPositions(this._view));
      }
      if (this._controllerCtx?.port) {
        updateDocument(this._controllerCtx);
        updateCursors(this._controllerCtx);
      }
    });
  }

  get _sourceUrl() {
    return buildSourceUrl(this.path);
  }

  get _canLoad() {
    return this.org && this.repo && this.path && this._sourceUrl;
  }

  /** Page pathname for quick-edit controller (path without org/repo, leading slash, no .html). */
  get _controllerPathname() {
    if (!this.path || typeof this.path !== 'string') return '/';
    const segments = this.path.replace(/^\//, '').split('/').filter(Boolean);
    const withoutOrgRepo = segments.slice(2).join('/').replace(/\.html$/i, '');
    return withoutOrgRepo ? `/${withoutOrgRepo}` : '/';
  }

  _setEditable(editable) {
    this.requestUpdate();
    afterRender(() => {
      const pm = this.shadowRoot?.querySelector('.da-inline-editor-mount .ProseMirror');
      if (pm) pm.contentEditable = editable ? 'true' : 'false';
    });
  }

  _dispatchAddToChat = (payload) => {
    this.dispatchEvent(new CustomEvent('quick-edit-add-to-chat', {
      bubbles: true,
      composed: true,
      detail: { payload },
    }));
  };

  _teardownController() {
    if (this._controllerCtx?.port) {
      this._controllerCtx.port.onmessage = null;
    }
    this._controllerCtx = null;
  }

  _setupController() {
    if (!this.quickEditPort || !this._view || !this._wsProvider) return;
    if (this._controllerCtx?.port === this.quickEditPort) return;

    this._teardownController();

    const getToken = async () => (await initIms())?.accessToken?.token ?? null;
    this._controllerCtx = {
      view: this._view,
      wsProvider: this._wsProvider,
      port: this.quickEditPort,
      suppressRerender: false,
      owner: this.org,
      repo: this.repo,
      path: this._controllerPathname,
      getToken,
      onAddToChat: this._dispatchAddToChat,
      onActiveBlockChange: (index) => {
        this.onActiveBlockChange?.(index);
      },
    };

    this.quickEditPort.onmessage = createControllerOnMessage(this._controllerCtx);
    setImageCookie(this.org, this.repo);
    const sendInitialBody = () => {
      if (!this._controllerCtx?.port) return;
      updateDocument(this._controllerCtx);
      updateCursors(this._controllerCtx);
      if (typeof this.onEditorHtmlChange === 'function') {
        this.onEditorHtmlChange(getInstrumentedHTML(this._controllerCtx.view));
      }
      if (typeof this.onBlockPositions === 'function') {
        this.onBlockPositions(getBlockPositions(this._controllerCtx.view));
      }
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(sendInitialBody);
    });
  }

  /**
   * Subscribe to Yjs awareness updates and dispatch da-collab-users to parent (bubbles).
   * Same logic as handleAwarenessUpdates in da-live blocks/edit/prose/index.js.
   * @param {import('y-websocket').WebsocketProvider} wsProvider
   */
  _setupAwarenessUpdates(wsProvider) {
    if (this._awarenessOff) {
      this._awarenessOff();
      this._awarenessOff = null;
    }
    const users = new Set();
    const dispatchUsers = () => {
      const self = wsProvider.awareness.clientID;
      const awarenessStates = wsProvider.awareness.getStates();
      const userMap = new Map();
      [...users].forEach((u, i) => {
        if (u === self) return;
        const userInfo = awarenessStates.get(u)?.user;
        if (!userInfo?.name) {
          userMap.set(`anonymous-${u}`, 'Anonymous');
        } else {
          userMap.set(`${userInfo.id}-${i}`, userInfo.name);
        }
      });
      const userList = [...userMap.values()].sort();
      this.dispatchEvent(new CustomEvent('da-collab-users', {
        bubbles: true,
        composed: true,
        detail: { users: userList },
      }));
    };
    const onUpdate = (delta) => {
      delta.added.forEach((u) => users.add(u));
      delta.updated.forEach((u) => users.add(u));
      delta.removed.forEach((u) => users.delete(u));
      dispatchUsers();
    };
    wsProvider.awareness.on('update', onUpdate);
    dispatchUsers();
    this._awarenessOff = () => {
      wsProvider.awareness.off('update', onUpdate);
      this._awarenessOff = null;
    };
  }

  async _loadEditor() {
    if (!this._canLoad) return;

    const sourceUrl = this._sourceUrl;

    if (this._awarenessOff) {
      this._awarenessOff();
      this._awarenessOff = null;
    }
    if (this._wsProvider) {
      this._wsProvider.disconnect({ data: 'Path changed' });
      this._wsProvider = undefined;
    }
    this._ydoc = null;
    this.dispatchEvent(new CustomEvent('da-collab-users', { bubbles: true, composed: true, detail: { users: [] } }));
    if (this._proseEl && this._proseEl.parentNode) {
      this._proseEl.remove();
    }
    this._proseEl = null;
    this._view = null;
    this._teardownController();
    this._error = null;
    this._loading = true;
    this.requestUpdate();

    try {
      if (!token) {
        this._error = 'Sign in required';
        this._loading = false;
        this.requestUpdate();
        return;
      }

      const resp = await checkDoc(sourceUrl);
      if (!resp.ok && resp.status !== 404) {
        this._error = resp.status === 401 ? 'Sign in required' : `Failed to load (${resp.status})`;
        this._loading = false;
        this.requestUpdate();
        return;
      }

      const permissions = resp.permissions || ['read'];

      const setEditable = (editable) => this._setEditable(editable);
      imsAccessTokenForCollab = (await initIms())?.accessToken?.token ?? null;
      const getCollabToken = () => imsAccessTokenForCollab;
      const rerenderPage = () => {
        if (this._controllerCtx) {
          updateDocument(this._controllerCtx);
        }
        if (typeof this.onEditorHtmlChange === 'function' && this._view) {
          this.onEditorHtmlChange(getInstrumentedHTML(this._view));
        }
        if (typeof this.onBlockPositions === 'function' && this._view) {
          this.onBlockPositions(getBlockPositions(this._view));
        }
      };
      const updateCursorsCb = () => {
        if (this._controllerCtx) updateCursors(this._controllerCtx);
      };
      const getEditorCb = (data) => {
        if (this._controllerCtx) getEditor(data, this._controllerCtx);
      };
      const onSelectionChangeCb = (view) => {
        this.onActiveBlockChange?.(getActiveBlockFlatIndex(view));
      };

      const onToolbar = (toolbar) => {
        this.dispatchEvent(new CustomEvent('da-toolbar-ready', {
          bubbles: true,
          composed: true,
          detail: { toolbar },
        }));
      };

      const { proseEl, wsProvider, view, ydoc } = await initProse({
        path: sourceUrl,
        permissions,
        setEditable,
        getToken: getCollabToken,
        rerenderPage,
        updateCursors: updateCursorsCb,
        getEditor: getEditorCb,
        onSelectionChange: onSelectionChangeCb,
        withToolbar: true,
        onToolbar,
        onAddToChat: this._dispatchAddToChat,
      });

      this._proseEl = proseEl;
      this._wsProvider = wsProvider;
      this._view = view;
      this._ydoc = ydoc ?? null;
      this._setupAwarenessUpdates(wsProvider);
      this._setupController();
      // Push initial HTML and block positions. Doc can have 0 tables at first (before Y sync);
      // push again after a short delay so outline gets positions once tables exist.
      const pushOutlineState = () => {
        if (!this._view) return;
        if (typeof this.onEditorHtmlChange === 'function') {
          this.onEditorHtmlChange(getInstrumentedHTML(this._view));
        }
        if (typeof this.onBlockPositions === 'function') {
          this.onBlockPositions(getBlockPositions(this._view));
        }
      };
      requestAnimationFrame(() => pushOutlineState());
      requestAnimationFrame(() => {
        requestAnimationFrame(() => pushOutlineState());
      });
      setTimeout(() => pushOutlineState(), 200);
    } catch (e) {
      this._error = e?.message || 'Failed to load editor';
      this._proseEl = null;
      this._wsProvider = null;
      this._ydoc = null;
    }

    this._loading = false;
    this.requestUpdate();
    if (this.autoFocus && this._view && this._wsProvider) {
      const focusWhenSynced = (isSynced) => {
        if (!isSynced) return;
        this._wsProvider?.off('synced', focusWhenSynced);
        requestAnimationFrame(() => this._view?.focus());
      };
      this._wsProvider.on('synced', focusWhenSynced);
    }
  }

  focusEditor() {
    this._view?.focus();
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  updated(changed) {
    super.updated?.(changed);
    if (changed.has('org') || changed.has('repo') || changed.has('path')) {
      this._loadEditor();
    }
    if (changed.has('autoFocus') && this.autoFocus && this._view) {
      requestAnimationFrame(() => this._view?.focus());
    }
    if (changed.has('quickEditPort')) {
      if (this.quickEditPort && this._view) {
        this._setupController();
      } else if (!this.quickEditPort) {
        this._teardownController();
      }
    }
    if (changed.has('pendingMove') && this.pendingMove?.fromIndex != null && this.pendingMove?.toIndex != null) {
      if (this._view) {
        moveBlockAt(this.pendingMove, { view: this._view });
      }
      if (typeof this.onMoveBlockDone === 'function') {
        this.onMoveBlockDone();
      }
    }
    if (changed.has('pendingAddSection') && this.pendingAddSection?.sectionIndex != null) {
      if (this._view) {
        insertSectionAfter(this.pendingAddSection, { view: this._view });
      }
      if (typeof this.onAddSectionDone === 'function') {
        this.onAddSectionDone();
      }
    }
    if (changed.has('pendingAddBlock') && this.pendingAddBlock?.sectionIndex != null && (this.pendingAddBlock?.parsedNode || this.pendingAddBlock?.blockName)) {
      if (this._view) {
        insertBlockAtSection(this.pendingAddBlock, { view: this._view });
      }
      if (typeof this.onAddBlockDone === 'function') {
        this.onAddBlockDone();
      }
    }
    if (this._proseEl) {
      const mount = this.shadowRoot?.querySelector('.da-inline-editor-mount');
      if (mount && !mount.contains(this._proseEl)) {
        mount.appendChild(this._proseEl);
        // y-prosemirror's _isDomSelectionInView calls _root.createRange() and
        // _root.getSelection(), but ShadowRoot doesn't have these methods.
        // Patch them onto the shadow root so undo/_typeChanged works correctly.
        const sr = this.shadowRoot;
        if (sr && !sr.createRange) sr.createRange = () => document.createRange();
        if (sr && !sr.getSelection) sr.getSelection = () => document.getSelection();
      }
    }
  }

  disconnectedCallback() {
    this._teardownController();
    if (this._awarenessOff) {
      this._awarenessOff();
      this._awarenessOff = null;
    }
    if (this._wsProvider) {
      this._wsProvider.disconnect({ data: 'Component unmount' });
      this._wsProvider = undefined;
    }
    this._proseEl = null;
    this._view = null;
    this._ydoc = null;
    super.disconnectedCallback();
  }

  render() {
    if (!this.org || !this.repo) {
      return html`
        <div class="da-inline-editor">
          <div class="da-inline-editor-placeholder">
            Set hash to <code>#/org/site</code> and select a file to edit.
          </div>
        </div>
      `;
    }

    if (!this.path) {
      return html`
        <div class="da-inline-editor">
          <div class="da-inline-editor-placeholder">
            Select a file to edit.
          </div>
        </div>
      `;
    }

    if (this._error) {
      return html`
        <div class="da-inline-editor">
          <div class="da-inline-editor-error">${this._error}</div>
        </div>
      `;
    }

    if (this._loading) {
      return html`
        <div class="da-inline-editor">
          <div class="da-inline-editor-placeholder">Loading editor…</div>
        </div>
      `;
    }

    return html`
      <div class="da-inline-editor">
        <div class="da-inline-editor-mount"></div>
      </div>
    `;
  }
}

customElements.define('da-inline-editor', DaInlineEditor);
