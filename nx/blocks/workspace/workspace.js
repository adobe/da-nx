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
    _isRecording: { state: true },
  };

  constructor() {
    super();
    this._imsLoaded = false;
    this._promptCards = [];
    this._activeTab = 'recent';
    this._recentPages = [];
    this._projects = [];
    this._prompt = '';
    this._isRecording = false;
    this._recognition = null;
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

  _openPromptsLibrary() {
    sessionStorage.setItem('da-open-prompts-library', '1');
    const { search } = window.location;
    const hash = window.location.hash.replace(/\/[^/]+\.html$/, '');
    window.location.assign(`${window.location.origin}/browse${search}${hash}`);
  }

  _toggleRecording() {
    if (this._isRecording) {
      this._recognition?.stop();
      return;
    }
    // eslint-disable-next-line no-undef
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    this._recognition = new SpeechRecognition();
    this._recognition.continuous = true;
    this._recognition.interimResults = true;
    this._recognition.lang = navigator.language || navigator.languages?.[0] || document.documentElement.lang || 'en-US';

    this._recognition.onstart = () => { this._isRecording = true; };
    this._recognition.onresult = (e) => {
      let transcript = '';
      for (let i = 0; i < e.results.length; i += 1) {
        transcript += e.results[i][0].transcript;
      }
      this._prompt = transcript;
      clearTimeout(this._recordingAutoSubmitTimer);
      this._recordingAutoSubmitTimer = setTimeout(() => {
        this._recognition?.stop();
        if (this._prompt.trim()) this._launchChat();
      }, 2000);
    };
    this._recognition.onerror = () => { this._isRecording = false; };
    this._recognition.onend = () => {
      this._isRecording = false;
      clearTimeout(this._recordingAutoSubmitTimer);
    };
    this._recognition.start();
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
              placeholder="Ask AI anything…"
              .value="${this._prompt}"
              @input="${(e) => { this._prompt = e.target.value; }}"
              @keydown="${(e) => { if (e.key === 'Enter') this._launchChat(); }}"
            />
            <button
              class="workspace-chat-icon-btn"
              aria-label="Open prompt library"
              title="Prompt library"
              @click="${() => this._openPromptsLibrary()}"
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M8.74706 5.32911L6.92675 1.8252C6.75683 1.49415 6.41894 1.28711 6.04687 1.28418H6.03906C5.66992 1.28418 5.33301 1.48633 5.15918 1.80957L3.26953 5.31055C3.09375 5.6377 3 6.00684 3 6.37891V16.75C3 17.9902 4.00977 19 5.25 19H6.75C7.99023 19 9 17.9902 9 16.75V6.36622C9 6.00587 8.9121 5.64747 8.74706 5.32911ZM7.49999 7.50001V14.5H4.49999V7.50001H7.49999ZM6.03026 3.35353L7.40477 6.00001H4.60252L6.03026 3.35353ZM6.74999 17.5H5.24999C4.8369 17.5 4.49999 17.1631 4.49999 16.75V16H7.49999V16.75C7.49999 17.1631 7.16308 17.5 6.74999 17.5Z" fill="currentColor"/>
                <path d="M14.75 1H13.25C12.0098 1 11 2.00977 11 3.25V9.979C11 9.98388 10.9971 9.98803 10.9971 9.99316C10.9971 9.99853 11 10.0027 11 10.008V13.73C11 13.7348 10.9971 13.7383 10.9971 13.7431C10.9971 13.7485 11 13.7527 11 13.758V16.75C11 17.9902 12.0098 19 13.25 19H14.75C15.9902 19 17 17.9902 17 16.75V3.25C17 2.00977 15.9902 1 14.75 1ZM15.5 16.75C15.5 17.1631 15.1631 17.5 14.75 17.5H13.25C12.8369 17.5 12.5 17.1631 12.5 16.75V14.499L13.7441 14.5039H13.7471C14.1602 14.5039 14.4951 14.1699 14.4971 13.7568C14.499 13.3428 14.1641 13.0058 13.75 13.0039L12.5 12.999V10.749L13.7441 10.7539H13.7471C14.1602 10.7539 14.4951 10.4199 14.4971 10.0068C14.499 9.59277 14.1641 9.25585 13.75 9.2539L12.5 9.24902V7.00341L13.7471 7.00878H13.75C14.1631 7.00878 14.498 6.6748 14.5 6.26171C14.502 5.84765 14.168 5.51073 13.7529 5.50878L12.5 5.50341V3.24999C12.5 2.8369 12.8369 2.49999 13.25 2.49999H14.75C15.1631 2.49999 15.5 2.8369 15.5 3.24999V16.75Z" fill="currentColor"/>
              </svg>
            </button>
            ${(window.SpeechRecognition || window.webkitSpeechRecognition) ? html`
            <button
              class="workspace-chat-icon-btn ${this._isRecording ? 'recording' : ''}"
              aria-label="${this._isRecording ? 'Stop recording' : 'Start voice input'}"
              title="${this._isRecording ? 'Stop recording' : 'Voice input'}"
              @click="${() => this._toggleRecording()}"
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 1a3.5 3.5 0 0 0-3.5 3.5v6a3.5 3.5 0 0 0 7 0v-6A3.5 3.5 0 0 0 10 1Zm-2 3.5a2 2 0 0 1 4 0v6a2 2 0 0 1-4 0v-6ZM5.25 9a.75.75 0 0 1 .75.75 4 4 0 0 0 8 0 .75.75 0 0 1 1.5 0 5.5 5.5 0 0 1-4.75 5.45V17h2a.75.75 0 0 1 0 1.5h-5.5a.75.75 0 0 1 0-1.5h2v-1.8A5.5 5.5 0 0 1 4.5 9.75.75.75 0 0 1 5.25 9Z" fill="currentColor"/></svg>
            </button>` : nothing}
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
