import { LitElement, html, nothing } from 'da-lit';
import { loadStyle, hashChange } from '../../utils/utils.js';
import { loadHrefSvg, ICONS_BASE } from '../../utils/svg.js';
import { getPanelStore, openPanel } from '../../utils/panel.js';
import { listFolder } from '../../utils/daFiles.js';
import { contextToPathContext, isFolder } from './utils.js';
import { open } from './actions/open/open.js';
import './actions/rename/rename.js';
import './actions/delete/delete.js';
import './actions/deploy/deploy.js';
import '../shared/breadcrumb/breadcrumb.js';
import {
  VARIANT_ERROR,
  VARIANT_SUCCESS,
  showNxToast,
} from '../shared/toast/toast.js';
import './list/list.js';
import './action-bar/action-bar.js';

const styles = await loadStyle(import.meta.url);
const panelIcon = await loadHrefSvg(`${ICONS_BASE}S2_Icon_SplitLeft_20_N.svg`);

const documentLayoutStyles = await loadStyle(
  new URL('overrides.css', import.meta.url).href,
);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, documentLayoutStyles];

/** @param {{ title?: string, body?: string }} m */
function browseActionErrorToastText(m) {
  if (!m || typeof m !== 'object') return 'Something went wrong.';
  const body = typeof m.body === 'string' ? m.body.trim() : '';
  if (body) return body;
  const title = typeof m.title === 'string' ? m.title.trim() : '';
  return title || 'Something went wrong.';
}

class NxBrowse extends LitElement {
  static properties = {
    _items: { state: true },
    _listError: { state: true },
    _selectedKeys: { state: true },
    /** @type {null | { type: 'rename'|'delete'|'deploy', [key: string]: unknown }} */
    _dialog: { state: true },
    _actionBarDisabled: { state: true },
  };

  set context(value) {
    this._explicitContext = true;
    this._context = value;
    this.requestUpdate();
    if (this.isConnected) {
      this._syncList();
    }
  }

  _openPanel(position) {
    this.dispatchEvent(new CustomEvent('nx-browse-open-panel', {
      bubbles: true,
      composed: true,
      detail: { position },
    }));
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    this._unsubscribeHash = hashChange.subscribe((hashState) => {
      if (!this._explicitContext) {
        this._context = hashState;
        this._syncList();
      }
    });
    if (this._explicitContext && this._context) {
      this._syncList();
    }
  }

  disconnectedCallback() {
    this._unsubscribeHash?.();
    this._dialog = null;
    this._actionBarDisabled = false;
    super.disconnectedCallback();
  }

  get _pathContext() {
    return contextToPathContext(this._context);
  }

  _openBrowseDialog(spec) {
    this._dialog = spec;
    this._actionBarDisabled = true;
    this.requestUpdate();
  }

  _clearDialog() {
    this._dialog = null;
    this._actionBarDisabled = false;
    this.requestUpdate();
  }

  async _syncList() {
    const ctx = this._pathContext;
    if (!ctx) {
      this._items = undefined;
      this._listError = undefined;
      this.requestUpdate();
      return;
    }

    const { fullpath } = ctx;
    const result = await listFolder(fullpath);

    if ('error' in result) {
      this._items = undefined;
      this._listError = result.error;
    } else {
      this._listError = undefined;
      this._items = result;
    }
    this.requestUpdate();
  }

  _onBrowseSelectionChange(event) {
    this._selectedKeys = event.detail.selectedKeys;
  }

  _onBrowseSelectionAction = async ({ action }) => {
    const ctx = this._pathContext;
    const items = this._items;
    const paths = this._selectedKeys || [];
    if (!ctx || !items?.length || !paths.length || this._actionBarDisabled) {
      return;
    }
    if (action === 'delete') {
      const selectedRows = paths.map((p) => items.find((i) => i.path === p)).filter(Boolean);
      if (!selectedRows.length) return;
      this._openBrowseDialog({ type: 'delete', selectedRows });
      return;
    }
    if (action === 'rename') {
      if (paths.length !== 1) return;
      const selectedRow = items.find((i) => i.path === paths[0]);
      if (!selectedRow) return;
      this._openBrowseDialog({ type: 'rename', selectedRow });
      return;
    }
    if (action === 'preview' || action === 'publish') {
      if (paths.length !== 1) return;
      const selectedRow = items.find((i) => i.path === paths[0]);
      if (!selectedRow || isFolder(selectedRow)) return;
      this._openBrowseDialog({ type: 'deploy', action, selectedRow });
    }
  };

