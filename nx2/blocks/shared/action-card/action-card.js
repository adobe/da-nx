import { LitElement, html, nothing } from 'da-lit';
import { getConfig, loc } from '../../../scripts/nx.js';
import { loadStyle } from '../../../utils/utils.js';

const styles = await loadStyle(import.meta.url);
const { codeBase } = getConfig();

const MORE_ICON = `${codeBase}/img/icons/s2-icon-more-20-n.svg`;

const loadMenu = (() => {
  let promise;
  return () => {
    promise ??= import('../menu/menu.js');
    return promise;
  };
})();

// `use` at 100% scales the referenced <svg> (whatever its native size) into the frame.
const iconSvg = (url) => html`<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="${url}#icon" width="100%" height="100%"></use></svg>`;

const isExternal = (href) => new URL(href, window.location.href).origin !== window.location.origin;

class NxActionCard extends LitElement {
  static properties = {
    heading: { type: String },
    description: { type: String },
    icon: { type: String },
    tint: { type: String },
    menu: { attribute: false },
    action: { type: String },
    actionLabel: { type: String, attribute: 'action-label' },
    _menuOpen: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
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
    return html`<div class="tile ${validTint ? 'has-bg' : ''}" style=${validTint ? `--tile-bg: ${this.tint}` : nothing}>
      ${this.icon ? iconSvg(this.icon) : nothing}
    </div>`;
  }

  _renderMore() {
    if (!this.menu?.length) return nothing;
    // nx-menu's `select` event is composed and bubbles out of this card.
    return html`
      <button type="button" class="more" aria-haspopup="menu"
        aria-expanded=${this._menuOpen ? 'true' : 'false'}
        aria-label="${loc`More options for`} ${this.heading ?? ''}"
        @click=${this._onMoreClick}>${iconSvg(MORE_ICON)}</button>
      <nx-menu @close=${this._onMenuClose}></nx-menu>`;
  }

  _renderAction() {
    if (!this.action) return nothing;
    const label = this.actionLabel || loc`Open`;
    const external = isExternal(this.action);
    return html`<a class="action" href=${this.action}
      target=${external ? '_blank' : nothing} rel=${external ? 'noopener' : nothing}
      aria-label="${label} ${this.heading ?? ''}">${label}</a>`;
  }

  render() {
    return html`
      <div class="card">
        <div class="header">${this._renderTile()}${this._renderMore()}</div>
        <div class="body">
          <h3 class="heading">${this.heading}</h3>
          ${this.description ? html`<p class="description">${this.description}</p>` : nothing}
        </div>
        <div class="footer">
          <div class="extra"><slot name="extra"></slot></div>
          ${this._renderAction()}
        </div>
      </div>`;
  }
}

if (!customElements.get('nx-action-card')) customElements.define('nx-action-card', NxActionCard);
