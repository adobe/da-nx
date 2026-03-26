// eslint-disable-next-line import/no-unresolved
import getStyle from 'https://da.live/nx/utils/styles.js';
// eslint-disable-next-line import/no-unresolved
import { LitElement, html } from 'da-lit';
// eslint-disable-next-line import/no-unresolved
import { getNx } from 'https://da.live/scripts/utils.js';
import { initIms, daFetch } from '../../../utils/daFetch.js';
// eslint-disable-next-line import/no-unresolved
import './chat.js';
// eslint-disable-next-line import/no-unresolved
import './file-browser.js';
// eslint-disable-next-line import/no-unresolved
import './page-outline.js';
import './da-inline-editor.js';
import './file-history.js';
import './page-metadata.js';
import { DA_BULK_AEM_OPEN } from './bulk-aem-modal.js';
import { getPreviewOrigin } from './preview-origin.js';

const style = await getStyle(import.meta.url);
const nxBase = getNx();

const AEM_ORIGIN = 'https://admin.hlx.page';

function isHtmlPath(path) {
  return typeof path === 'string' && path.toLowerCase().trim().endsWith('.html');
}

/**
 * POST to AEM admin to preview or publish. Same contract as da-title in da-live.
 * @param {string} path - Full pathname e.g. /org/site/path/to/page
 * @param {'preview'|'live'} action
 * @returns {Promise<{ preview?: { url: string }, live?: { url: string }, error?: object }>}
 */
async function saveToAem(path, action) {
  const [owner, repo, ...parts] = path.slice(1).toLowerCase().split('/');
  const aemPath = parts.join('/');
  const url = `${AEM_ORIGIN}/${action}/${owner}/${repo}/main/${aemPath}`;
  const ims = await initIms();
  const bearer = ims?.accessToken?.token ? `Bearer ${ims.accessToken.token}` : '';
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      ...(bearer ? { Authorization: bearer, 'x-content-source-authorization': bearer } : {}),
    },
  });
  if (!resp.ok) {
    const xError = resp.headers.get('x-error');
    return { error: { status: resp.status, message: xError || resp.statusText } };
  }
  return resp.json();
}

/**
 * Parse hash to get org and repo. Hash format: #/org/site or #/org/site/path
 * @returns {{ org: string, repo: string } | null}
 */
