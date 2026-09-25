import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../utils/utils.js';
import { loadHrefSvg } from '../../utils/svg.js';
import { fetchPublishedDate } from './parse-whatsnew.js';
import { getWhatsNewLastSeenDate } from './whatsnew-flags.js';

const style = await loadStyle(import.meta.url);
const buttonStyle = await loadStyle(new URL('../../styles/buttons.css', import.meta.url).href);
const icon = await loadHrefSvg('/img/icons/s2-icon-gift-20-n.svg');

const WHATSNEW_PATH = '/nx/fragments/guides/whats-new';

/**
 * Nav-bar "What's new" trigger. Rendered by nav.js's decorateActions() from a
 * plain "Whatsnew" label <li> — same convention as nx-feedback — so a PM can
 * add or remove this from any page's nav fragment independently of code.
 *
 * Shows a dot if the fragment's published-date is newer than what this user
 * last saw (see whatsnew-flags.js), and opens whatsnew-dialog.js on click.
 * The dot clears once
 * every entry has actually been viewed, not just on close — see
 * whatsnew-dialog.js's nx-whatsnew-all-seen event.
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
  }

  async _openDialog() {
    await import('./whatsnew-dialog.js');
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
      </button>
    `;
  }
}

customElements.define('nx-whatsnew', NxWhatsNew);
