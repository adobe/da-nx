import { LitElement, html, nothing } from 'da-lit';
import { loadStyle, hashChange } from '../../utils/utils.js';
import {
  isEWEnabledBySite,
  isEWUserEnabled,
  setEWUserEnabled,
} from '../../utils/ewFlags.js';

const style = await loadStyle(import.meta.url);

/**
 * Nav-bar switch for opting into the new (canvas) editor before a site's
 * `ew.enabled` config flag flips it on globally. Rendered by nav.js's
 * decorateActions() from a plain "editortoggle" label <li> (see feedback.js
 * for the same wiring). Same effect as the site-level ew.enabled flag, but
 * persisted per-user in localStorage — see nx2/utils/ewFlags.js.
 *
 * Hidden whenever `ew.enabled === 'true'` at the site level, since the toggle
 * would be redundant there. Site-level state is re-checked on every hash
 * change so switching between sites shows/hides the toggle correctly.
 *
 * Only rendered on the editor routes (`/edit` and `/canvas`) — nowhere else in
 * the nav does swapping editors make sense.
 */
const EDITOR_PATHS = new Set(['/edit', '/canvas']);
class NxEditorToggle extends LitElement {
  static properties = {
    _siteEwEnabled: { state: true },
    _userEnabled: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._userEnabled = isEWUserEnabled();
    // Landing directly on /edit or /canvas (bookmark, external link, hand-typed
    // URL) is an implicit choice — sync the persisted flag so the switch shows
    // the editor you're actually looking at instead of the last-saved pref.
    const desired = window.location.pathname === '/canvas';
    if (EDITOR_PATHS.has(window.location.pathname) && this._userEnabled !== desired) {
      this._userEnabled = desired;
      setEWUserEnabled(desired);
    }
    this._unsubHash = hashChange.subscribe((state) => this._onHashState(state));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubHash?.();
  }

  async _onHashState(state) {
    // No site in the hash yet (e.g. org-only browse view) — nothing to check
    // against, so show the toggle rather than flash-hiding on first render.
    if (!state?.org || !state?.site) {
      this._siteEwEnabled = false;
      return;
    }
    this._siteEwEnabled = await isEWEnabledBySite({ org: state.org, site: state.site });
  }

  _toggle() {
    this._userEnabled = !this._userEnabled;
    setEWUserEnabled(this._userEnabled);

    // If we're on the "other" editor for the current doc, hop to the matching
    // one so the toggle immediately reflects the choice; otherwise just reload
    // so da-browse (and other consumers) re-read isEWEnabled from scratch.
    const { pathname, search, hash } = window.location;
    const target = this._userEnabled ? '/canvas' : '/edit';
    const other = this._userEnabled ? '/edit' : '/canvas';
    if (pathname === other) {
      window.location.href = `${target}${search}${hash}`;
      return;
    }
    window.location.reload();
  }

  render() {
    if (!EDITOR_PATHS.has(window.location.pathname)) return nothing;
    if (this._siteEwEnabled) return nothing;
    return html`
      <button
        type="button"
        role="switch"
        aria-checked=${this._userEnabled ? 'true' : 'false'}
        class="editortoggle-switch"
        @click=${this._toggle}
      >
        <span class="editortoggle-label">New editor</span>
        <span class="editortoggle-track" aria-hidden="true">
          <span class="editortoggle-handle"></span>
        </span>
      </button>
    `;
  }
}

if (!customElements.get('nx-editortoggle')) {
  customElements.define('nx-editortoggle', NxEditorToggle);
}
