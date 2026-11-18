import { LitElement, html } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';

const styles = await loadStyle(import.meta.url);
let activeTooltip;

class NxTooltip extends LitElement {
  static properties = {
    for: { type: String },
    placement: { type: String, reflect: true },
  };

  get _supported() { return typeof this.showPopover === 'function'; }

  get open() { return this._supported && this.matches(':popover-open'); }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    this.id ||= `nx-tooltip-${crypto.randomUUID()}`;
    this.role = 'tooltip';
    this.popover = 'manual';
    this.updateComplete.then(() => {
      if (this.isConnected) this._bindTrigger();
    });
  }

  disconnectedCallback() {
    this._unbindTrigger();
    super.disconnectedCallback();
  }

  updated(changed) {
    if (changed.has('for')) this._bindTrigger();
    if (changed.has('placement')) this._positionArrow();
  }

  _bindTrigger() {
    const trigger = this._supported ? this.getRootNode().getElementById(this.for ?? '') : null;
    if (trigger === this._trigger) return;
    this._unbindTrigger();
    if (!trigger || trigger === this) return;
    this._trigger = trigger;
    const descriptions = new Set((trigger.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean));
    descriptions.add(this.id);
    trigger.setAttribute('aria-describedby', [...descriptions].join(' '));
    this._controller = new AbortController();
    const { signal } = this._controller;
    [
      [trigger, 'pointerenter', this._onEnter],
      [trigger, 'pointerleave', this._onLeave],
      [trigger, 'focus', this._onFocus],
      [trigger, 'blur', this._scheduleClose],
      [trigger, 'click', this.close],
      [this, 'pointerenter', this._onEnter],
      [this, 'pointerleave', this._onLeave],
      [document, 'keydown', this._onKeydown, true],
      [document, 'scroll', this._positionArrow, true],
      [window, 'resize', this._positionArrow],
    ].forEach(([target, type, listener, capture = false]) => {
      target.addEventListener(type, listener, { signal, capture });
    });
  }

  _unbindTrigger() {
    this.close();
    this._controller?.abort();
    if (!this._trigger) return;
    const descriptions = (this._trigger.getAttribute('aria-describedby') ?? '')
      .split(/\s+/).filter((id) => id && id !== this.id);
    if (descriptions.length) this._trigger.setAttribute('aria-describedby', descriptions.join(' '));
    else this._trigger.removeAttribute('aria-describedby');
    this._trigger = undefined;
  }

  _onEnter = (event) => {
    if (event.pointerType === 'touch') return;
    this._hovered = true;
    clearTimeout(this._hideTimer);
    if (event.currentTarget !== this._trigger || this.open) return;
    clearTimeout(this._showTimer);
    this._showTimer = setTimeout(() => this._show(), 500);
  };

  _onLeave = () => {
    this._hovered = false;
    this._scheduleClose();
  };

  _onFocus = () => {
    if (this._trigger.matches(':focus-visible')) this._show();
  };

  _scheduleClose = () => {
    clearTimeout(this._showTimer);
    this._showTimer = undefined;
    clearTimeout(this._hideTimer);
    this._hideTimer = setTimeout(() => {
      if (!this._hovered && !this._trigger?.matches(':focus-visible')) this.close();
    }, 100);
  };

  _onKeydown = (event) => {
    if (event.key !== 'Escape') return;
    const wasOpen = this.open;
    this.close();
    if (wasOpen) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  _show() {
    clearTimeout(this._showTimer);
    this._showTimer = undefined;
    if (!this._trigger?.isConnected || this._trigger.matches(':disabled')
      || !this.textContent.trim() || this.open) return;
    activeTooltip?.close();
    activeTooltip = this;
    this.showPopover({ source: this._trigger });
    this._positionArrow();
  }

  close = () => {
    clearTimeout(this._showTimer);
    clearTimeout(this._hideTimer);
    this._showTimer = undefined;
    this._hovered = false;
    if (this.open) this.hidePopover();
    if (activeTooltip === this) activeTooltip = undefined;
  };

  _positionArrow = () => {
    if (!this.open || !this._trigger) return;
    const rect = this.getBoundingClientRect();
    const anchor = this._trigger.getBoundingClientRect();
    if (rect.bottom <= anchor.top) this.dataset.side = 'top';
    else if (rect.top >= anchor.bottom) this.dataset.side = 'bottom';
    else if (rect.right <= anchor.left) this.dataset.side = 'left';
    else this.dataset.side = 'right';
    this.style.setProperty('--tooltip-arrow-x', `${Math.max(8, Math.min(rect.width - 8, anchor.left + anchor.width / 2 - rect.left))}px`);
    this.style.setProperty('--tooltip-arrow-y', `${Math.max(8, Math.min(rect.height - 8, anchor.top + anchor.height / 2 - rect.top))}px`);
  };

  render() {
    return html`<span class="arrow" aria-hidden="true"></span><slot></slot>`;
  }
}

if (!customElements.get('nx-tooltip')) customElements.define('nx-tooltip', NxTooltip);
