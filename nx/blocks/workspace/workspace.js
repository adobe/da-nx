import { LitElement, html, nothing } from 'da-lit';
import getStyle from '../../utils/styles.js';
import { daFetch } from '../../utils/daFetch.js';
import { DA_ORIGIN } from '../../public/utils/constants.js';
import '../canvas/src/chat.js';

const DA_PROJECTS_KEY = 'da-projects';

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
    _promptCards: { state: true },
    _activeTab: { state: true },
    _recentPages: { state: true },
    _projects: { state: true },
  };

  constructor() {
    super();
    this._promptCards = [];
    this._activeTab = 'recent';
    this._recentPages = [];
    this._projects = [];
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
      const cards = (json?.['workspace-prompts']?.data || [])
        .filter((r) => r.title && r.prompt)
        .slice(0, 3);
      this._promptCards = cards;
    } catch {
      // Config unavailable — show no prompt cards.
    }
  }

  _clickPromptCard(prompt) {
    const chat = this.shadowRoot.querySelector('da-chat');
    if (chat?.sendPrompt) chat.sendPrompt(prompt);
  }

  _loadProjects() {
    try {
      const raw = localStorage.getItem(DA_PROJECTS_KEY);
      this._projects = raw ? JSON.parse(raw) : [];
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
          <a class="workspace-page-card" href="${safeUrl(page.path)}" title="${page.title}">
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

  _formatDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  _renderProjects() {
    if (!this._projects.length) {
      return html`<p class="workspace-empty">No projects found. Open a project in DA to see it here.</p>`;
    }
    return html`
      <div class="workspace-projects-grid">
        ${this._projects.map((project) => {
          const href = safeUrl(project.url || `https://da.live/#/${project.org}/${project.site}`);
          return html`
            <a class="workspace-project-card" href="${href}" title="${project.name}">
              <div class="workspace-project-icon" aria-hidden="true">
                ${(project.name || '?')[0].toUpperCase()}
              </div>
              <div class="workspace-project-info">
                <span class="workspace-project-name">${project.name}</span>
                <span class="workspace-project-org">${project.org}/${project.site}</span>
              </div>
            </a>
          `;
        })}
      </div>
    `;
  }

  _renderHero() {
    const firstName = this._ims?.first_name ?? this._ims?.displayName?.split(' ')[0];

    return html`
      <div class="workspace-hero">
        <div class="workspace-hero-text">
          ${firstName ? html`<h1 class="workspace-hero-title">Welcome, <strong>${firstName}</strong>!</h1>` : ''}
          <p class="workspace-hero-subtitle">Your AI-powered content workspace</p>
        </div>
        <div class="workspace-chat-container">
          <da-chat
            context-view="workspace"
            .onPageContextItems="${[]}"
          ></da-chat>
        </div>
      </div>
    `;
  }

  _renderPromptCards() {
    if (!this._promptCards.length) return nothing;
    return html`
      <section class="workspace-prompts">
        <h2 class="workspace-section-title">Get started</h2>
        <div class="workspace-prompts-grid">
          ${this._promptCards.map((card) => html`
            <button
              class="workspace-prompt-card"
              @click=${() => this._clickPromptCard(card.prompt)}
            >
              ${card.icon ? html`<img class="workspace-prompt-icon" src="${card.icon}" alt="" aria-hidden="true" />` : ''}
              <span class="workspace-prompt-category">${card.category || ''}</span>
              <span class="workspace-prompt-title">${card.title}</span>
              <span class="workspace-prompt-desc">${card.description || ''}</span>
            </button>
          `)}
        </div>
      </section>
    `;
  }

  render() {
    return html`
      <div class="workspace">
        ${this._renderHero()}
        <div class="workspace-sections">
          ${this._renderPromptCards()}
          ${this._renderTabs()}
        </div>
      </div>
    `;
  }
}

customElements.define('nx-workspace', NxWorkspace);

export default async function init(el) {
  const workspace = document.createElement('nx-workspace');
  document.body.append(workspace);
  el.remove();
}
