import { LitElement, html, nothing } from 'da-lit';

import { loadFragment } from '../fragment/fragment.js';
import { loadStyle, hashChange } from '../../utils/utils.js';
import { getConfig } from '../../scripts/nx.js';
import { PANEL_EVENT, subscribePanelSections, subscribePanelVisibility } from '../../utils/panel.js';
import { ICON_NAMES } from '../shared/chat/constants.js';

const DEFAULT_NAV_PATH = '/nx/fragments/sidenav';
const HASH_AWARE = ['Home', 'Apps'];
const { codeBase } = getConfig();

const style = await loadStyle(import.meta.url);
const CHAT_ICON_HREF = `${codeBase}/img/icons/${ICON_NAMES.coworker}.svg#icon`;

class NXSidenav extends LitElement {
  static properties = {
    path: { attribute: false },
    _navLinks: { state: true },
    _hasChatPanel: { state: true },
    _chatEnabled: { state: true },
    _chatChecking: { state: true },
    _chatPanelState: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._unsubscribePanels = subscribePanelSections((sections) => {
      this._hasChatPanel = sections.includes('chat');
    });
    this._unsubscribePanelVisibility = subscribePanelVisibility((sections, restoring = []) => {
      if (sections.includes('chat')) {
        this._chatPanelState = 'open';
      } else {
        this._chatPanelState = restoring.includes('chat') ? 'restoring' : 'closed';
      }
    });
    this._unsubscribeHash = hashChange.subscribe((state) => this.syncChatEnabled(state));
    this.loadNav();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubscribePanels?.();
    this._unsubscribePanelVisibility?.();
    this._unsubscribeHash?.();
    this._chatSite = undefined;
    this._chatEnabled = false;
    this._chatChecking = false;
  }

  change(props) {
    if (props.has('path') && this.path) {
      this.loadNav();
    }
  }

  async syncChatEnabled(state) {
    const { org, site } = state ?? {};
    if (this._chatSite && this._chatSite.org === org && this._chatSite.site === site) return;
    const context = { org, site };
    this._chatSite = context;
    this._chatChecking = !!org;
    if (!org) {
      this._chatEnabled = false;
      return;
    }
    const { isEwChatEnabled } = await import('../../utils/ewFlags.js');
    const chatEnabled = await isEwChatEnabled(context);
    if (this._chatSite !== context || !this.isConnected) return;
    this._chatEnabled = chatEnabled;
    this._chatChecking = false;
  }

  async loadNav() {
    const fragment = await loadFragment(this._path);
    // Format the links down so we can manipulate them easier
    this._navLinks = [...fragment.querySelectorAll('a')].map((link) => ({
      icon: link.querySelector('.icon'),
      text: link.textContent.trim(),
      href: link.href,
    }));
  }

  getActiveClass(a) {
    const { location } = window;
    // Don't consider anything off origin
    if (!a.href.startsWith(location.origin)) return '';
    const { pathname } = new URL(a.href);
    // Return if exact match
    if (pathname === location.pathname) return 'is-active';
    // Any descendant would be considered active
    if (pathname !== '/' && location.pathname.startsWith(pathname)) return 'is-active';
    // Unknown
    return '';
  }

  handleClick(e, a) {
    if (!HASH_AWARE.includes(a.text)) return;
    if (!window.location.hash?.startsWith('#/')) return;
    e.preventDefault();
    const [org, repo] = window.location.hash.slice(2).split('/');
    const target = org && repo ? `${a.href}#/${org}/${repo}` : a.href;
    window.open(target, target);
  }

  get _path() {
    return this.path || DEFAULT_NAV_PATH;
  }

  toggleChat() {
    const chatOpen = this._chatPanelState === 'open';
    if (this._chatChecking && !chatOpen) return;
    const type = chatOpen ? PANEL_EVENT.CLOSE : PANEL_EVENT.OPEN;
    document.dispatchEvent(new CustomEvent(type, { detail: { section: 'chat' } }));
  }

  render() {
    if (!this._navLinks) return nothing;
    const homeIndex = this._navLinks.findIndex((a) => a.text === 'Home');
    const chatOpen = this._chatPanelState === 'open';

    return html`
      <ul>
        ${this._navLinks.map((a, index) => html`
          ${this._chatEnabled && this._hasChatPanel && index === homeIndex ? html`
            <li class="nav-link chat ${chatOpen ? 'is-active' : ''} ${this._chatPanelState === 'restoring' ? 'is-restoring' : ''}">
              <button type="button" aria-label=${chatOpen ? 'Close chat' : 'Open chat'} aria-expanded=${chatOpen ? 'true' : 'false'} aria-disabled=${this._chatChecking && !chatOpen ? 'true' : 'false'} title="Chat" @click=${this.toggleChat}>
                <span class="icon" aria-hidden="true">
                  <svg viewBox="0 0 20 20"><use href=${CHAT_ICON_HREF}></use></svg>
                </span>
              </button>
            </li>
          ` : nothing}
          <li class="nav-link ${this.getActiveClass(a)}"><a href="${a.href}" @click=${(e) => this.handleClick(e, a)}>${a.icon}${a.text}</a></li>
        `)}
      </ul>
    `;
  }
}

customElements.define('nx-sidenav', NXSidenav);
