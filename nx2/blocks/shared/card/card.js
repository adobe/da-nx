import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';

const [formStyles, styles] = await Promise.all([
  loadStyle(new URL('../../../styles/form.css', import.meta.url).href),
  loadStyle(import.meta.url),
]);

const SCALES = ['s', 'm', 'l'];

class NxCard extends LitElement {
  static properties = {
    dimensions: { type: String, reflect: true },
    size: { type: String, reflect: true },
    selectable: { type: Boolean, reflect: true },
    selected: { type: Boolean, reflect: true },
    selectionLabel: { type: String, attribute: 'selection-label' },
  };

  constructor() {
    super();
    this.dimensions = 'm';
    this.size = 's';
    this.selectable = false;
    this.selected = false;
    this.selectionLabel = 'Select item';
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [formStyles, styles];
  }

  willUpdate(changed) {
    if (changed.has('dimensions') && !SCALES.includes(this.dimensions)) this.dimensions = 'm';
    if (changed.has('size') && !SCALES.includes(this.size)) this.size = 's';
  }

  async _onSelectionClick(e) {
    e.stopPropagation();
    const input = e.target;
    this.dispatchEvent(new CustomEvent('selectionchange', {
      detail: { selected: input.checked, shiftKey: e.shiftKey },
      bubbles: true,
      composed: true,
    }));
    // Controlled: realign the native toggle with `selected` once the consumer responds.
    await this.updateComplete;
    input.checked = !!this.selected;
  }

  render() {
    return html`
      <div class="card">
        <div class="media">
          <slot name="media"></slot>
          ${this.selectable ? html`
            <label class="nx-checkbox select-target">
              <input type="checkbox" class="select"
                aria-label=${this.selectionLabel}
                .checked=${!!this.selected}
                @click=${this._onSelectionClick}>
            </label>` : nothing}
          <div class="overlay-actions"><slot name="overlay-actions"></slot></div>
        </div>
        <div class="body">
          <div class="heading">
            <slot name="content">
              <slot name="heading"></slot>
              <slot name="actions"></slot>
            </slot>
          </div>
          <div class="metadata"><slot name="metadata"></slot></div>
        </div>
      </div>`;
  }
}

if (!customElements.get('nx-card')) customElements.define('nx-card', NxCard);
