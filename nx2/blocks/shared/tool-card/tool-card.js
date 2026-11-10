import { LitElement, html, nothing } from 'da-lit';
import { getConfig, loc } from '../../../scripts/nx.js';
import { loadStyle } from '../../../utils/utils.js';

const styles = await loadStyle(import.meta.url);
const { codeBase } = getConfig();

const loadMenu = (() => {
  let promise;
  return () => {
    promise ??= import('../menu/menu.js');
    return promise;
  };
})();

// Short icon name (`treeview`, `TreeView`, `tree-view`) → `s2-icon-treeview-20-n`.
const iconFile = (name) => {
  const short = (name ?? '').toLowerCase().replaceAll('-', '');
  return /^[a-z0-9]+$/.test(short) ? `s2-icon-${short}-20-n` : '';
};

// `use` at 100% scales the referenced <svg> (whatever its native size) into the frame.
const iconSvg = (file) => html`<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="${codeBase}/img/icons/${file}.svg#icon" width="100%" height="100%"></use></svg>`;

const isExternal = (href) => new URL(href, window.location.href).origin !== window.location.origin;

const absolute = (href) => new URL(href, window.location.href).href;

class NxToolCard extends LitElement {
  static properties = {
    heading: { type: String },
    description: { type: String },
    href: { type: String },
    learnMoreHref: { type: String, attribute: 'learn-more-href' },
    icon: { type: String },
    image: { type: String },
    tint: { type: String },
    byline: { type: String },
    bylineIcon: { type: String, attribute: 'byline-icon' },
    _menuOpen: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  get _menuItems() {
    return [
      this.learnMoreHref && { id: 'learn-more', label: loc`Learn more`, url: absolute(this.learnMoreHref) },
      this.href && { id: 'open-new-tab', label: loc`Open in new tab`, url: absolute(this.href) },
    ].filter(Boolean);
  }

  async _onMoreClick(e) {
    const menu = this.shadowRoot.querySelector('nx-menu');
    if (this._menuOpen && menu) {
      menu.close();
      return;
    }
    const btn = e.currentTarget;
    await loadMenu();
    const items = this._menuItems;
    const el = this.shadowRoot.querySelector('nx-menu');
    el.items = items.map(({ id, label }) => ({ id, label }));
    await el.updateComplete;
    el.show({ anchor: btn });
    this._menuOpen = true;
  }

  _onMenuSelect({ detail }) {
    const item = this._menuItems.find((i) => i.id === detail?.id);
    if (item) window.open(item.url, '_blank', 'noopener');
  }

  _onMenuClose() {
    this._menuOpen = false;
  }

  _renderTile() {
    const validTint = this.tint && CSS.supports('color', this.tint);
    const file = iconFile(this.icon);
    const icon = file ? iconSvg(file) : nothing;
    const content = this.image ? html`<img src=${this.image} alt="" loading="lazy">` : icon;
    return html`<div class="tile ${validTint ? 'has-bg' : ''}" style=${validTint ? `--tile-bg: ${this.tint}` : nothing}>${content}</div>`;
  }

  _renderMore() {
    if (!this._menuItems.length) return nothing;
    return html`
      <button type="button" class="more" aria-haspopup="menu"
        aria-expanded=${this._menuOpen ? 'true' : 'false'}
        aria-label="${loc`More options for`} ${this.heading ?? ''}"
        @click=${this._onMoreClick}>${iconSvg('s2-icon-more-20-n')}</button>
      <nx-menu @select=${this._onMenuSelect} @close=${this._onMenuClose}></nx-menu>`;
  }

  _renderOpen() {
    if (!this.href) return nothing;
    const external = isExternal(this.href);
    return html`<a class="open" href=${this.href}
      target=${external ? '_blank' : nothing} rel=${external ? 'noopener' : nothing}
      aria-label="${loc`Open`} ${this.heading ?? ''}">${loc`Open`}</a>`;
  }

  _renderByline() {
    if (!this.byline) return html`<span></span>`;
    const file = iconFile(this.bylineIcon);
    return html`<span class="byline">
      ${file ? html`<span class="byline-logo">${iconSvg(file)}</span>` : nothing}
      <span class="byline-text">${this.byline}</span>
    </span>`;
  }

  render() {
    return html`
      <div class="card">
        <div class="header">${this._renderTile()}${this._renderMore()}</div>
        <div class="body">
          <h3 class="heading">${this.heading}</h3>
          ${this.description ? html`<p class="description">${this.description}</p>` : nothing}
        </div>
        <div class="footer">${this._renderByline()}${this._renderOpen()}</div>
      </div>`;
  }
}

if (!customElements.get('nx-tool-card')) customElements.define('nx-tool-card', NxToolCard);
