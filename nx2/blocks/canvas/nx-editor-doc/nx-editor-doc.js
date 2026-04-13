import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';
import { updateDocument, updateCursors } from '../nx-editor-wysiwyg/utils/document.js';
import { getEditor } from '../nx-editor-wysiwyg/utils/state.js';
import {
  editorDocCanLoad,
  sourceUrlFromEditorCtx,
  controllerPathnameFromEditorCtx,
  editorDocRenderPhase,
} from './utils/ctx.js';
import { subscribeCollabUserList } from './utils/awareness-users.js';
import {
  prefetchWysiwygCookiesIfSignedIn,
  createQuickEditGetToken,
  buildQuickEditControllerCtx,
  wireQuickEditControllerPort,
} from './utils/quick-edit-host.js';
import { resolveEditorDocSession, createProseEditorInstance } from './utils/load-editor-doc.js';
import { afterNextPaint, ensureProseMountedInShadow } from './utils/shadow-mount.js';
import { teardownEditorDocResources } from './utils/teardown.js';

const style = await loadStyle(import.meta.url);

export class NxEditorDoc extends LitElement {
  static properties = {
    ctx: { type: Object },
    quickEditPort: { type: Object },
    _error: { state: true },
  };

  willUpdate(changed) {
    super.willUpdate(changed);
    if (changed.has('ctx')) {
      this._teardown();
      this._error = undefined;
    }
  }

  _clearControllerPort() {
    if (this._controllerCtx?.port) {
      this._controllerCtx.port.onmessage = null;
    }
    this._controllerCtx = undefined;
  }

  _emitCollabUsers(users) {
    this.dispatchEvent(new CustomEvent('da-collab-users', {
      bubbles: true,
      composed: true,
      detail: { users },
    }));
  }

  _setupController() {
    if (!this.quickEditPort || !this._view || !this._wsProvider) return;
    if (this._controllerCtx?.port === this.quickEditPort) return;

    this._clearControllerPort();
    prefetchWysiwygCookiesIfSignedIn(this.ctx);

    const { org, repo } = this.ctx ?? {};
    const getToken = createQuickEditGetToken();
    this._controllerCtx = buildQuickEditControllerCtx({
      view: this._view,
      wsProvider: this._wsProvider,
      port: this.quickEditPort,
      owner: org,
      repo,
      pathname: controllerPathnameFromEditorCtx(this.ctx),
      getToken,
    });
    wireQuickEditControllerPort(this._controllerCtx);
  }

  _setupAwareness(wsProvider) {
    if (this._awarenessOff) {
      this._awarenessOff();
      this._awarenessOff = undefined;
    }
    this._awarenessOff = subscribeCollabUserList(wsProvider, (users) => {
      this._emitCollabUsers(users);
    });
  }

  _setEditable(editable) {
    this.requestUpdate();
    afterNextPaint(() => {
      const pm = this.shadowRoot?.querySelector('.nx-editor-doc-mount .ProseMirror');
      if (pm) pm.contentEditable = editable ? 'true' : 'false';
    });
  }

  _teardown() {
    teardownEditorDocResources({
      clearPortHandler: () => this._clearControllerPort(),
      awarenessOff: this._awarenessOff,
      wsProvider: this._wsProvider,
      view: this._view,
      proseEl: this._proseEl,
      onCollabUsersCleared: () => this._emitCollabUsers([]),
    });
    this._awarenessOff = undefined;
    this._wsProvider = undefined;
    this._view = undefined;
    this._ydoc = undefined;
    this._proseEl = undefined;
  }

  async _loadEditor() {
    if (!editorDocCanLoad(this.ctx)) {
      this.requestUpdate();
      return;
    }

    const sourceUrl = sourceUrlFromEditorCtx(this.ctx);
    this._teardown();
    this._error = undefined;
    this.requestUpdate();

    const session = await resolveEditorDocSession(sourceUrl);
    if (!session.ok) {
      this._error = session.error;
      this.requestUpdate();
      return;
    }

    try {
      const trackingCallbacks = {
        rerenderPage: () => {
          if (this._controllerCtx) updateDocument(this._controllerCtx);
        },
        updateCursorsCb: () => {
          if (this._controllerCtx) updateCursors(this._controllerCtx);
        },
        getEditorCb: (data) => {
          if (this._controllerCtx) getEditor(data, this._controllerCtx);
        },
        onSelectionChangeCb: () => {},
      };

      const { proseEl, wsProvider, view, ydoc } = await createProseEditorInstance({
        sourceUrl,
        permissions: session.permissions,
        token: session.token,
        setEditable: (editable) => this._setEditable(editable),
        trackingCallbacks,
      });

      this._proseEl = proseEl;
      this._wsProvider = wsProvider;
      this._view = view;
      this._ydoc = ydoc;
      this._setupAwareness(wsProvider);
      this._setupController();
    } catch (e) {
      this._error = e?.message || 'Failed to load editor';
      this._proseEl = undefined;
      this._wsProvider = undefined;
      this._view = undefined;
      this._ydoc = undefined;
    }

    this.requestUpdate();
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  disconnectedCallback() {
    this._teardown();
    super.disconnectedCallback();
  }

  updated(changed) {
    super.updated(changed);
    if (changed.has('ctx')) {
      this._loadEditor();
    }
    if (changed.has('quickEditPort')) {
      if (this.quickEditPort && this._view) {
        this._setupController();
      } else if (!this.quickEditPort) {
        this._clearControllerPort();
      }
    }
    if (this._proseEl) {
      ensureProseMountedInShadow({ shadowRoot: this.shadowRoot, proseEl: this._proseEl });
    }
  }

  render() {
    const phase = editorDocRenderPhase(this.ctx, {
      error: this._error,
      hasEditorView: Boolean(this._view),
    });
    if (phase === 'incomplete') {
      return html`
        <div class="nx-editor-doc">
          <div class="nx-editor-doc-placeholder">
            Set hash to <code>#/org/site</code> and open an HTML file to edit.
          </div>
        </div>
      `;
    }
    if (phase === 'error') {
      return html`
        <div class="nx-editor-doc">
          <div class="nx-editor-doc-error">${this._error}</div>
        </div>
      `;
    }
    if (phase === 'loading') {
      return nothing;
    }
    return html`
      <div class="nx-editor-doc">
        <div class="nx-editor-doc-mount"></div>
      </div>
    `;
  }
}

customElements.define('nx-editor-doc', NxEditorDoc);
