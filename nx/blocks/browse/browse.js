import '../../deps/swc/dist/index.js';
import '../canvas/src/bootstrap-nx.js';
// eslint-disable-next-line import/no-unresolved
import getStyle from 'https://da.live/nx/utils/styles.js';
// eslint-disable-next-line import/no-unresolved
import { LitElement, html } from 'da-lit';
// eslint-disable-next-line import/no-unresolved
import { getNx } from 'https://da.live/scripts/utils.js';
import { initIms, daFetch } from '../../utils/daFetch.js';
// eslint-disable-next-line import/no-unresolved
import '../canvas/src/chat.js';
import './content-browser/index.js';
import {
  createListFetcher,
  createSaveToSource,
  createDeleteItem,
  createRenameItem,
  enrichListItemsWithAemStatus,
  parseHashToPathContext,
  saveToAem as postSaveToAem,
} from './content-browser/api/da-browse-api.js';
import { DA_BULK_AEM_OPEN } from '../canvas/src/bulk-aem-modal.js';
import {
  SL_CONTENT_BROWSER_CHAT_CONTEXT,
  SL_CONTENT_BROWSER_LIST_PERMISSIONS,
} from './content-browser/lib/content-browser-actions.js';
import './da-skills-lab-view.js';
import {
  DA_SKILLS_LAB_PROMPT_ADD_TO_CHAT,
  DA_SKILLS_LAB_PROMPT_SEND,
} from './skills-lab-api.js';

const style = await getStyle(import.meta.url);
const nxBase = getNx();
const WINDOW_LAYOUT_STATE_KEY = 'da-window-layout-state';
const REPO_FILES_CHANGED_EVENT = 'da:chat-repo-files-changed';

