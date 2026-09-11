import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../utils/utils.js';
import { loadFragment } from '../fragment/fragment.js';
import { loadHrefSvg, ICONS_BASE } from '../../utils/svg.js';
import { parseWhatsNewEntries } from './parse-whatsnew.js';
import { getWhatsNewLastSeen } from '../../utils/whatsNewFlags.js';

const style = await loadStyle(import.meta.url);
const buttonStyle = await loadStyle(new URL('../../styles/buttons.css', import.meta.url).href);
const icon = await loadHrefSvg(`${ICONS_BASE}S2_Icon_Lightbulb_20_N.svg`);

// Well-known, hardcoded fragment — same convention as welcome-dialog.js and
// whatsnew-dialog.js, which reads from the same path.
const WHATSNEW_PATH = 'https://main--da-live--adobe.aem.live/nx/fragments/guides/whats-new';

/**
 * Nav-bar "What's new" trigger. Rendered by nav.js's decorateActions() from a
 * plain "Whatsnew" label <li> — same convention as nx-feedback — so a PM can
 * add or remove this from any page's nav fragment independently of code.
 *
 * Shows a dot and auto-opens whatsnew-dialog.js once on connect if the
 * fragment's newest entry is newer than what this user last saw (see
 * whatsNewFlags.js); also opens on click regardless. Either path marks the
 * content seen (whatsnew-dialog.js owns that), which clears the dot on the
 * next render of this component.
 */
class NxWhatsNew extends LitElement {
  static properties = {
    _hasUnseen: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style, buttonStyle];
    this._checkUnseen();
  }

  async _checkUnseen() {
    const fragment = await loadFragment(WHATSNEW_PATH);
    const entries = fragment ? parseWhatsNewEntries(fragment) : [];
    if (entries.length === 0) return;
    this._hasUnseen = entries[0].id !== getWhatsNewLastSeen();
    if (this._hasUnseen) this._openDialog();
  }

  async _openDialog() {
    await import('./whatsnew-dialog.js');
    document.body.append(document.createElement('nx-whatsnew-dialog'));
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

if (!customElements.get('nx-whatsnew')) customElements.define('nx-whatsnew', NxWhatsNew);
