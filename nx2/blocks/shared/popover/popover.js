import { LitElement, html } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';

const styles = await loadStyle(import.meta.url);
const SUPPORTS_POPOVER = typeof HTMLElement.prototype.showPopover === 'function';

class NxPopover extends LitElement {
  static properties = {
    open: { type: Boolean, reflect: true },
    scoped: { type: Boolean },
    persistent: { type: Boolean },
  };

  _placement = 'below';

  get anchor() { return this._anchor; }

  set anchor(val) {
    this._anchor = val;
    if (this.open) this._position();
  }

  get _useNative() { return SUPPORTS_POPOVER && !this.scoped; }

  _onKeydown = (e) => { if (e.key === 'Escape') this.close(); };

  _onOutsideClick = (e) => {
    const path = e.composedPath();
    if (!path.includes(this) && !path.includes(this._anchor)) this.close();
  };

  _onWindowBlur = () => {
    // Clicks in outer frames don't reach this document. Close when focus leaves.
    requestAnimationFrame(() => { if (!document.hasFocus()) this.close(); });
  };

  _onToggle = (e) => {
    if (e.newState === 'closed') this.close();
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    if (this._useNative) {
      this.setAttribute('popover', 'manual');
      this.addEventListener('toggle', this._onToggle);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._useNative) this.removeEventListener('toggle', this._onToggle);
    this._removeListeners();
  }

  show({ anchor, x, y, placement } = {}) {
    this._coords = (!anchor && (x !== undefined || y !== undefined)) ? { x, y } : null;
    this._placement = placement ?? this.getAttribute('placement') ?? 'below';
    this.anchor = anchor ?? null;
    this.open = true;
  }

  updated(changed) {
    if (!changed.has('open')) return;
    if (this.open) {
      this._addListeners();
      this._position();
      if (this._useNative) this.togglePopover(true);
    } else {
      this._removeListeners();
      if (this._useNative) this.togglePopover(false);
    }
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  reposition() {
    if (this.open) this._position();
  }

  _position() {
    if (this._coords) {
      const { x, y } = this._coords;
      this.style.left = `${x}px`;
      this.style.top = `${y}px`;
      return;
    }

    if (!this._anchor) return;
    const rect = this._anchor.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(this).getPropertyValue('--popover-gap')) ?? 0;

    this.style.visibility = 'hidden';

    // For scoped popovers, position:fixed is relative to the containing block.
    // Measure it by sizing to 100%/100% — the browser resolves percentages
    // against the containing block, so getBoundingClientRect() gives its rect.
    let cb = null;
    if (this.scoped) {
      Object.assign(this.style, { top: '0', left: '0', width: '100%', height: '100%' });
      cb = this.getBoundingClientRect();
      this.style.width = '';
      this.style.height = '';
    }
    requestAnimationFrame(() => {
      const pop = this.getBoundingClientRect();
      const cbTop = cb?.top ?? 0;
      let { left } = rect;
      let placement = this._placement;
      if (placement === 'auto') {
        const spaceBelow = (cb?.bottom ?? window.innerHeight) - rect.bottom - gap;
        const spaceAbove = rect.top - cbTop - gap;
        placement = spaceBelow < pop.height && spaceAbove >= pop.height ? 'above' : 'below';
        this._placement = placement;
      }

      if (placement === 'below-end' || left + pop.width > (cb?.right ?? window.innerWidth)) left = rect.right - pop.width;

      this.style.left = `${left - (cb?.left ?? 0)}px`;
      this.style.top = placement === 'above'
        ? `${rect.top - gap - pop.height - cbTop}px`
        : `${rect.bottom + gap - cbTop}px`;
      this.style.visibility = '';
    });
  }

  _addListeners() {
    if (this.persistent) return;
    document.addEventListener('keydown', this._onKeydown);
    document.addEventListener('pointerdown', this._onOutsideClick);
    window.addEventListener('blur', this._onWindowBlur);
  }

  _removeListeners() {
    document.removeEventListener('keydown', this._onKeydown);
    document.removeEventListener('pointerdown', this._onOutsideClick);
    window.removeEventListener('blur', this._onWindowBlur);
  }

  render() {
    return html`
      <slot></slot>
      <slot name="actions"></slot>
    `;
  }
}

customElements.define('nx-popover', NxPopover);