function getOrgRepoFromHash() {
  const hash = window.location.hash || '';
  const path = hash.replace(/^#\/?/, '').trim();
  if (!path) return null;
  const pathSegments = path.split('/').filter(Boolean);
  if (pathSegments.length < 2) return null;
  return { org: pathSegments[0], repo: pathSegments[1] };
}

class Space extends LitElement {
  static properties = {
    projects: { type: Array },
    _selectedPath: { state: true },
    _orgRepo: { state: true },
    _sidebarTab: { state: true },
    _viewMode: { state: true },
    _chatOpen: { state: true },
    _detailsOpen: { state: true },
    _publishLoading: { state: true },
    _collabUsers: { state: true },
    _quickEditPort: { state: true },
    _wysiwygCookieReady: { state: true },
    _outlineHtml: { state: true },
    _blockPositions: { state: true },
    _activeBlockIndex: { state: true },
    _pendingMove: { state: true },
    _pendingAddSection: { state: true },
    _pendingAddBlock: { state: true },
    _chatContextItems: { state: true },
    _docToolbar: { state: true },
  };

  constructor() {
    super();
    this.projects = [];
    this._selectedPath = '';
    this._orgRepo = null;
    this._outlineHtml = '';
    this._blockPositions = [];
    this._activeBlockIndex = -1;
    this._pendingMove = null;
    this._chatContextItems = [];
    this._pendingAddSection = null;
    this._pendingAddBlock = null;
    this._sidebarTab = sessionStorage.getItem('da-nx-sidebar-tab') || 'files';
    this._viewMode = sessionStorage.getItem('da-nx-view-mode') || 'wysiwyg';
    this._chatOpen = true;
    this._detailsOpen = true;
    this._publishLoading = false;
    this._collabUsers = [];
    this._quickEditPort = null;
    this._wysiwygCookieReady = false;
    this._wysiwygCookieRequestKey = null;
    this._docToolbar = null;
  }

  _onDocToolbarReady = (e) => {
    this._docToolbar = e.detail.toolbar ?? null;
  };

  _onBulkAemOpen = (e) => {
    const { files, mode } = e.detail ?? {};
    const modal = this.shadowRoot?.querySelector('da-bulk-aem-modal');
    if (!modal || typeof modal.show !== 'function') return;
    modal.show(files, mode);
  };

  _boundWindowBulkAemOpen = (e) => this._onBulkAemOpen(e);

  _boundCollabUsers = (e) => {
    const users = e.detail?.users;
    this._collabUsers = Array.isArray(users) ? users : [];
  };

  _boundHashChange = () => {
    this._orgRepo = getOrgRepoFromHash();
    const hash = window.location.hash || '';
    const path = hash.replace(/^#\/?/, '').trim();
    const pathSegments = path ? path.split('/').filter(Boolean) : [];
    this._selectedPath = pathSegments.length > 2 ? path : '';
    this._outlineHtml = '';
    this._blockPositions = [];
    this._activeBlockIndex = -1;
  };

  _boundFileSelect = (e) => {
    const path = e.detail?.item?.path;
    this._selectedPath = typeof path === 'string' ? path.replace(/^\//, '') : '';
    this._outlineHtml = '';
    this._blockPositions = [];
    this._activeBlockIndex = -1;
  };

  _onEditorHtmlChange = (body) => {
    this._outlineHtml = body ?? '';
  };

  _onBlockPositions = (positions) => {
    this._blockPositions = Array.isArray(positions) ? positions : [];
  };

  _onActiveBlockChange = (index) => {
    this._activeBlockIndex = typeof index === 'number' ? index : -1;
  };

  _onOutlineMoveBlock = (e) => {
    const { fromIndex, toIndex } = e.detail ?? {};
    if (typeof fromIndex !== 'number' || typeof toIndex !== 'number') return;
    this._pendingMove = { fromIndex, toIndex };
  };

  _onMoveBlockDone = () => {
    this._pendingMove = null;
  };

  _onOutlineAddSection = (e) => {
    const { sectionIndex } = e.detail ?? {};
    if (typeof sectionIndex !== 'number') return;
    this._pendingAddSection = { sectionIndex };
  };

  _onAddSectionDone = () => {
    this._pendingAddSection = null;
  };

  _onOutlineAddBlock = (e) => {
    const { sectionIndex, parsedNode, blockName } = e.detail ?? {};
    if (typeof sectionIndex !== 'number' || (!parsedNode && !blockName)) return;
    this._pendingAddBlock = { sectionIndex, parsedNode, blockName };
  };

  _onAddBlockDone = () => {
    this._pendingAddBlock = null;
  };

  _boundQuickEditAddToChat = (e) => {
    const { payload } = e?.detail ?? {};
    if (!payload || typeof payload.proseIndex !== 'number' || typeof payload.innerText !== 'string') return;
    const next = [...(this._chatContextItems || []), payload];
    // eslint-disable-next-line no-console -- debug add-to-chat payloads
    console.log('[quick-edit-add-to-chat]', { payload, contextItemCount: next.length });
    this._chatContextItems = next;
  };

  _boundChatContextRemove = (e) => {
    const { index } = e?.detail ?? {};
    if (typeof index !== 'number' || index < 0) return;
    const list = [...(this._chatContextItems || [])];
    if (index >= list.length) return;
    list.splice(index, 1);
    this._chatContextItems = list;
  };

  _onChatMessageSent = () => {
    this._chatContextItems = [];
  };

  _getRevertSnapshotAemHtml = (toolInput) => {
    const editor = this.shadowRoot?.querySelector('da-inline-editor');
    if (!editor || typeof editor.getRevertSnapshotAemHtml !== 'function') return null;
    return editor.getRevertSnapshotAemHtml(toolInput);
  };

  _onRevertCollabDoc = (detail) => {
    const editor = this.shadowRoot?.querySelector('da-inline-editor');
    if (!editor || typeof editor.applyRevertSnapshotAemHtml !== 'function') return;
    editor.applyRevertSnapshotAemHtml(detail?.html ?? '');
  };

  _onViewModeChange = (e) => {
    const { selected } = e.target;
    const value = Array.isArray(selected) && selected.length > 0 ? selected[0] : 'split';
    if (value === 'doc' || value === 'wysiwyg' || value === 'split') {
      this._viewMode = value;
      sessionStorage.setItem('da-nx-view-mode', value);
    }
  };

  _onBreadcrumbFolderClick(pathKey) {
    this._detailsOpen = true;
    this._sidebarTab = 'files';
    const hash = pathKey.startsWith('/') ? pathKey : `/${pathKey}`;
    window.location.hash = `#${hash}`;
  }

  /** Folder path for "back to browse": parent if file selected, else current folder. */
  get _browseBackFolderPath() {
    const path = (this._selectedPath || '').replace(/^\//, '').trim();
    if (path) {
      const segments = path.split('/').filter(Boolean);
      if (segments.length < 2) return null; // need at least org/repo
      if (isHtmlPath(path)) {
        segments.pop();
        return segments.join('/');
      }
      return path;
    }
    if (this._orgRepo) return `${this._orgRepo.org}/${this._orgRepo.repo}`;
    return null;
  }

  _onBreadcrumbBack() {
    const folderPath = this._browseBackFolderPath;
    if (!folderPath) return;
    const search = window.location.search || '';
    const base = `${window.location.origin}/browse`;
    const href = `${base}${search}#/${folderPath}`;
    window.location.assign(href);
  }

  get _breadcrumbSegments() {
    if (this._selectedPath) {
      return this._selectedPath.split('/').filter(Boolean);
    }
    if (this._orgRepo) {
      return [this._orgRepo.org, this._orgRepo.repo];
    }
    return [];
  }

  _onWysiwygIframeLoad = (e) => {
    const iframe = e?.target;
    if (!iframe?.contentWindow || !this._orgRepo || !this._selectedPath) return;

    this._quickEditPort = null;
    if (this._quickEditInitRetryId) {
      clearInterval(this._quickEditInitRetryId);
      this._quickEditInitRetryId = null;
    }

    const { org, repo } = this._orgRepo;
    const pathWithoutOrgRepo = this._selectedPath.split('/').slice(2).join('/').replace(/\.html$/i, '');
    const pathname = pathWithoutOrgRepo ? `/${pathWithoutOrgRepo}` : '/';

    const config = {
      mountpoint: `${getPreviewOrigin(org, repo)}/${org}/${repo}`,
    };
    const location = { pathname };

    const QUICK_EDIT_INIT_INTERVAL_MS = 400;
    const QUICK_EDIT_INIT_MAX_ATTEMPTS = 25;

    const trySendInit = () => {
      const { port1, port2 } = new MessageChannel();

      port1.onmessage = (ev) => {
        if (ev.data?.ready !== true) return;
        if (this._quickEditInitRetryId) {
          clearInterval(this._quickEditInitRetryId);
          this._quickEditInitRetryId = null;
        }
        this._quickEditPort = port1;
      };

      try {
        const targetOrigin = new URL(iframe.src).origin;
        iframe.contentWindow.postMessage({ init: config, location }, targetOrigin, [port2]);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[da-space] Error posting init to WYSIWYG iframe', err);
      }
    };

    let attempts = 0;
    trySendInit();
    this._quickEditInitRetryId = setInterval(() => {
      attempts += 1;
      if (attempts >= QUICK_EDIT_INIT_MAX_ATTEMPTS) {
        clearInterval(this._quickEditInitRetryId);
        this._quickEditInitRetryId = null;
        return;
      }
      if (this._quickEditPort != null) {
        clearInterval(this._quickEditInitRetryId);
        this._quickEditInitRetryId = null;
        return;
      }
      trySendInit();
    }, QUICK_EDIT_INIT_INTERVAL_MS);
  };

  _onWysiwygIframeError = () => {
    // eslint-disable-next-line no-console
    console.error('[da-space] WYSIWYG iframe error', this._wysiwygIframeSrc);
  };

  /**
   * Fetches gimme_cookie for the preview domain so the iframe can load with auth.
   * @param {string} requestKey - `${org}/${repo}` to ignore stale responses
   * @returns {Promise<void>}
   */
  async _fetchWysiwygCookie(requestKey) {
    if (!this._orgRepo || requestKey !== this._wysiwygCookieRequestKey) return;
    const { org, repo } = this._orgRepo;
    const url = `${getPreviewOrigin(org, repo)}/gimme_cookie`;
    const resp = await daFetch(url, {
      method: 'GET',
      credentials: 'include',
    });
    if (!resp.ok) {
      throw new Error(`gimme_cookie failed: ${resp.status} ${resp.statusText}`);
    }
    if (this._wysiwygCookieRequestKey === requestKey) {
      this._wysiwygCookieReady = true;
    }
  }

  /** @returns {string | null} Full path for AEM (e.g. /org/site/path) or null */
  _getPathForAem() {
    const raw = (this._selectedPath || '').replace(/^\//, '') || (this._orgRepo ? `${this._orgRepo.org}/${this._orgRepo.repo}` : '');
    if (!raw) return null;
    const path = `/${raw}`;
    const segments = path.slice(1).split('/').filter(Boolean);
    return segments.length >= 2 ? path : null;
  }

  async _onPreview() {
    const path = this._getPathForAem();
    if (!path) return;
    this._publishLoading = true;
    try {
      const json = await saveToAem(path, 'preview');
      if (json.error) {
        // eslint-disable-next-line no-console
        console.error('[da-space] Preview failed', json.error);
        return;
      }
      const href = json.preview?.url;
      if (href) window.open(`${href}?nocache=${Date.now()}`, href);
    } finally {
      this._publishLoading = false;
    }
  }

  async _onPublish() {
    const path = this._getPathForAem();
    if (!path) return;
    this._publishLoading = true;
    try {
      let json = await saveToAem(path, 'preview');
      if (json.error) {
        // eslint-disable-next-line no-console
        console.error('[da-space] Preview (before publish) failed', json.error);
        return;
      }
      json = await saveToAem(path, 'live');
      if (json.error) {
        // eslint-disable-next-line no-console
        console.error('[da-space] Publish failed', json.error);
        return;
      }
      const href = json.live?.url;
      if (href) window.open(`${href}?nocache=${Date.now()}`, href);
    } finally {
      this._publishLoading = false;
    }
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._boundHashChange();
    window.addEventListener('hashchange', this._boundHashChange);
    this.addEventListener('quick-edit-add-to-chat', this._boundQuickEditAddToChat);
    this.addEventListener('chat-context-remove', this._boundChatContextRemove);
    this.addEventListener('da-file-browser-select', this._boundFileSelect);
    this.addEventListener('da-collab-users', this._boundCollabUsers);
    this.addEventListener('da-toolbar-ready', this._onDocToolbarReady);
    window.addEventListener(DA_BULK_AEM_OPEN, this._boundWindowBulkAemOpen);
  }

  updated(changed) {
    super.updated?.(changed);
    if (this._docToolbar) {
      const host = this.shadowRoot?.querySelector('.space-editor-toolbar-host');
      if (host && !host.contains(this._docToolbar)) {
        host.appendChild(this._docToolbar);
      }
    }
    if (changed.has('_viewMode') && this._viewMode === 'split') {
      this._docToolbar = null;
    }
    if (changed.has('_viewMode') && this._viewMode !== 'split') {
      this._quickEditPort = null;
      if (this._quickEditInitRetryId) {
        clearInterval(this._quickEditInitRetryId);
        this._quickEditInitRetryId = null;
      }
    }
    if (changed.has('_selectedPath') && !isHtmlPath(this._selectedPath)) {
      if (this._sidebarTab === 'history' || this._sidebarTab === 'metadata') {
        this._sidebarTab = 'files';
        sessionStorage.setItem('da-nx-sidebar-tab', 'files');
      }
    }
    if (changed.has('_orgRepo') || changed.has('_selectedPath')) {
      if (!this._orgRepo || !this._selectedPath) {
        this._wysiwygCookieReady = false;
        this._wysiwygCookieRequestKey = null;
        return;
      }
      const { org, repo } = this._orgRepo;
      const requestKey = `${org}/${repo}`;
      this._wysiwygCookieReady = false;
      this._wysiwygCookieRequestKey = requestKey;
      this._fetchWysiwygCookie(requestKey).catch((err) => {
        this._wysiwygCookieReady = true;
        // eslint-disable-next-line no-console
        console.error('[da-space] gimme_cookie failed', err);
      });
    }
  }

  disconnectedCallback() {
    window.removeEventListener('hashchange', this._boundHashChange);
    this.removeEventListener('quick-edit-add-to-chat', this._boundQuickEditAddToChat);
    this.removeEventListener('chat-context-remove', this._boundChatContextRemove);
    this.removeEventListener('da-file-browser-select', this._boundFileSelect);
    this.removeEventListener('da-collab-users', this._boundCollabUsers);
    this.removeEventListener('da-toolbar-ready', this._onDocToolbarReady);
    window.removeEventListener(DA_BULK_AEM_OPEN, this._boundWindowBulkAemOpen);
    super.disconnectedCallback();
  }

  get _wysiwygIframeSrc() {
    if (!this._orgRepo || !this._selectedPath || !this._wysiwygCookieReady) return null;
    const { org, repo } = this._orgRepo;
    const segments = this._selectedPath.split('/');
    const pathWithoutOrgRepo = segments.slice(2).join('/');
    const pathWithoutHtml = pathWithoutOrgRepo.replace(/\.html$/i, '');
    const encodedPath = pathWithoutHtml.split('/').map(encodeURIComponent).join('/');
    const base = `${getPreviewOrigin(org, repo)}/${encodedPath}?nx=exp-workspace&quick-edit=exp-workspace`;
    return `${base}&controller=parent`;
  }

  _renderDocPane() {
    return html`
      <div class="main-pane main-pane-doc">
        <div class="main-pane-doc-editor">
          <da-inline-editor
            .org="${this._orgRepo?.org ?? ''}"
            .repo="${this._orgRepo?.repo ?? ''}"
            .path="${this._selectedPath ?? ''}"
            .autoFocus="${this._viewMode === 'doc'}"
            .quickEditPort="${this._quickEditPort ?? null}"
            .onEditorHtmlChange="${this._onEditorHtmlChange}"
            .onBlockPositions="${this._onBlockPositions}"
            .onActiveBlockChange="${this._onActiveBlockChange}"
            .pendingMove="${this._pendingMove}"
            .onMoveBlockDone="${this._onMoveBlockDone}"
            .pendingAddSection="${this._pendingAddSection}"
            .onAddSectionDone="${this._onAddSectionDone}"
            .pendingAddBlock="${this._pendingAddBlock}"
            .onAddBlockDone="${this._onAddBlockDone}"
          ></da-inline-editor>
        </div>
      </div>
    `;
  }

  _renderWysiwygPane(iframeSrc) {
    const hasPath = this._orgRepo && this._selectedPath;
    const waitingForCookie = hasPath && !this._wysiwygCookieReady;
    const placeholder = waitingForCookie
      ? html`<div class="main-pane-wysiwyg-placeholder">Loading preview…</div>`
      : html`<div class="main-pane-wysiwyg-placeholder">
          Select a file and set hash to <code>#/org/site</code> to preview.
        </div>`;
    return html`
      <div class="main-pane main-pane-wysiwyg">
        <div class="main-pane-wysiwyg-iframe-wrap">
          ${iframeSrc ? html`<iframe
            title="WYSIWYG preview"
            src="${iframeSrc}"
            allow="local-network-access"
            class="main-pane-wysiwyg-iframe"
            @load="${this._onWysiwygIframeLoad}"
            @error="${this._onWysiwygIframeError}"
          ></iframe>` : placeholder}
        </div>
      </div>
    `;
  }

  _renderMiddleContent(iframeSrc) {
    if (this._viewMode === 'doc') {
      return html`<div class="main-single-pane">${this._renderDocPane()}</div>`;
    }
    if (this._viewMode === 'wysiwyg') {
      return html`
        <div class="main-wysiwyg-with-controller">
          <div class="space-doc-pane-hidden" aria-hidden="true">
            ${this._renderDocPane()}
          </div>
          <div class="main-single-pane">${this._renderWysiwygPane(iframeSrc)}</div>
        </div>
      `;
    }
    return html`
      <sp-split-view
        class="split-view split-view-main"
        resizable
        primary-size="40%"
        secondary-min="200"
        label="Resize doc and wysiwyg panels"
      >
        ${this._renderDocPane()}
        ${this._renderWysiwygPane(iframeSrc)}
      </sp-split-view>
    `;
  }

  /* eslint-disable-next-line class-methods-use-this */
  _renderPlayIcon() {
    return html`
      <svg class="space-nav-icon" slot="icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M8 5v14l11-7z"/>
      </svg>
    `;
  }

  _renderCollabUsers() {
    if (!this._collabUsers?.length) return '';
    return html`
      <div class="space-collab-users" aria-label="Connected users">
        ${this._collabUsers.map((user) => {
      const isAI = user.includes('AI Assistant');
      if (isAI) {
        return html`<span class="space-collab-user space-collab-user-ai" title="AI Assistant">✨</span>`;
      }
      const initials = user.split(' ').map((name) => name.toString().substring(0, 1)).join('');
      return html`<span class="space-collab-user" title="${user}">${initials}</span>`;
    })}
      </div>
    `;
  }

  _renderPublishMenu() {
    return html`
      <sp-action-menu label="Publish menu" class="space-publish-menu-trigger">
        <span class="space-publish-menu-content" slot="icon">
          ${this._publishLoading ? html`<sp-progress-circle class="space-publish-spinner" indeterminate size="s" aria-label="Loading"></sp-progress-circle>` : ''}
          ${this._renderPlayIcon()}
        </span>
        <sp-menu-item @click="${this._onPreview}">Preview</sp-menu-item>
        <sp-menu-item @click="${this._onPublish}">Publish</sp-menu-item>
      </sp-action-menu>
    `;
  }

  _renderBreadcrumbCrumb(name, pathKey, isOrgOrRepo, isFolder) {
    if (isOrgOrRepo) {
      return html`<span class="space-breadcrumb-crumb space-breadcrumb-disabled">${name}</span>`;
    }
    if (isFolder) {
      return html`
        <button
          type="button"
          class="space-breadcrumb-crumb space-breadcrumb-link"
          @click="${() => this._onBreadcrumbFolderClick(pathKey)}"
        >${name}</button>
      `;
    }
    return html`<span class="space-breadcrumb-crumb space-breadcrumb-current">${name}</span>`;
  }

  _renderBreadcrumbBackButton() {
    if (!this._browseBackFolderPath) return '';
    return html`
      <button
        type="button"
        class="space-breadcrumb-back"
        aria-label="Back to browse"
        @click="${this._onBreadcrumbBack}"
      >
        <svg class="space-breadcrumb-back-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
        </svg>
      </button>
    `;
  }

  _renderBreadcrumbs() {
    const segments = this._breadcrumbSegments;
    if (segments.length === 0) {
      return html`<nav class="space-breadcrumbs" aria-label="File path"></nav>`;
    }
    return html`
      <nav class="space-breadcrumbs" aria-label="File path">
        ${segments.map((name, i) => {
      const pathKey = segments.slice(0, i + 1).join('/');
      const isOrgOrRepo = i < 2;
      const isLast = i === segments.length - 1;
      const isFolder = !isLast;
      return html`
  <span class="space-breadcrumb-segment">
    ${i > 0 ? html`<span class="space-breadcrumb-sep" aria-hidden="true">/</span>` : ''}
    ${this._renderBreadcrumbCrumb(name, pathKey, isOrgOrRepo, isFolder)}
  </span>
`;
    })}
      </nav>
    `;
  }

  _renderInnerSplit(iframeSrc) {
    if (!this._detailsOpen) {
      return html`
        <div class="inner-primary-wrap">
          <div class="space-editor-toolbar-host"></div>
          ${this._renderMiddleContent(iframeSrc)}
        </div>
      `;
    }
    return html`
      <sp-split-view
        class="split-view split-view-inner"
        resizable
        primary-size="70%"
        primary-min="600"
        secondary-min="200"
        label="Resize main and details panels"
      >
        <div class="inner-primary-wrap">
          <div class="space-editor-toolbar-host"></div>
          ${this._renderMiddleContent(iframeSrc)}
        </div>
        <div class="space-details">
          <div class="space-details-tablist" role="tablist" aria-label="Details">
            <button
              type="button"
              role="tab"
              class="space-details-tab"
              aria-selected="${this._sidebarTab === 'files'}"
              aria-controls="space-details-panel-files"
              id="space-details-tab-files"
              @click="${() => { this._sidebarTab = 'files'; sessionStorage.setItem('da-nx-sidebar-tab', 'files'); }}"
            >Files</button>
            <button
              type="button"
              role="tab"
              class="space-details-tab"
              aria-selected="${this._sidebarTab === 'outline'}"
              aria-controls="space-details-panel-outline"
              id="space-details-tab-outline"
              @click="${() => { this._sidebarTab = 'outline'; sessionStorage.setItem('da-nx-sidebar-tab', 'outline'); }}"
            >Outline</button>
            ${isHtmlPath(this._selectedPath) ? html`
            <button
              type="button"
              role="tab"
              class="space-details-tab"
              aria-selected="${this._sidebarTab === 'metadata'}"
              aria-controls="space-details-panel-metadata"
              id="space-details-tab-metadata"
              @click="${() => { this._sidebarTab = 'metadata'; sessionStorage.setItem('da-nx-sidebar-tab', 'metadata'); }}"
            >Metadata</button>
            ` : ''}
            ${isHtmlPath(this._selectedPath) ? html`
            <button
              type="button"
              role="tab"
              class="space-details-tab"
              aria-selected="${this._sidebarTab === 'history'}"
              aria-controls="space-details-panel-history"
              id="space-details-tab-history"
              @click="${() => { this._sidebarTab = 'history'; sessionStorage.setItem('da-nx-sidebar-tab', 'history'); }}"
            >History</button>
            ` : ''}
          </div>
          <div
            id="space-details-panel-files"
            role="tabpanel"
            aria-labelledby="space-details-tab-files"
            class="space-details-panel"
            ?hidden="${this._sidebarTab !== 'files'}"
          >
            <da-file-browser class="space-file-browser"></da-file-browser>
          </div>
          <div
            id="space-details-panel-outline"
            role="tabpanel"
            aria-labelledby="space-details-tab-outline"
            class="space-details-panel"
            ?hidden="${this._sidebarTab !== 'outline'}"
          >
            <da-page-outline
              class="space-page-outline"
              .selectedPath="${this._selectedPath ?? ''}"
              .org="${this._orgRepo?.org ?? ''}"
              .repo="${this._orgRepo?.repo ?? ''}"
              .plainHtml="${this._outlineHtml ?? ''}"
              .blockPositions="${this._blockPositions}"
              .activeBlockIndex="${this._activeBlockIndex}"
              @da-outline-move-block="${this._onOutlineMoveBlock}"
              @da-outline-add-section="${this._onOutlineAddSection}"
              @da-outline-add-block="${this._onOutlineAddBlock}"
            ></da-page-outline>
          </div>
          <div
            id="space-details-panel-metadata"
            role="tabpanel"
            aria-labelledby="space-details-tab-metadata"
            class="space-details-panel"
            ?hidden="${this._sidebarTab !== 'metadata'}"
          >
            <da-page-metadata
              class="space-page-metadata"
              .plainHtml="${this._outlineHtml ?? ''}"
            ></da-page-metadata>
          </div>
          <div
            id="space-details-panel-history"
            role="tabpanel"
            aria-labelledby="space-details-tab-history"
            class="space-details-panel"
            ?hidden="${this._sidebarTab !== 'history'}"
          >
            <da-file-history
              class="space-file-history"
              .path="${this._selectedPath ? `/${this._selectedPath.replace(/^\//, '')}` : ''}"
            ></da-file-history>
          </div>
        </div>
      </sp-split-view>
    `;
  }

  render() {
    const iframeSrc = this._wysiwygIframeSrc;
    return html`
      <div class="space">
        <nav class="space-top-nav" aria-label="Toolbar">
          <div class="space-nav-left">
            ${this._renderBreadcrumbBackButton()}
            ${this._renderBreadcrumbs()}
          </div>
          <div class="space-nav-center">
            <sp-action-button
              class="space-nav-toggle-btn"
              label="Toggle chat panel"
              ?selected="${this._chatOpen}"
              @click="${() => { this._chatOpen = !this._chatOpen; }}"
            >
              <img src="${nxBase}/img/icons/aichat.svg" slot="icon" alt="" class="space-nav-icon" />
            </sp-action-button>
            <sp-action-group
              class="space-nav-action-group"
              compact
              selects="single"
              label="Middle panel view"
              .selected="${[this._viewMode]}"
              @change="${this._onViewModeChange}"
            >
              <sp-action-button value="doc" label="Doc">
                <img src="${nxBase}/img/icons/file.svg" slot="icon" alt="" class="space-nav-icon" />
              </sp-action-button>
              <sp-action-button value="wysiwyg" label="WYSIWYG">
                <img src="${nxBase}/img/icons/wysiwyg.svg" slot="icon" alt="" class="space-nav-icon" />
              </sp-action-button>
              <sp-action-button value="split" label="Split">
                <img src="${nxBase}/img/icons/split.svg" slot="icon" alt="" class="space-nav-icon" />
              </sp-action-button>
            </sp-action-group>
            <sp-action-button
              class="space-nav-toggle-btn"
              label="Toggle details panel"
              ?selected="${this._detailsOpen}"
              @click="${() => { this._detailsOpen = !this._detailsOpen; }}"
            >
              <img src="${nxBase}/img/icons/details.svg" slot="icon" alt="" class="space-nav-icon" />
            </sp-action-button>
          </div>
          <div class="space-nav-right">
            ${this._renderCollabUsers()}
            ${this._renderPublishMenu()}
          </div>
        </nav>
        <div class="space-body">
          ${this._chatOpen ? html`
          <sp-split-view
            class="split-view split-view-outer"
            resizable
            primary-size="25%"
            primary-min="280"
            secondary-min="400"
            label="Resize chat panel"
          >
            <da-chat
              class="space-chat-panel"
              .onPageContextItems="${this._chatContextItems ?? []}"
              .getRevertSnapshotAemHtml="${this._getRevertSnapshotAemHtml}"
              .revertCollabDoc="${this._onRevertCollabDoc}"
              @da-chat-message-sent=${this._onChatMessageSent}
            ></da-chat>
            ${this._renderInnerSplit(iframeSrc)}
          </sp-split-view>
          ` : this._renderInnerSplit(iframeSrc)}
        </div>
      </div>
      <da-bulk-aem-modal></da-bulk-aem-modal>
    `;
  }
}

customElements.define('da-space', Space);
