import { LitElement, html, nothing } from 'da-lit';
import { loadStyle, hashChange } from '../../utils/utils.js';
import {
  isEWEnabledBySite,
  isEWUserEnabled,
  setEWUserEnabled,
  armEwWelcome,
  isEwWelcomePending,
  consumeEwWelcome,
  armEwSwitchbackFeedback,
  isEwSwitchbackPending,
  consumeEwSwitchback,
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
 *
 * Two placements, selected by the `variant` attribute:
 *  - `toolbar` (default): the nav-injected switch. Shown on `/edit` only; on
 *    `/canvas` it steps aside so the switch lives in the profile menu instead.
 *  - `menu`: rendered inside the profile popover (see profile.js). Shown on
 *    `/canvas` only.
 * Both instances coexist on each editor route (the hidden one just renders
 * nothing), so the one-time prompts — the welcome guide on canvas, the
 * switch-back feedback on /edit — are triggered from the always-present
 * toolbar instance to avoid firing them twice.
 */
const EDITOR_PATHS = new Set(['/edit', '/canvas']);
class NxEditorToggle extends LitElement {
  static properties = {
    variant: { type: String, reflect: true },
    _siteEwEnabled: { state: true },
    _userEnabled: { state: true },
  };

  constructor() {
    super();
    this.variant = 'toolbar';
  }

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
    this._maybeShowWelcome();
    this._maybeShowSwitchback();
    this._unsubHash = hashChange.subscribe((state) => this._onHashState(state));
  }

  // First time on canvas after toggling EW on: show the welcome guide once.
  // The pending flag was armed in _toggle() and survives the reload/path-swap
  // it triggers; consuming it here permanently marks the guide as seen. Only
  // the toolbar instance fires it — the menu instance also mounts on canvas,
  // and we don't want the dialog opening twice.
  async _maybeShowWelcome() {
    if (this.variant === 'menu') return;
    if (window.location.pathname !== '/canvas' || !isEwWelcomePending()) return;
    consumeEwWelcome();
    await import('./welcome-dialog.js');
    document.body.append(document.createElement('nx-ew-welcome-dialog'));
  }

  // Mirror of _maybeShowWelcome for the reverse direction: first time back on
  // /edit after toggling EW off, ask why. Same toolbar-only guard so the menu
  // instance (which also mounts on /edit) doesn't open it a second time.
  async _maybeShowSwitchback() {
    if (this.variant === 'menu') return;
    if (window.location.pathname !== '/edit' || !isEwSwitchbackPending()) return;
    consumeEwSwitchback();
    await import('./switchback-dialog.js');
    document.body.append(document.createElement('nx-ew-switchback-dialog'));
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
    // Arm the matching one-time prompt for wherever we're headed: the welcome
    // guide on canvas when turning on, the switch-back feedback on /edit when
    // turning off. Both no-op after their first showing (see ewFlags.js).
    if (this._userEnabled) armEwWelcome();
    else armEwSwitchbackFeedback();

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
    if (this._siteEwEnabled) return nothing;
    // Toolbar lives on /edit; on /canvas the switch moves into the profile menu.
    const visiblePath = this.variant === 'menu' ? '/canvas' : '/edit';
    if (window.location.pathname !== visiblePath) return nothing;
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
