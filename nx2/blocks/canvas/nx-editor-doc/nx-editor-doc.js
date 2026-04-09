import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';
import { buildSourceUrl, checkDoc } from './utils/source.js';
import {
  createControllerOnMessage,
  updateDocument,
  updateCursors,
  getEditor,
} from '../nx-editor-wysiwyg/quick-edit-controller.js';
import { fetchWysiwygCookie } from '../nx-editor-wysiwyg/utils/preview.js';

const style = await loadStyle(import.meta.url);

function afterRender(cb) {
  Promise.resolve().then(() => requestAnimationFrame(cb));
}

export class NxEditorDoc extends LitElement {
  static properties = {
    org: { type: String },
    repo: { type: String },
    path: { type: String },
    /** @type {MessagePort | null} Port from nx-editor-wysiwyg (controller side). */
    quickEditPort: { type: Object },
    _loading: { state: true },
    _error: { state: true },
  };

  constructor() {
    super();
    this.org = '';
    this.repo = '';
    this.path = '';
    this.quickEditPort = null;
    this._loading = false;
    this._error = null;
    /** @type {HTMLElement | null} */
    this._proseEl = null;
    this._wsProvider = null;
    this._view = null;
    /** @type {import('yjs').Doc | null} */
    this._ydoc = null;
    this._awarenessOff = null;
    /** @type {object | null} */
    this._controllerCtx = null;
  }

  get _sourceUrl() {
    return buildSourceUrl(this.path);
  }

  get _canLoad() {
    return Boolean(this.org && this.repo && this.path && this._sourceUrl);
  }

  /** Page pathname for quick-edit controller (path without org/repo, leading slash, no .html). */
  get _controllerPathname() {
    if (!this.path || typeof this.path !== 'string') return '/';
    const segments = this.path.replace(/^\//, '').split('/').filter(Boolean);
    const withoutOrgRepo = segments.slice(2).join('/').replace(/\.html$/i, '');
    return withoutOrgRepo ? `/${withoutOrgRepo}` : '/';
  }

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

    const getToken = async () => {
      const { loadIms } = await import('../../../utils/ims.js');
      return (await loadIms())?.accessToken?.token ?? null;
    };

    (async () => {
      const token = await getToken();
      if (token) {
        await fetchWysiwygCookie({ org: this.org, repo: this.repo, token }).catch(() => {});
      }
    })().catch(() => {});

    this._controllerCtx = {
      view: this._view,
      wsProvider: this._wsProvider,
      port: this.quickEditPort,
      suppressRerender: false,
      owner: this.org,
      repo: this.repo,
      path: this._controllerPathname,
      getToken,
    };

    this.quickEditPort.onmessage = createControllerOnMessage(this._controllerCtx);

    const sendInitialBody = () => {
      if (!this._controllerCtx?.port) return;
      updateDocument(this._controllerCtx);
      updateCursors(this._controllerCtx);
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(sendInitialBody);
    });
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  _setEditable(editable) {
    this.requestUpdate();
    afterRender(() => {
      const pm = this.shadowRoot?.querySelector('.nx-editor-doc-mount .ProseMirror');
      if (pm) pm.contentEditable = editable ? 'true' : 'false';
    });
  }

  _teardown() {
    this._teardownController();
    if (this._awarenessOff) {
      this._awarenessOff();
      this._awarenessOff = null;
    }
    if (this._wsProvider) {
      this._wsProvider.disconnect({ data: 'unmount' });
      this._wsProvider = undefined;
    }
    if (this._view) {
      this._view.destroy();
      this._view = null;
    }
    this._ydoc = null;
    if (this._proseEl?.parentNode) {
      this._proseEl.remove();
    }
    this._proseEl = null;
    this.dispatchEvent(new CustomEvent('da-collab-users', {
      bubbles: true,
      composed: true,
      detail: { users: [] },
    }));
  }

  /**
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
    if (!this._canLoad) {
      this._teardown();
      this._error = null;
      this._loading = false;
      this.requestUpdate();
      return;
    }

    const sourceUrl = this._sourceUrl;
    this._teardown();
    this._error = null;
    this._loading = true;
    this.requestUpdate();

    try {
      const { loadIms } = await import('../../../utils/ims.js');
      const ims = await loadIms();
      const token = ims?.accessToken?.token ?? null;
      if (ims?.anonymous || !token) {
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
      const getToken = () => token;

      const rerenderPage = () => {
        if (this._controllerCtx) {
          updateDocument(this._controllerCtx);
        }
      };
      const updateCursorsCb = () => {
        if (this._controllerCtx) updateCursors(this._controllerCtx);
      };
      const getEditorCb = (data) => {
        if (this._controllerCtx) getEditor(data, this._controllerCtx);
      };
      const onSelectionChangeCb = () => {};

      const [{ default: initProse }, { createTrackingPlugin }] = await Promise.all([
        import('./prose.js'),
        import('../nx-editor-wysiwyg/utils/prose-diff.js'),
      ]);

      const extraPlugins = [
        createTrackingPlugin(rerenderPage, updateCursorsCb, getEditorCb, onSelectionChangeCb),
      ];

      const { proseEl, wsProvider, view, ydoc } = await initProse({
        path: sourceUrl,
        permissions,
        setEditable,
        getToken,
        extraPlugins,
      });

      this._proseEl = proseEl;
      this._wsProvider = wsProvider;
      this._view = view;
      this._ydoc = ydoc;
      this._setupAwarenessUpdates(wsProvider);
      this._setupController();
    } catch (e) {
      this._error = e?.message || 'Failed to load editor';
      this._proseEl = null;
      this._wsProvider = null;
      this._view = null;
      this._ydoc = null;
    }

    this._loading = false;
    this.requestUpdate();
  }

  updated(changed) {
    super.updated(changed);
    if (changed.has('org') || changed.has('repo') || changed.has('path')) {
      this._loadEditor();
    }
    if (changed.has('quickEditPort')) {
      if (this.quickEditPort && this._view) {
        this._setupController();
      } else if (!this.quickEditPort) {
        this._teardownController();
      }
    }
    if (this._proseEl) {
      const mount = this.shadowRoot?.querySelector('.nx-editor-doc-mount');
      if (mount && !mount.contains(this._proseEl)) {
        mount.appendChild(this._proseEl);
        const sr = this.shadowRoot;
        if (sr && !sr.createRange) sr.createRange = () => document.createRange();
        if (sr && !sr.getSelection) sr.getSelection = () => document.getSelection();
      }
    }
  }

  disconnectedCallback() {
    this._teardown();
    super.disconnectedCallback();
  }

  render() {
    if (!this.org || !this.repo) {
      return html`
        <div class="nx-editor-doc">
          <div class="nx-editor-doc-placeholder">
            Set hash to <code>#/org/site</code> and open an HTML file to edit.
          </div>
        </div>
      `;
    }

    if (!this.path) {
      return html`
        <div class="nx-editor-doc">
          <div class="nx-editor-doc-placeholder">Select an HTML file to edit.</div>
        </div>
      `;
    }

    if (this._error) {
      return html`
        <div class="nx-editor-doc">
          <div class="nx-editor-doc-error">${this._error}</div>
        </div>
      `;
    }

    return this._loading ? nothing : html`
      <div class="nx-editor-doc">
        <div class="nx-editor-doc-mount"></div>
      </div>
    `;
  }
}

customElements.define('nx-editor-doc', NxEditorDoc);
