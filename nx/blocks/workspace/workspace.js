import { LitElement, html, nothing } from 'da-lit';
import getStyle from '../../utils/styles.js';
import { daFetch } from '../../utils/daFetch.js';
import { DA_ORIGIN } from '../../public/utils/constants.js';
import '../profile/profile.js';

const DA_PROJECTS_KEY = 'da-sites';

/**
 * Returns the URL if it is a safe relative path or http/https URL.
 * Rejects javascript: and other non-http schemes to prevent XSS.
 * @param {string} url
 * @returns {string}
 */
function safeUrl(url) {
  if (!url) return '#';
  if (/^javascript:/i.test(url.trim())) return '#';
  return url;
}

const nx = `${new URL(import.meta.url).origin}/nx`;
const sl = await getStyle(`${nx}/public/sl/styles.css`);
const styles = await getStyle(import.meta.url);

class NxWorkspace extends LitElement {
  static properties = {
    _ims: { state: true },
    _imsLoaded: { state: true },
    _promptCards: { state: true },
    _activeTab: { state: true },
    _recentPages: { state: true },
    _projects: { state: true },
    _prompt: { state: true },
  };

  constructor() {
    super();
    this._imsLoaded = false;
    this._promptCards = [];
    this._activeTab = 'recent';
    this._recentPages = [];
    this._projects = [];
    this._prompt = '';
  }

  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, styles];
    this._loadProjects();
    await this._loadConfig();
    await this._loadRecentPages();
  }

  async _loadConfig() {
    const hash = window.location.hash || '';
    const path = hash.replace(/^#\/?/, '').trim();
    const [org = '', repo = ''] = path.split('/').filter(Boolean);
    if (!org || !repo) return;
    try {
      const resp = await daFetch(`${DA_ORIGIN}/config/${org}/${repo}`);
      if (!resp.ok) return;
      const json = await resp.json();
      const cards = (json?.prompts?.data || [])
        .filter((r) => r.area?.toLowerCase() === 'welcome' && r.title && r.prompt);
      this._promptCards = cards;
    } catch {
      // Config unavailable — show no prompt cards.
    }
  }

  _onProfileLoad(e) {
    this._ims = e.detail;
    this._imsLoaded = true;
  }

  _clickPromptCard(prompt) {
    this._prompt = prompt;
    this._launchChat();
  }

  _launchChat() {
    const prompt = this._prompt.trim();
    if (!prompt) return;
    sessionStorage.setItem('da-pending-prompt', prompt);
    const { search } = window.location;
    const hash = window.location.hash.replace(/\/[^/]+\.html$/, '');
    window.location.assign(`${window.location.origin}/browse${search}${hash}`);
  }

  _loadProjects() {
    try {
      const raw = localStorage.getItem(DA_PROJECTS_KEY);
      const sites = raw ? JSON.parse(raw).filter((s) => typeof s === 'string' && s.includes('/')) : [];
      this._projects = sites.map((name) => ({
        name,
        img: `/blocks/browse/da-sites/img/cards/da-${Math.floor(Math.random() * 8)}.jpg`,
      }));
    } catch {
      this._projects = [];
    }
  }

  async _loadRecentPages() {
    try {
      const resp = await fetch(new URL('./mocks/recent-pages.json', import.meta.url).href);
      if (!resp.ok) return;
      this._recentPages = await resp.json();
    } catch {
      // Silent fail — recent pages section stays empty.
    }
  }

  _switchTab(tab) {
    this._activeTab = tab;
  }

  _renderTabs() {
    return html`
      <section class="workspace-tabs-section">
        <div class="workspace-tabs-header" role="tablist" aria-label="Content views">
          <button
            id="workspace-tab-recent"
            class="workspace-tab-btn ${this._activeTab === 'recent' ? 'active' : ''}"
            role="tab"
            aria-selected="${this._activeTab === 'recent'}"
            aria-controls="workspace-panel-recent"
            data-tab="recent"
            @click=${() => this._switchTab('recent')}
          >Recent Pages</button>
          <button
            id="workspace-tab-projects"
            class="workspace-tab-btn ${this._activeTab === 'projects' ? 'active' : ''}"
            role="tab"
            aria-selected="${this._activeTab === 'projects'}"
            aria-controls="workspace-panel-projects"
            data-tab="projects"
            @click=${() => this._switchTab('projects')}
          >My Projects</button>
        </div>
        <div class="workspace-tabs-body">
          <div
            id="workspace-panel-recent"
            class="workspace-tab-panel"
            role="tabpanel"
            aria-labelledby="workspace-tab-recent"
            ?hidden="${this._activeTab !== 'recent'}"
          >${this._renderRecentPages()}</div>
          <div
            id="workspace-panel-projects"
            class="workspace-tab-panel"
            role="tabpanel"
            aria-labelledby="workspace-tab-projects"
            ?hidden="${this._activeTab !== 'projects'}"
          >${this._renderProjects()}</div>
        </div>
      </section>
    `;
  }

  _renderRecentPages() {
    if (!this._recentPages.length) {
      return html`<p class="workspace-empty">No recent pages found.</p>`;
    }
    return html`
      <div class="workspace-pages-grid">
        ${this._recentPages.map((page) => html`
          <a class="workspace-page-card" href="${this._pageHref(page.path)}" title="${page.title}">
            <div class="workspace-page-card-body">
              <span class="workspace-page-title">${page.title}</span>
              <span class="workspace-page-path">${page.path}</span>
            </div>
            <div class="workspace-page-card-footer">
              <span class="workspace-page-date">${this._formatDate(page.lastModified)}</span>
              <span class="workspace-page-status ${page.status}">${page.status}</span>
            </div>
          </a>
        `)}
      </div>
    `;
  }

  _pageHref(path) {
    const normalized = path.endsWith('/')
      ? `${path}index.html`
      : `${path.replace(/\.html$/, '')}.html`;
    return safeUrl(`/canvas${window.location.search}#${normalized}`);
  }

  _formatDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  _flipProject(e, project) {
    e.preventDefault();
    e.stopPropagation();
    project.flipped = !project.flipped;
    this.requestUpdate();
  }

  _hideProject(project) {
    this._projects = this._projects.filter((p) => p.name !== project.name);
    localStorage.setItem(DA_PROJECTS_KEY, JSON.stringify(this._projects.map((p) => p.name)));
  }

  _shareProject(name) {
    const url = `${window.location.origin}/browse#/${name}`;
    navigator.clipboard.writeText(url);
  }

  _renderProjects() {
    if (!this._projects.length) {
      return html`<p class="workspace-empty">No projects found. Open a project in DA to see it here.</p>`;
    }
    return html`
      <div class="workspace-projects-grid">
        ${this._projects.map((project) => {
          const [org, site] = project.name.split('/');
          const href = safeUrl(`/browse${window.location.search}#/${project.name}`);
          return html`
            <div class="workspace-project-outer">
              <div class="workspace-project-flip ${project.flipped ? 'is-flipped' : ''}">
                <div class="workspace-project-front">
                  <a class="workspace-project-card" href="${href}" title="${project.name}">
                    <div class="workspace-project-icon" aria-hidden="true">
                      <img src="${project.img}" alt="" width="64" height="64" />
                    </div>
                    <div class="workspace-project-info">
                      <span class="workspace-project-name">${site}</span>
                      <span class="workspace-project-org">${org}</span>
                    </div>
                  </a>
                </div>
                <div class="workspace-project-back">
                  <button class="workspace-project-back-action" @click=${() => this._shareProject(project.name)}>
                    <span>Share</span>
                  </button>
                  <button class="workspace-project-back-action workspace-project-back-action-hide" @click=${() => this._hideProject(project)}>
                    <span>Hide</span>
                  </button>
                </div>
                <button class="workspace-project-more" aria-label="More options" @click=${(e) => this._flipProject(e, project)}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true">
                    <circle cx="16" cy="9" r="2" fill="currentColor"/>
                    <circle cx="16" cy="16" r="2" fill="currentColor"/>
                    <circle cx="16" cy="23" r="2" fill="currentColor"/>
                  </svg>
                </button>
              </div>
            </div>
          `;
        })}
      </div>
    `;
  }

  _renderHero() {
    const firstName = this._ims?.first_name ?? this._ims?.displayName?.split(' ')[0];

    // Before IMS resolves: invisible placeholder reserves the h1 space to prevent layout shift.
    // After IMS resolves with a name: real heading fades in.
    // After IMS resolves anonymous: placeholder removed (only subtitle shown).
    let titleEl = nothing;
    if (!this._imsLoaded) {
      titleEl = html`<h1 class="workspace-hero-title workspace-hero-title-pending" aria-hidden="true">&nbsp;</h1>`;
    } else if (firstName) {
      titleEl = html`<h1 class="workspace-hero-title workspace-hero-title-loaded">Welcome, <strong>${firstName}</strong>!</h1>`;
    }

    return html`
      <nx-profile @loaded=${this._onProfileLoad.bind(this)} class="workspace-profile"></nx-profile>
      <div class="workspace-hero">
        <div class="workspace-hero-inner">
          <div class="workspace-hero-text">
            ${titleEl}
            <p class="workspace-hero-subtitle">Your AI-powered content workspace</p>
          </div>
          <div class="workspace-chat-launcher">
            <input
              class="workspace-chat-input"
              type="text"
              placeholder="Ask DA AI anything"
              .value="${this._prompt}"
              @input="${(e) => { this._prompt = e.target.value; }}"
              @keydown="${(e) => { if (e.key === 'Enter') this._launchChat(); }}"
            />
            <button
              class="workspace-chat-send"
              aria-label="Send"
              ?disabled="${!this._prompt.trim()}"
              @click="${() => this._launchChat()}"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" focusable="false" aria-hidden="true">
                <path d="M15.5 8a.5.5 0 0 0-.5-.5H2.707l3.647-3.646a.5.5 0 0 0-.708-.708l-4.5 4.5a.5.5 0 0 0 0 .708l4.5 4.5a.5.5 0 0 0 .708-.708L2.707 8.5H15a.5.5 0 0 0 .5-.5Z"/>
              </svg>
            </button>
          </div>
          ${this._renderPromptCards()}
        </div>
      </div>
    `;
  }

  _renderPromptCards() {
    if (!this._promptCards.length) return nothing;
    return html`
      <div class="workspace-prompts">
        <div class="workspace-prompts-row">
          ${this._promptCards.map((card) => html`
            <button
              class="workspace-prompt-card"
              @click=${() => this._clickPromptCard(card.prompt)}
            >
              ${card.icon ? html`<img class="workspace-prompt-icon" src="${card.icon}" alt="" aria-hidden="true" />` : ''}
              <span class="workspace-prompt-title">${card.title}</span>
              <span class="workspace-prompt-desc">${card.description || ''}</span>
              ${card.category ? html`<span class="workspace-prompt-category">${card.category}</span>` : ''}
            </button>
          `)}
        </div>
      </div>
    `;
  }

  render() {
    return html`
      <div class="workspace">
        ${this._renderHero()}
        <div class="workspace-sections">
          ${this._renderTabs()}
        </div>
      </div>
    `;
  }
}

customElements.define('nx-workspace', NxWorkspace);

export default async function init(el) {
  const workspace = document.createElement('nx-workspace');
  el.replaceWith(workspace);
}
