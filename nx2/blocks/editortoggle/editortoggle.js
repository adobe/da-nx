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
 * `ew.enabled` flag flips it on for everyone. Persisted per-user via
 * nx2/utils/ewFlags.js; only `_toggle()` writes the flag — landing on /edit
 * or /canvas never does. /edit redirects to /canvas when the site flag or
 * the user flag is on (site wins); /canvas never redirects back.
 *
 * Hidden when the site flag is on. Shown only on /edit and /canvas, via two
 * placements selected by `variant`: `toolbar` (default, nav-injected, shown
 * on /edit) and `menu` (profile popover, shown on /canvas). Both mount on
 * every editor route, so the one-time welcome/switch-back prompts fire from
 * the toolbar instance only, to avoid double-firing.
 */
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
    if (this._redirectToCanvasIfNeeded()) return;
    this._maybeShowWelcome();
    this._maybeShowSwitchback();
    this._unsubHash = hashChange.subscribe((state) => this._onHashState(state));
  }

  // /edit redirects to /canvas if the site or user flag is on; /canvas never redirects.
  _redirectToCanvasIfNeeded() {
    if (window.location.pathname !== '/edit') return false;
    if (!this._siteEwEnabled && !this._userEnabled) return false;
    const { search, hash } = window.location;
    window.location.href = `/canvas${search}${hash}`;
    return true;
  }

  // One-time welcome guide after toggling on; toolbar-only so it doesn't fire twice.
  async _maybeShowWelcome() {
    if (this.variant === 'menu') return;
    if (window.location.pathname !== '/canvas' || !isEwWelcomePending()) return;
    consumeEwWelcome();
    await import('./welcome-dialog.js');
    document.body.append(document.createElement('nx-ew-welcome-dialog'));
  }

  // One-time switch-back prompt after toggling off; toolbar-only so it doesn't fire twice.
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
    // No site yet (e.g. org-only view) — show the toggle rather than flash-hide it.
    if (!state?.org || !state?.site) {
      this._siteEwEnabled = false;
      return;
    }
    this._siteEwEnabled = await isEWEnabledBySite({ org: state.org, site: state.site });
    this._redirectToCanvasIfNeeded();
  }

  _toggle() {
    this._userEnabled = !this._userEnabled;
    setEWUserEnabled(this._userEnabled);
    // Arm the matching one-time prompt (no-op after first showing).
    if (this._userEnabled) armEwWelcome();
    else armEwSwitchbackFeedback();

    // Hop to the matching editor if we're on the other one; otherwise reload.
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
        <span class="editortoggle-label">New Authoring</span>
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