function readWindowLayoutState() {
  try {
    const raw = localStorage.getItem(WINDOW_LAYOUT_STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeWindowLayoutState(nextPatch) {
  try {
    const current = readWindowLayoutState();
    localStorage.setItem(WINDOW_LAYOUT_STATE_KEY, JSON.stringify({ ...current, ...nextPatch }));
  } catch {
    // Ignore storage errors.
  }
}

const listFolder = createListFetcher({ daFetch });
const saveToSource = createSaveToSource({ daFetch });

/** Runs after the table renders (async); merges AEM status metadata into rows. */
function aemEnrichListItems(items, fullpath) {
  return enrichListItemsWithAemStatus(items, fullpath, { getIms: initIms });
}
const deleteItem = createDeleteItem({ daFetch });
const renameItem = createRenameItem({ daFetch });
const saveToAem = (path, action) => postSaveToAem(path, action, { getIms: initIms });

/**
 * Browse shell: chat + split layout; file UI is delegated to `sl-content-browser`.
 * @customElement da-browse-view
 */
class BrowseView extends LitElement {
  static properties = {
    /** When true, render Skills Lab catalog (`da-skills-lab-view`) instead of the file browser. */
    appsSkills: { type: Boolean, attribute: 'apps-skills' },
    _chatOpen: { state: true },
    _chatContextItems: { state: true },
    /** Toolbar breadcrumb segments from `location.hash` (same source as `sl-content-browser`). */
    _browsePathSegments: { state: true },
    /** Current folder fullpath for toolbar `sl-browse-new` (from hash). */
    _browseFolderFullpath: { state: true },
    /** List API `permissions` for toolbar New (from `sl-content-browser`). */
    _browseListPermissions: { state: true },
    /** Skills Lab: stack chat above main below 1024px. */
    _skillsLabNarrowVp: { state: true },
  };

  constructor() {
    super();
    this.appsSkills = false;
    this._skillsLabNarrowVp = false;
    const persisted = readWindowLayoutState();
    this._chatOpen = typeof persisted.chatOpen === 'boolean' ? persisted.chatOpen : true;
    this._chatContextItems = [];
    this._browsePathSegments = [];
    this._browseFolderFullpath = '';
    this._browseListPermissions = undefined;
    this._boundWindowBulkAemOpen = (e) => this._onBulkAemOpen(e);
    this._boundBrowseSelectionChatContext = (e) => this._onBrowseSelectionChatContext(e);
    this._boundBrowseListPermissions = (e) => this._onBrowseListPermissions(e);
    this._boundChatContextRemove = (e) => this._onChatContextRemove(e);
    this._boundBrowseHashChange = () => this._syncBrowsePathFromHash();
    this._boundRepoFilesChanged = (e) => this._onRepoFilesChanged(e);
    this._onChatMessageSent = this._onChatMessageSent.bind(this);
    this._onSkillsLabGateSubmit = this._onSkillsLabGateSubmit.bind(this);
    this._skillsLabVpMql = null;
    this._onSkillsLabVp = () => {
      this._skillsLabNarrowVp = this._skillsLabVpMql?.matches ?? false;
    };
    this._onSkillsLabPromptAddToChat = (e) => {
      const prompt = e.detail?.prompt;
      if (typeof prompt !== 'string' || !prompt.trim()) return;
      this.shadowRoot?.querySelector('da-chat')?.insertPrompt?.(prompt);
    };
    this._onSkillsLabPromptSend = (e) => {
      const prompt = e.detail?.prompt;
      if (typeof prompt !== 'string' || !prompt.trim()) return;
      this.shadowRoot?.querySelector('da-chat')?.sendPrompt?.(prompt);
    };
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._skillsLabVpMql = window.matchMedia('(max-width: 1023px)');
    this._skillsLabNarrowVp = this._skillsLabVpMql.matches;
    this._skillsLabVpMql.addEventListener('change', this._onSkillsLabVp);
    this._syncBrowsePathFromHash();
    window.addEventListener('hashchange', this._boundBrowseHashChange);
    window.addEventListener(DA_BULK_AEM_OPEN, this._boundWindowBulkAemOpen);
    window.addEventListener(REPO_FILES_CHANGED_EVENT, this._boundRepoFilesChanged);
    window.addEventListener(DA_SKILLS_LAB_PROMPT_ADD_TO_CHAT, this._onSkillsLabPromptAddToChat);
    window.addEventListener(DA_SKILLS_LAB_PROMPT_SEND, this._onSkillsLabPromptSend);
    this.addEventListener(SL_CONTENT_BROWSER_CHAT_CONTEXT, this._boundBrowseSelectionChatContext);
    this.addEventListener(SL_CONTENT_BROWSER_LIST_PERMISSIONS, this._boundBrowseListPermissions);
    this.addEventListener('chat-context-remove', this._boundChatContextRemove);
  }

  disconnectedCallback() {
    this._skillsLabVpMql?.removeEventListener('change', this._onSkillsLabVp);
    window.removeEventListener('hashchange', this._boundBrowseHashChange);
    window.removeEventListener(DA_BULK_AEM_OPEN, this._boundWindowBulkAemOpen);
    window.removeEventListener(REPO_FILES_CHANGED_EVENT, this._boundRepoFilesChanged);
    window.removeEventListener(DA_SKILLS_LAB_PROMPT_ADD_TO_CHAT, this._onSkillsLabPromptAddToChat);
    window.removeEventListener(DA_SKILLS_LAB_PROMPT_SEND, this._onSkillsLabPromptSend);
    this.removeEventListener(
      SL_CONTENT_BROWSER_CHAT_CONTEXT,
      this._boundBrowseSelectionChatContext,
    );
    this.removeEventListener(SL_CONTENT_BROWSER_LIST_PERMISSIONS, this._boundBrowseListPermissions);
    this.removeEventListener('chat-context-remove', this._boundChatContextRemove);
    super.disconnectedCallback();
  }

  updated(changed) {
    super.updated?.(changed);
    if (changed.has('_chatOpen')) {
      writeWindowLayoutState({ chatOpen: this._chatOpen });
    }
  }

  _syncBrowsePathFromHash() {
    const ctx = parseHashToPathContext(window.location.hash);
    const next = ctx?.pathSegments ?? [];
    const fullpath = ctx?.fullpath ?? '';
    this._browsePathSegments = [...next];
    this._browseFolderFullpath = fullpath;
  }

  _onBrowseListPermissions(e) {
    this._browseListPermissions = e.detail?.permissions;
  }

  /**
   * Refresh the active folder after successful chat-driven repo mutations.
   */
  _onRepoFilesChanged(e) {
    const { org, repo } = e.detail || {};
    const [hashOrg, hashRepo] = this._browsePathSegments;
    if (!hashOrg || !hashRepo) return;
    if (org !== hashOrg || repo !== hashRepo) return;
    this.shadowRoot?.querySelector('sl-content-browser')?.refreshFolder?.();
    if (this.appsSkills) {
      this.shadowRoot?.querySelector('da-skills-lab-view')?.refresh?.();
    }
  }

  _onBrowseToolbarNewItem() {
    this.shadowRoot?.querySelector('sl-content-browser')?.refreshFolder?.();
    if (this.appsSkills) {
      this.shadowRoot?.querySelector('da-skills-lab-view')?.refresh?.();
    }
  }

  _onBrowseToolbarNewError(e) {
    const msg = e.detail?.message || 'Create failed';
    this.shadowRoot?.querySelector('sl-content-browser')?.showToast?.(msg, 'negative');
  }

  _onBrowseToolbarNavigate(event) {
    const pathKey = event.detail?.pathKey;
    if (!pathKey) return;
    window.location.hash = `#/${pathKey}`;
  }

  _onBrowseSelectionChatContext(e) {
    const items = e.detail?.items;
    this._chatContextItems = Array.isArray(items) ? [...items] : [];
  }

  _onChatContextRemove(e) {
    const { index } = e.detail ?? {};
    if (typeof index !== 'number' || index < 0) return;
    const pathKey = this._chatContextItems[index]?.pathKey;
    if (!pathKey) return;
    this.shadowRoot?.querySelector('sl-content-browser')?.removeSelectionPathKey?.(pathKey);
  }

  /** Match canvas `da-space`: clear pending context after send; resync from table selection. */
  _onChatMessageSent() {
    this._chatContextItems = [];
    queueMicrotask(() => {
      this.shadowRoot?.querySelector('sl-content-browser')?.resyncChatContextAfterMessage?.();
    });
  }

  _onBulkAemOpen(e) {
    const { files, mode } = e.detail ?? {};
    const modal = this.shadowRoot?.querySelector('da-bulk-aem-modal');
    if (!modal || typeof modal.show !== 'function') return;
    modal.show(files, mode);
  }

  _onSkillsLabGateSubmit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    if (!(form instanceof HTMLFormElement)) return;
    const fd = new FormData(form);
    let org = String(fd.get('org') || '').trim();
    let site = String(fd.get('site') || '').trim();
    org = org.replace(/\//g, '');
    site = site.replace(/\//g, '');
    if (!org || !site) return;
    window.location.hash = `#/${org}/${site}`;
  }

  _renderSkillsLabOrgSiteGate() {
    return html`
      <div class="browse-skills-lab-gate">
        <h1 class="browse-skills-lab-gate-title">Skills Editor</h1>
        <p class="browse-skills-lab-gate-desc">
          Enter your organization and site (same as in browse or canvas). You will manage skills, agents, prompts, and MCP servers for that repository.
        </p>
        <form class="browse-skills-lab-gate-form" @submit=${this._onSkillsLabGateSubmit}>
          <label class="browse-skills-lab-gate-field">
            <span class="browse-skills-lab-gate-label">Organization</span>
            <input
              class="browse-skills-lab-gate-input"
              type="text"
              name="org"
              required
              autocomplete="organization"
              placeholder="e.g. adobecom"
              autofocus
            />
          </label>
          <label class="browse-skills-lab-gate-field">
            <span class="browse-skills-lab-gate-label">Site</span>
            <input
              class="browse-skills-lab-gate-input"
              type="text"
              name="site"
              required
              autocomplete="off"
              placeholder="e.g. bacom"
            />
          </label>
          <button type="submit" class="browse-skills-lab-gate-submit">Continue</button>
        </form>
      </div>
    `;
  }

  _renderToolbar() {
    return html`
      <div class="browse-view-toolbar">
        <sp-action-button
          class="browse-view-chat-toggle"
          label="Toggle chat panel"
          ?selected="${this._chatOpen}"
          @click="${() => { this._chatOpen = !this._chatOpen; localStorage.setItem('da-nx-chat-open', this._chatOpen); }}"
        >
          <img src="${nxBase}/img/icons/aichat.svg" slot="icon" alt="" class="browse-view-nav-icon" />
        </sp-action-button>
        <sl-browse-breadcrumbs
          class="browse-view-breadcrumbs"
          .segments="${this._browsePathSegments}"
          @sl-browse-navigate="${this._onBrowseToolbarNavigate}"
        ></sl-browse-breadcrumbs>
        <sl-browse-new
          class="browse-view-new"
          folder-fullpath="${this._browseFolderFullpath}"
          canvas-edit-base="https://da.live/canvas"
          sheet-edit-base="https://da.live/sheet"
          .permissions="${this._browseListPermissions}"
          .saveToSource="${saveToSource}"
          @sl-browse-new-item="${this._onBrowseToolbarNewItem}"
          @sl-browse-new-error="${this._onBrowseToolbarNewError}"
        ></sl-browse-new>
      </div>
    `;
  }

  _renderContentBrowser() {
    return html`
      <sl-content-browser
        class="browse-view-content-browser"
        navigate-with-hash
        canvas-edit-base="https://da.live/canvas"
        sheet-edit-base="https://da.live/sheet"
        .listFolder="${listFolder}"
        .aemEnrichListItems="${aemEnrichListItems}"
        .deleteItem="${deleteItem}"
        .renameItem="${renameItem}"
        .saveToSource="${saveToSource}"
        .saveToAem="${saveToAem}"
      ></sl-content-browser>
    `;
  }

  render() {
    if (this.appsSkills) {
      const org = this._browsePathSegments?.[0] || '';
      const site = this._browsePathSegments?.[1] || '';
      const hasRepo = Boolean(org && site);
      const skillsMain = hasRepo
        ? html`<da-skills-lab-view .org=${org} .site=${site}></da-skills-lab-view>`
        : this._renderSkillsLabOrgSiteGate();
      return html`
      <div class="browse-view browse-view-skills-lab">
        ${this._renderToolbar()}
        <div class="browse-view-body">
          ${this._chatOpen
        ? html`
                <sp-split-view
                  class="browse-view-split split-view-outer"
                  ?vertical="${this._skillsLabNarrowVp}"
                  resizable
                  primary-size="${this._skillsLabNarrowVp ? '40%' : '25%'}"
                  primary-min="${this._skillsLabNarrowVp ? 200 : 280}"
                  secondary-min="${this._skillsLabNarrowVp ? 240 : 400}"
                  label="Resize chat panel"
                >
                  <da-chat
                    class="browse-view-chat-panel"
                    context-view="browse"
                    .onPageContextItems="${this._chatContextItems ?? []}"
                    @da-chat-message-sent="${this._onChatMessageSent}"
                  ></da-chat>
                  <div class="browse-view-main browse-view-main-skills-lab">
                    ${skillsMain}
                  </div>
                </sp-split-view>
              `
        : html`
                <div class="browse-view-main browse-view-main-skills-lab">
                  ${skillsMain}
                </div>
              `}
        </div>
      </div>
      <da-bulk-aem-modal></da-bulk-aem-modal>
    `;
    }

    return html`
      <div class="browse-view">
        ${this._renderToolbar()}
        <div class="browse-view-body">
          ${this._chatOpen
        ? html`
                <sp-split-view
                  class="browse-view-split split-view-outer"
                  resizable
                  primary-size="25%"
                  primary-min="280"
                  secondary-min="400"
                  label="Resize chat panel"
                >
                  <da-chat
                    class="browse-view-chat-panel"
                    context-view="browse"
                    .onPageContextItems="${this._chatContextItems ?? []}"
                    @da-chat-message-sent="${this._onChatMessageSent}"
                  ></da-chat>
                  <div class="browse-view-main">${this._renderContentBrowser()}</div>
                </sp-split-view>
              `
        : html`<div class="browse-view-main">${this._renderContentBrowser()}</div>`}
        </div>
      </div>
      <da-bulk-aem-modal></da-bulk-aem-modal>
    `;
  }
}

customElements.define('da-browse-view', BrowseView);

/**
 * Nearest ancestor that can scroll vertically (e.g. `<main>`), or null.
 * @param {Element | null} el
 * @returns {Element | null}
 */
function nearestVerticalScrollAncestor(el) {
  let p = el?.parentElement ?? null;
  while (p) {
    const oy = getComputedStyle(p).overflowY;
    if (oy === 'auto' || oy === 'scroll') return p;
    p = p.parentElement;
  }
  return null;
}

/**
 * Size the browse block to the viewport space below its top edge so `<main>` does not need to
 * scroll for `100vh` + header/siblings. Updates on resize, visualViewport, and scroll of the
 * nearest scrollable ancestor.
 * @param {HTMLElement} block
 */
function bindBrowseBlockViewportFit(block) {
  const sync = () => {
    const vp = window.visualViewport;
    const vpH = vp?.height ?? window.innerHeight;
    const top = Math.max(0, Math.round(block.getBoundingClientRect().top));
    const h = Math.max(240, vpH - top);
    block.style.height = `${h}px`;
    block.style.minHeight = '0';
    block.style.maxHeight = `${h}px`;
    block.style.overflow = 'hidden';
  };

  sync();
  window.addEventListener('resize', sync, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', sync, { passive: true });
    window.visualViewport.addEventListener('scroll', sync, { passive: true });
  }
  const scrollRoot = nearestVerticalScrollAncestor(block);
  scrollRoot?.addEventListener('scroll', sync, { passive: true });
}

export { bindBrowseBlockViewportFit };

export default function decorate(block) {
  block.innerHTML = `
    <sp-theme system="spectrum-two" scale="medium" color="light">
      <da-browse-view></da-browse-view>
    </sp-theme>
  `;
  block.style.display = 'flex';
  block.style.flexDirection = 'column';
  block.style.minHeight = '0';

  const theme = block.querySelector('sp-theme');
  if (theme) {
    theme.style.display = 'flex';
    theme.style.flexDirection = 'column';
    theme.style.flex = '1';
    theme.style.minHeight = '0';
    theme.style.height = '100%';
    theme.style.overflow = 'hidden';
  }

  const browse = block.querySelector('da-browse-view');
  if (browse) {
    browse.style.flex = '1';
    browse.style.minHeight = '0';
    browse.style.minWidth = '0';
    browse.style.width = '100%';
    browse.style.overflow = 'hidden';
  }

  requestAnimationFrame(() => {
    bindBrowseBlockViewportFit(block);
  });
}
