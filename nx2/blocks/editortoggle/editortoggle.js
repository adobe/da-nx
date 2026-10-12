import { LitElement, html, nothing } from 'da-lit';
import { hashChange } from '../../utils/utils.js';
import '../shared/switch/switch.js';
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

class NxEditorToggle extends LitElement {
  static properties = {
    _siteEwEnabled: { state: true },
    _userEnabled: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
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

  async _maybeShowWelcome() {
    if (window.location.pathname !== '/canvas' || !isEwWelcomePending()) return;
    consumeEwWelcome();
    await import('./welcome-dialog.js');
    document.body.append(document.createElement('nx-ew-welcome-dialog'));
  }

  async _maybeShowSwitchback() {
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
    const { pathname, search, hash } = window.location;
    this._userEnabled = pathname === '/edit';
    setEWUserEnabled(this._userEnabled);
    // Arm the matching one-time prompt (no-op after first showing).
    if (this._userEnabled) armEwWelcome();
    else armEwSwitchbackFeedback();

    // Hop to the matching editor if we're on the other one; otherwise reload.
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
    const { pathname } = window.location;
    if (!['/edit', '/canvas'].includes(pathname)) return nothing;
    return html`
      <nx-switch
        label="New Authoring"
        .checked=${pathname === '/canvas'}
        @change=${this._toggle}
      ></nx-switch>
    `;
  }
}

if (!customElements.get('nx-editortoggle')) {
  customElements.define('nx-editortoggle', NxEditorToggle);
}