  _onBrowseActionComplete = (detail) => {
    if (detail?.success) {
      const dialog = this._dialog;
      this._clearDialog();
      this._onBrowseSelectionDismiss();
      this._syncList().catch(() => { });
      if (dialog?.type === 'rename') {
        showNxToast({
          text: 'The resource was renamed.',
          variant: VARIANT_SUCCESS,
        });
      } else if (dialog?.type === 'delete') {
        const n = Array.isArray(dialog.selectedRows) ? dialog.selectedRows.length : 0;
        showNxToast({
          text: n > 1 ? 'The selected resources were deleted.' : 'The resource was deleted.',
          variant: VARIANT_SUCCESS,
        });
      } else if (dialog?.type === 'deploy') {
        showNxToast({
          text: dialog.action === 'publish'
            ? 'Publish completed.'
            : 'Preview completed.',
          variant: VARIANT_SUCCESS,
        });
      }
      return;
    }
    if (detail?.message) {
      showNxToast({
        text: browseActionErrorToastText(detail.message),
        variant: VARIANT_ERROR,
      });
      this._clearDialog();
      return;
    }
    this._clearDialog();
  };

  _onBrowseSelectionDismiss = () => {
    this.shadowRoot?.querySelector('nx-browse-list')?.clearSelection();
  };

  _onBrowseActivate(event) {
    open({ item: event.detail.item });
  }

  render() {
    const ctx = this._pathContext;

    const bar = html`
      <div class="browse-bar">
        <button
          type="button"
          part="toggle-before"
          class="browse-panel-toggle"
          aria-label="Open panel"
          @click=${() => this._openPanel('before')}
        >${panelIcon ?? nothing}</button>
      </div>
    `;

    if (!ctx) {
      return html`
        ${bar}
        <div class="browse-hint" role="status">
          <p class="browse-hint-title">Nothing to show here yet</p>
          <p class="browse-hint-detail">
            Choose a site or folder from your workspace to see files in this list.
          </p>
        </div>
      `;
    }

    const title = ctx.pathSegments.at(-1) ?? '';

    if (!this._listError && this._items === undefined) {
      return bar;
    }

    const selectionCount = this._selectedKeys?.length ?? 0;
    const showActionBar = selectionCount > 0;
    const paths = this._selectedKeys || [];
    const sole = paths.length === 1 ? this._items?.find((i) => i.path === paths[0]) : undefined;
    const showDeploy = !!sole && !isFolder(sole);
    const showRename = selectionCount === 1;
    const showDelete = selectionCount > 0;
    const header = html`
      <div class="browse-header">
        <div class="browse-title-bar">
          <h1 class="browse-title">${title}</h1>
        </div>
        ${showActionBar
        ? html`
              <nx-browse-action-bar
                .count=${selectionCount}
                .showDelete=${showDelete}
                .showRename=${showRename}
                .showDeploy=${showDeploy}
                .disabled=${this._actionBarDisabled}
                .onDismiss=${this._onBrowseSelectionDismiss}
                .onAction=${this._onBrowseSelectionAction}
              ></nx-browse-action-bar>
            `
        : html`<nx-breadcrumb .pathSegments=${ctx.pathSegments}></nx-breadcrumb>`}
      </div>
    `;

    if (this._listError) {
      return html`
        ${bar}
        ${header}
        <div class="browse-hint browse-hint-error" role="alert">
          <p class="browse-hint-title">Could not load this folder</p>
          <p class="browse-hint-detail">${this._listError}</p>
        </div>
      `;
    }

    const dialog = this._dialog;
    return html`
      ${bar}
      ${header}
      <nx-browse-list
        .items=${this._items}
        .folderKey=${ctx.fullpath}
        @nx-browse-activate=${this._onBrowseActivate}
        @nx-browse-selection-change=${this._onBrowseSelectionChange}
      ></nx-browse-list>
      ${dialog?.type === 'rename'
        ? html`
            <nx-browse-rename-dialog
              .selectedRow=${dialog.selectedRow}
              .onComplete=${this._onBrowseActionComplete}
            ></nx-browse-rename-dialog>
          `
        : nothing}
      ${dialog?.type === 'delete'
        ? html`
            <nx-browse-delete-dialog
              .selectedRows=${dialog.selectedRows}
              .onComplete=${this._onBrowseActionComplete}
            ></nx-browse-delete-dialog>
          `
        : nothing}
      ${dialog?.type === 'deploy'
        ? html`
            <nx-browse-deploy-dialog
              .selectedRow=${dialog.selectedRow}
              .action=${dialog.action}
              .onComplete=${this._onBrowseActionComplete}
            ></nx-browse-deploy-dialog>
          `
        : nothing}
    `;
  }
}

customElements.define('nx-browse', NxBrowse);

export default function decorate(block) {
  block.textContent = '';
  const browse = document.createElement('nx-browse');
  block.append(browse);

  const openBrowseChatPanel = () => {
    const store = getPanelStore();
    const width = store.before?.width ?? '400px';
    openPanel({
      position: 'before',
      width,
      getContent: async () => {
        await import('../chat/chat.js');
        return document.createElement('nx-chat');
      },
    });
  };

  browse.addEventListener('nx-browse-open-panel', (e) => {
    if (e.detail.position === 'before') openBrowseChatPanel();
  });

  const store = getPanelStore();
  if (store.before) openBrowseChatPanel();
}
