/**
 * `<nx-card>` — minimal Spectrum 2 card primitive for list views.
 *
 * Properties (attributes):
 *   - `heading` (String): primary text line; omitted from render when unset.
 *   - `subheading` (String): secondary text line; omitted from render when unset.
 *   - `pill` (String): label rendered inside the leading badge. When set to a
 *     non-empty string it takes precedence over the `pill` slot; when unset or
 *     empty, the `<slot name="pill">` is exposed instead. Only one of the two
 *     ever renders.
 *   - `selected` (Boolean, reflected): renders the selected visual state.
 *   - `interactive` (Boolean, reflected): cursor + hover affordance.
 *
 * Slots:
 *   - default: card body content (below subheading).
 *   - `name="pill"`: custom badge content; ignored when `pill` attribute is set.
 *   - `name="actions"`: trailing controls (icon buttons, checkboxes).
 *
 * Events: none — the component is purely presentational. Consumers handle
 * clicks/keys on the host or via `actions` slot children.
 *
 * Shadow parts: `card`, `pill`, `heading`, `subheading`.
 */
import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';

const styles = await loadStyle(import.meta.url);

class NxCard extends LitElement {
  static properties = {
    heading: { type: String },
    subheading: { type: String },
    pill: { type: String },
    selected: { type: Boolean, reflect: true },
    interactive: { type: Boolean, reflect: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  render() {
    const hasPill = typeof this.pill === 'string' && this.pill.length > 0;
    return html`
      <div class="card" part="card">
        ${hasPill
          ? html`<div class="card-pill" part="pill">${this.pill}</div>`
          : html`<slot name="pill"></slot>`}
        <div class="card-body">
          ${this.heading
            ? html`<span class="card-heading" part="heading">${this.heading}</span>`
            : nothing}
          ${this.subheading
            ? html`<span class="card-subheading" part="subheading">${this.subheading}</span>`
            : nothing}
          <slot></slot>
        </div>
        <div class="card-actions">
          <slot name="actions"></slot>
        </div>
      </div>
    `;
  }
}

if (!customElements.get('nx-card')) customElements.define('nx-card', NxCard);
