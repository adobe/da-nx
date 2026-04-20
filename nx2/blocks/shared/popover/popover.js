import { LitElement, html } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';

const styles = await loadStyle(import.meta.url);
const SUPPORTS_POPOVER = typeof HTMLElement.prototype.showPopover === 'function';

class NxPopover extends LitElement {
  static properties = {
    open: { type: Boolean, reflect: true },
  };

  _placement = 'below';

  get anchor() { return this._anchor; }

  set anchor(val) {
    this._anchor = val;
    if (this.open) this._position();
  }

  _onKeydown = (e) => { if (e.key === 'Escape') this.close(); };

  _onOutsideClick = (e) => {
    const path = e.composedPath();
    if (!path.includes(this) && !path.includes(this._anchor)) this.close();
  };

  _onToggle = (e) => {
    if (e.newState === 'closed') this.close();
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    if (SUPPORTS_POPOVER) {
      this.setAttribute('popover', 'manual');
      this.addEventListener('toggle', this._onToggle);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (SUPPORTS_POPOVER) this.removeEventListener('toggle', this._onToggle);
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
      if (SUPPORTS_POPOVER) this.togglePopover(true);
    } else {
      this._removeListeners();
      if (SUPPORTS_POPOVER) this.togglePopover(false);
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
    requestAnimationFrame(() => {
      const pop = this.getBoundingClientRect();
      let { left } = rect;
      let placement = this._placement;
      if (placement === 'auto') {
        placement = (pop.bottom > window.innerHeight && rect.top - pop.height - gap >= 0) ? 'above' : 'below';
      }
      if (placement === 'below-end' || left + pop.width > window.innerWidth) left = rect.right - pop.width;

      this.style.left = `${left}px`;
      if (placement === 'above') {
        this.style.top = 'auto';
        this.style.bottom = `${window.innerHeight - rect.top + gap}px`;
      } else {
        this.style.top = `${rect.bottom + gap}px`;
        this.style.bottom = 'auto';
      }
      this.style.visibility = '';
    });
  }

  _addListeners() {
    document.addEventListener('keydown', this._onKeydown);
    document.addEventListener('pointerdown', this._onOutsideClick);
  }

  _removeListeners() {
    document.removeEventListener('keydown', this._onKeydown);
    document.removeEventListener('pointerdown', this._onOutsideClick);
  }

  render() {
    return html`
      <slot></slot>
      <slot name="actions"></slot>
    `;
  }
}

customElements.define('nx-popover', NxPopover);
