import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';
import { updateDocument, updateCursors } from '../editor-utils/document.js';
import { getEditor } from '../editor-utils/state.js';
import {
  editorDocCanLoad,
  sourceUrlFromEditorCtx,
  controllerPathnameFromEditorCtx,
  editorDocRenderPhase,
} from './utils/ctx.js';
import { subscribeCollabUserList } from './utils/awareness-users.js';
import {
  prefetchWysiwygCookiesIfSignedIn,
  wireQuickEditControllerPort,
} from './utils/quick-edit-host.js';
import { loadIms } from '../../../utils/ims.js';
import initProse from './prose.js';
import { createTrackingPlugin } from '../editor-utils/prose-diff.js';
import { resolveEditorDocSession } from './utils/load-editor-doc.js';
import { afterNextPaint, ensureProseMountedInShadow } from './utils/shadow-mount.js';
import { teardownEditorDocResources } from './utils/teardown.js';
import { hideSelectionToolbar } from '../editor-utils/selection-toolbar.js';
import { createExtensionsBridgePlugin } from '../editor-utils/extensions-bridge.js';

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
      this.quickEditPort = undefined;
      this._teardown();
      this._error = undefined;
    }
  }

  _clearControllerPort() {
    const port = this._controllerCtx?.port;
    if (port) {
      port.onmessage = null;
      port.close();
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
    const { view, wsProvider } = this._proseContext ?? {};
    if (!this.quickEditPort || !view || !wsProvider) return;
    if (this._controllerCtx?.port === this.quickEditPort) return;

    this._clearControllerPort();
    prefetchWysiwygCookiesIfSignedIn(this.ctx);

    const { org, repo } = this.ctx ?? {};
    this._controllerCtx = {
      view,
      wsProvider,
      port: this.quickEditPort,
      iframe: this._wysiwygIframe,
      suppressRerender: false,
      owner: org,
      repo,
      path: controllerPathnameFromEditorCtx(this.ctx),
      getToken: async () => (await loadIms())?.accessToken?.token ?? null,
    };
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
    const { wsProvider, view, proseEl } = this._proseContext ?? {};
    teardownEditorDocResources({
      clearPortHandler: () => this._clearControllerPort(),
      awarenessOff: this._awarenessOff,
      wsProvider,
      view,
      proseEl,
      onCollabUsersCleared: () => this._emitCollabUsers([]),
    });
    this._awarenessOff = undefined;
    this._proseContext = undefined;
  }

  async _loadEditor() {
    if (!editorDocCanLoad(this.ctx)) {
      return;
    }

    const sourceUrl = sourceUrlFromEditorCtx(this.ctx);

    const session = await resolveEditorDocSession(sourceUrl);
    if (!session.ok) {
      this._error = session.error;
      return;
    }

    try {
      const { token, permissions } = session;
      const { proseEl, wsProvider, view, ydoc } = await initProse({
        path: sourceUrl,
        permissions,
        setEditable: (editable) => this._setEditable(editable),
        getToken: () => token,
        extraPlugins: [
          createExtensionsBridgePlugin(),
          // controllerCtx is only initialized after setupController
          createTrackingPlugin(
            () => { if (this._controllerCtx) updateDocument(this._controllerCtx); },
            () => { if (this._controllerCtx) updateCursors(this._controllerCtx); },
            (data) => { if (this._controllerCtx) getEditor(data, this._controllerCtx); },
          ),
        ],
      });

      this._proseContext = { proseEl, wsProvider, view, ydoc };
      this._setupAwareness(wsProvider);

      this._setupController();
    } catch (e) {
      this._error = e?.message || 'Failed to load editor';
      this._proseContext = undefined;
      return;
    }

    this.requestUpdate();
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._onCanvasEditorActive = (e) => {
      const view = e.detail?.view === 'content' ? 'content' : 'layout';
      this.hidden = view !== 'content';
      hideSelectionToolbar();
    };
    this.parentElement?.addEventListener('nx-canvas-editor-active', this._onCanvasEditorActive);
    this._onWysiwygPortReady = (e) => {
      const { port, iframe } = e.detail ?? {};
      if (port) {
        this._wysiwygIframe = iframe;
        this.quickEditPort = port;
      }
    };
    this.parentElement?.addEventListener('nx-wysiwyg-port-ready', this._onWysiwygPortReady);
  }

  disconnectedCallback() {
    this.parentElement?.removeEventListener('nx-canvas-editor-active', this._onCanvasEditorActive);
    this.parentElement?.removeEventListener('nx-wysiwyg-port-ready', this._onWysiwygPortReady);
    this._teardown();
    super.disconnectedCallback();
  }

  updated(changed) {
    super.updated(changed);
    if (changed.has('ctx')) {
      this._loadEditor();
    }
    if (changed.has('quickEditPort')) {
      if (this.quickEditPort && this._proseContext?.view) {
        this._setupController();
      } else if (!this.quickEditPort) {
        this._clearControllerPort();
      }
    }
    const { proseEl } = this._proseContext ?? {};
    if (proseEl) {
      ensureProseMountedInShadow({ shadowRoot: this.shadowRoot, proseEl });
    }
  }

  render() {
    const phase = editorDocRenderPhase(this.ctx, {
      error: this._error,
      hasEditorView: Boolean(this._proseContext?.view),
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
