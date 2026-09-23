import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../utils/utils.js';
import { loadHrefSvg, ICONS_BASE } from '../../utils/svg.js';
import { fetchPublishedDate } from './parse-whatsnew.js';
import { getWhatsNewLastSeenDate } from './whatsnew-flags.js';

const style = await loadStyle(import.meta.url);
const buttonStyle = await loadStyle(new URL('../../styles/buttons.css', import.meta.url).href);
const icon = await loadHrefSvg(`${ICONS_BASE}S2_Icon_Lightbulb_20_N.svg`);

// Well-known, hardcoded fragment path — relative so it resolves against
// whatever host is actually serving the current page, same as any other
// project reusing nx2 as its shell would get its own copy at this path.
const WHATSNEW_PATH = '/nx/fragments/guides/whats-new';

/**
 * Nav-bar "What's new" trigger. Rendered by nav.js's decorateActions() from a
 * plain "Whatsnew" label <li> — same convention as nx-feedback — so a PM can
 * add or remove this from any page's nav fragment independently of code.
 *
 * Shows a dot and auto-opens whatsnew-dialog.js once on connect if the
 * fragment's published-date is newer than what this user last saw (see
 * whatsnew-flags.js); also opens on click regardless. The dot clears once
 * every entry has actually been viewed (scrolled to or clicked in the toc),
 * not just on close — whatsnew-dialog.js dispatches nx-whatsnew-all-seen
 * when that happens.
 */
class NxWhatsNew extends LitElement {
  static properties = {
    _hasUnseen: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style, buttonStyle];
    this._onAllSeen = () => { this._hasUnseen = false; };
    window.addEventListener('nx-whatsnew-all-seen', this._onAllSeen);
    this._checkUnseen();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('nx-whatsnew-all-seen', this._onAllSeen);
  }

  async _checkUnseen() {
    const publishedDate = await fetchPublishedDate(WHATSNEW_PATH);
    if (!publishedDate) return;
    const lastSeen = getWhatsNewLastSeenDate();
    this._hasUnseen = !lastSeen || lastSeen < publishedDate;
    if (this._hasUnseen) this._openDialog();
  }

  async _openDialog() {
    if (document.querySelector('nx-whatsnew-dialog')) return;
    await import('./whatsnew-dialog.js');
    if (document.querySelector('nx-whatsnew-dialog')) return;
    const dialog = document.createElement('nx-whatsnew-dialog');
    dialog.returnFocusTo = this.shadowRoot.querySelector('button');
    document.body.append(dialog);
  }

  render() {
    return html`
      <button type="button" class="nx-action-btn-quiet" @click=${this._openDialog}>
        <span class="wn-trigger-icon">
          ${icon}
          ${this._hasUnseen ? html`<span class="wn-trigger-dot" aria-hidden="true"></span>` : nothing}
        </span>
        <span>What's new</span>
      </button>
    `;
  }
}

customElements.define('nx-whatsnew', NxWhatsNew);
