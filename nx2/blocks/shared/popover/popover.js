import { LitElement, html } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';

const styles = await loadStyle(import.meta.url);
const SUPPORTS_POPOVER = typeof HTMLElement.prototype.showPopover === 'function';

class NxPopover extends LitElement {
  static properties = {
    open: { type: Boolean, reflect: true },
  };

  get anchor() { return this._anchor; }

  set anchor(val) {
    this._anchor = val;
    if (this.open) this._position();
  }

  _onToggle = (e) => { if (e.newState === 'closed') this._doClose(); };

  _onKeydown = (e) => { if (e.key === 'Escape') this.close(); };

  _onOutsideClick = (e) => {
    const path = e.composedPath();
    if (!path.includes(this) && !path.includes(this._anchor)) this.close();
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    if (SUPPORTS_POPOVER) {
      this.setAttribute('popover', 'auto');
      this.addEventListener('toggle', this._onToggle);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (SUPPORTS_POPOVER) {
      this.removeEventListener('toggle', this._onToggle);
    } else {
      this._removeListeners();
    }
  }

  show({ anchor, x, y, placement } = {}) {
    this._coords = anchor ? null : { x, y };
    this._placement = placement ?? this.getAttribute('placement') ?? 'below';
    this.anchor = anchor ?? null;
    this.open = true;
  }

  updated(changed) {
    if (!changed.has('open')) return;
    if (this.open) {
      if (SUPPORTS_POPOVER) this.showPopover();
      else this._addListeners();
      this._position();
    } else if (!SUPPORTS_POPOVER) {
      this._removeListeners();
    }
  }

  _doClose() {
    this.open = false;
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  _position() {
    if (this._coords) {
      const { x, y } = this._coords;
      this.style.top = `${y}px`;
      this.style.bottom = 'auto';
      this.style.left = `${x}px`;
      return;
    }

    if (!this._anchor) return;
    const rect = this._anchor.getBoundingClientRect();
    this.style.left = `${rect.left}px`;

    requestAnimationFrame(() => {
      const gap = parseFloat(getComputedStyle(this).getPropertyValue('--popover-gap')) || 0;
      const pop = this.getBoundingClientRect();
      const above = rect.top - pop.height - gap;
      const below = rect.bottom + gap;
      let placement = this._placement;
      if (placement === 'auto') {
        placement = (below + pop.height > window.innerHeight && above >= 0) ? 'above' : 'below';
      }

      if (placement === 'above') {
        this.style.top = 'auto';
        this.style.bottom = `${window.innerHeight - rect.top + gap}px`;
      } else {
        this.style.bottom = 'auto';
        this.style.top = `${below}px`;
      }

      if (pop.right > window.innerWidth) {
        this.style.left = `${rect.right - pop.width}px`;
      }
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

  close() {
    if (SUPPORTS_POPOVER) this.togglePopover(false);
    else this._doClose();
  }

  render() {
    return html`
      <slot></slot>
      <slot name="actions"></slot>
    `;
  }
}

customElements.define('nx-popover', NxPopover);
