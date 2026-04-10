import { LitElement, html } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';

const styles = await loadStyle(import.meta.url);

class NxPopover extends LitElement {
  static properties = {
    anchor: { attribute: false },
    open: { type: Boolean, reflect: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    this._onKeydown = (e) => { if (e.key === 'Escape') this.close(); };
    this._onOutsideClick = (e) => {
      const path = e.composedPath();
      if (!path.includes(this) && !path.includes(this.anchor)) this.close();
    };
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._removeListeners();
  }

  show({ anchor, x, y, placement } = {}) {
    this.anchor = anchor ?? null;
    this._coords = anchor ? null : { x, y };
    this._placement = placement ?? this.getAttribute('placement') ?? 'below';
    this.open = true;
  }

  updated(changed) {
    if (changed.has('open')) {
      if (this.open) {
        this._position();
        this._addListeners();
      } else {
        this._removeListeners();
      }
    }
    if ((changed.has('anchor')) && this.open) {
      this._position();
    }
  }

  _position() {
    if (this._coords) {
      const { x, y } = this._coords;
      this.style.top = `${y}px`;
      this.style.bottom = 'auto';
      this.style.left = `${x}px`;
      return;
    }

    if (!this.anchor) return;
    const rect = this.anchor.getBoundingClientRect();
    this.style.left = `${rect.left}px`;

    requestAnimationFrame(() => {
      const gap = parseFloat(getComputedStyle(this).getPropertyValue('--popover-gap')) ?? 0;
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
    this.open = false;
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  render() {
    return html`
      <slot></slot>
      <slot name="actions"></slot>
    `;
  }
}

customElements.define('nx-popover', NxPopover);
