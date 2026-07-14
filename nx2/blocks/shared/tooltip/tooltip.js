import { LitElement, html } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';
import '../popover/popover.js';

const styles = await loadStyle(import.meta.url);

const SHOW_DELAY = 300;

let uid = 0;

// Flips to the other side only when the preferred side doesn't fit but the
// opposite one does — matches nx-popover's own 'auto' placement heuristic.
function flipIfNeeded(preferred, spaceAbove, spaceBelow, height) {
  if (preferred === 'above' && spaceAbove < height && spaceBelow >= height) return 'below';
  if (preferred === 'below' && spaceBelow < height && spaceAbove >= height) return 'above';
  return preferred;
}

class NxTooltip extends LitElement {
  static properties = {
    placement: { type: String },
  };

  get _popover() { return this.shadowRoot.querySelector('nx-popover'); }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    uid += 1;
    this._id = `nx-tooltip-${uid}`;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearTimeout(this._showTimer);
  }

  firstUpdated() {
    this._wireTrigger(this.shadowRoot.querySelector('slot[name="trigger"]'));
  }

  _wireTrigger(slot) {
    const [trigger] = slot.assignedElements();
    if (!trigger || trigger === this._trigger) return;
    this._trigger = trigger;
    trigger.setAttribute('aria-describedby', this._id);
    trigger.addEventListener('mouseenter', () => this._scheduleShow());
    trigger.addEventListener('mouseleave', () => this.hide());
    trigger.addEventListener('focus', () => this.show());
    trigger.addEventListener('blur', () => this.hide());
  }

  _onTriggerSlotChange(e) {
    this._wireTrigger(e.target);
  }

  _scheduleShow() {
    clearTimeout(this._showTimer);
    this._showTimer = setTimeout(() => this.show(), SHOW_DELAY);
  }

  // Centered on the trigger via a transform, so its width doesn't need to be
  // known ahead of time. Vertical placement does need its rendered height (to
  // decide whether to flip when the preferred side doesn't fit), so that part
  // is resolved a frame later, hidden until then to avoid a flash at the
  // wrong spot.
  show() {
    clearTimeout(this._showTimer);
    if (!this._trigger || !this._popover) return;
    const rect = this._trigger.getBoundingClientRect();
    const preferred = this.placement ?? this.getAttribute('placement') ?? 'above';
    const gap = parseFloat(getComputedStyle(this._popover).getPropertyValue('--popover-gap')) || 0;

    this._popover.style.visibility = 'hidden';
    this._popover.style.left = `${rect.left + (rect.width / 2)}px`;
    this._popover.style.transform = 'translateX(-50%)';
    this._popover.show();

    requestAnimationFrame(() => {
      const { height } = this._popover.getBoundingClientRect();
      const spaceAbove = rect.top - gap;
      const spaceBelow = window.innerHeight - rect.bottom - gap;
      const placement = flipIfNeeded(preferred, spaceAbove, spaceBelow, height);
      this._popover.classList.toggle('is-below', placement === 'below');
      Object.assign(this._popover.style, {
        top: placement === 'below' ? `${rect.bottom + gap}px` : 'auto',
        bottom: placement === 'above' ? `${window.innerHeight - rect.top + gap}px` : 'auto',
        visibility: '',
      });
    });
  }

  hide() {
    clearTimeout(this._showTimer);
    this._popover?.close();
  }

  render() {
    return html`
      <slot name="trigger" @slotchange=${this._onTriggerSlotChange}></slot>
      <nx-popover role="tooltip" id=${this._id}>
        <slot></slot>
        <span class="nx-tooltip-arrow" aria-hidden="true"></span>
      </nx-popover>
    `;
  }
}

if (!customElements.get('nx-tooltip')) customElements.define('nx-tooltip', NxTooltip);
