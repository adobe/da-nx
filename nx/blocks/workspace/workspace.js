import { LitElement, html, nothing } from 'da-lit';
import getStyle from '../../utils/styles.js';
import { daFetch } from '../../utils/daFetch.js';
import { DA_ORIGIN } from '../../public/utils/constants.js';
import '../canvas/src/chat.js';

const nx = `${new URL(import.meta.url).origin}/nx`;
const sl = await getStyle(`${nx}/public/sl/styles.css`);
const styles = await getStyle(import.meta.url);

class NxWorkspace extends LitElement {
  static properties = {
    _ims: { state: true },
    _promptCards: { state: true },
    _activeTab: { state: true },
    _recentPages: { state: true },
  };

  constructor() {
    super();
    this._promptCards = [];
    this._activeTab = 'recent';
    this._recentPages = [];
  }

  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, styles];
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

  async _loadRecentPages() {
    try {
      const base = new URL(import.meta.url).href.replace('/workspace.js', '');
      const resp = await fetch(`${base}/mocks/recent-pages.json`);
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
        <div class="workspace-tabs-header" role="tablist">
          <button
            class="workspace-tab-btn ${this._activeTab === 'recent' ? 'active' : ''}"
            role="tab"
            aria-selected="${this._activeTab === 'recent'}"
            data-tab="recent"
            @click=${() => this._switchTab('recent')}
          >Recent Pages</button>
          <button
            class="workspace-tab-btn ${this._activeTab === 'projects' ? 'active' : ''}"
            role="tab"
            aria-selected="${this._activeTab === 'projects'}"
            data-tab="projects"
            @click=${() => this._switchTab('projects')}
          >My Projects</button>
        </div>
        <div class="workspace-tabs-body">
          ${this._activeTab === 'recent' ? this._renderRecentPages() : this._renderProjects()}
        </div>
      </section>
    `;
  }

  _renderRecentPages() {
    if (!this._recentPages.length) {
      return html`
        <div class="workspace-tab-panel" role="tabpanel">
          <p class="workspace-empty">No recent pages found.</p>
        </div>`;
    }
    return html`
      <div class="workspace-tab-panel workspace-pages-grid" role="tabpanel">
        ${this._recentPages.map((page) => html`
          <a class="workspace-page-card" href="${page.path}" title="${page.title}">
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
    try {
      return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return iso;
    }
  }

  _renderProjects() {
    return html`<div class="workspace-tab-panel" role="tabpanel"><!-- projects placeholder --></div>`;
  }

  _renderHero() {
    const firstName = this._ims?.first_name ?? this._ims?.displayName?.split(' ')[0];

    return html`
      <div class="workspace-hero">
        <div class="workspace-hero-text">
          ${firstName ? html`<p class="workspace-welcome-label">Welcome back</p>` : ''}
          <h1 class="workspace-hero-title">
            ${firstName ? html`Welcome, <strong>${firstName}</strong>!` : 'Your AI-powered content workspace'}
          </h1>
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
