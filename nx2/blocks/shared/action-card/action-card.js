import { LitElement, html, nothing } from 'da-lit';
import { loc } from '../../../scripts/nx.js';
import { loadStyle } from '../../../utils/utils.js';
import { loadHrefSvg } from '../../../utils/svg.js';

// Shared buttons.css: action (nx-btn-primary, outlined) and "…" (nx-action-btn-icon).
// The "…" icon ships with nx2 and is inlined, so it works on any host (no cross-origin <use>).
const [buttonStyles, styles, moreIcon] = await Promise.all([
  loadStyle(new URL('../../../styles/buttons.css', import.meta.url).href),
  loadStyle(import.meta.url),
  loadHrefSvg(new URL('../../../img/icons/s2-icon-more-20-n.svg', import.meta.url).href),
]);

const loadMenu = (() => {
  let promise;
  return () => {
    promise ??= import('../menu/menu.js');
    return promise;
  };
})();

// `use` at 100% scales the referenced <svg> (whatever its native size) into the frame.
const iconSvg = (url) => html`<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="${url}#icon" width="100%" height="100%"></use></svg>`;

// An unparsable URL counts as not external, so a bad `action` never breaks rendering.
const isExternal = (href) => {
  try {
    return new URL(href, window.location.href).origin !== window.location.origin;
  } catch {
    return false;
  }
};

// Targets that stay in the current browsing context need no `rel="noopener"`.
const SAME_CONTEXT = ['_self', '_parent', '_top'];

class NxActionCard extends LitElement {
  static properties = {
    heading: { type: String },
    description: { type: String },
    icon: { type: String },
    tint: { type: String },
    menu: { attribute: false },
    action: { type: String },
    actionLabel: { type: String, attribute: 'action-label' },
    actionTarget: { type: String, attribute: 'action-target' },
    _menuOpen: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [buttonStyles, styles];
  }

  async _onMoreClick(e) {
    const menu = this.shadowRoot.querySelector('nx-menu');
    if (this._menuOpen) {
      menu?.close();
      return;
    }
    const btn = e.currentTarget;
    await loadMenu();
    menu.items = this.menu;
    await menu.updateComplete;
    menu.show({ anchor: btn });
    this._menuOpen = true;
  }

  _onMenuClose() {
    this._menuOpen = false;
  }

  _renderTile() {
    const validTint = this.tint && CSS.supports('color', this.tint);
    if (!this.icon && !validTint) return nothing;
    return html`<div class="tile ${validTint ? 'has-bg' : ''}" style=${validTint ? `--tile-bg: ${this.tint}` : nothing}>
      ${this.icon ? iconSvg(this.icon) : nothing}
    </div>`;
  }

  _renderHeader() {
    const tile = this._renderTile();
    const more = this._renderMore();
    if (tile === nothing && more === nothing) return nothing;
    return html`<div class="header">${tile}${more}</div>`;
  }

  get _moreSvg() {
    this._moreIcon ??= moreIcon?.cloneNode(true);
    return this._moreIcon ?? nothing;
  }

  _renderMore() {
    if (!this.menu?.length) return nothing;
    return html`
      <button type="button" class="more nx-action-btn-icon nx-btn-sm" aria-haspopup="menu"
        aria-expanded=${this._menuOpen ? 'true' : 'false'}
        aria-label="${loc`More options for`} ${this.heading ?? ''}"
        @click=${this._onMoreClick}>${this._moreSvg}</button>`;
  }

  _renderAction() {
    if (!this.action) return nothing;
    const label = this.actionLabel || loc`Open`;
    // An explicit target wins; otherwise links to another origin open in a new tab.
    const target = this.actionTarget || (isExternal(this.action) ? '_blank' : undefined);
    const rel = target && !SAME_CONTEXT.includes(target) ? 'noopener' : undefined;
    return html`<a class="action nx-btn-primary" href=${this.action}
      target=${target ?? nothing} rel=${rel ?? nothing}
      aria-label="${label} ${this.heading ?? ''}">${label}</a>`;
  }

  // nx-menu sits outside the layout (it opens anchored to the "…" button);
  // its `select` event is composed and bubbles out of this card.
  render() {
    return html`
      <div class="card">
        ${this._renderHeader()}
        <div class="body">
          <h3 class="heading">${this.heading}</h3>
          ${this.description ? html`<p class="description">${this.description}</p>` : nothing}
        </div>
        <div class="footer">
          <div class="extra"><slot name="extra"></slot></div>
          ${this._renderAction()}
        </div>
      </div>
      ${this.menu?.length ? html`<nx-menu @close=${this._onMenuClose}></nx-menu>` : nothing}`;
  }
}

if (!customElements.get('nx-action-card')) customElements.define('nx-action-card', NxActionCard);
