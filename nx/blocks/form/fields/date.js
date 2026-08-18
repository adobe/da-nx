import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../../nx2/utils/utils.js';
import defaults from './defaults.js';
import { localToUtc, utcToLocal } from './datetime-zone.js';

const style = await loadStyle(import.meta.url);

// Component type → native input type.
const NATIVE_TYPE = { date: 'date', time: 'time', datetime: 'datetime-local' };

// Cap the year at 4 digits; Chrome's native year field otherwise allows 6, which
// storage (`\d{4}`) can't represent.
const RANGE = {
  date: { min: '0001-01-01', max: '9999-12-31' },
  datetime: { min: '0001-01-01T00:00', max: '9999-12-31T23:59' },
};

// Thin wrapper over a native date/time input. Stores date → `YYYY-MM-DD`,
// time → `HH:MM`, datetime → UTC (`…Z`) edited in the viewer's local zone.
class FormDate extends LitElement {
  static properties = {
    value: { type: String },
    type: { type: String },
    label: { type: String },
    description: { type: String },
    error: { type: String },
    required: { type: Boolean },
    disabled: { type: Boolean, reflect: true },
  };

  constructor() {
    super();
    this.type = 'date';
    this._lastValue = undefined;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [defaults, style];
  }

  get _input() { return this.shadowRoot.querySelector('input'); }

  focus() { this._input?.focus(); }

  // Push an external value in; skip our own emissions so a re-render can't wipe
  // an in-progress entry.
  updated(changed) {
    if (changed.has('value') && this.value !== this._lastValue) {
      this._lastValue = this.value;
      if (this._input) {
        this._input.value = this.type === 'datetime'
          ? utcToLocal(this.value)
          : (this.value ?? '');
      }
    }
  }

  _onInput(e) {
    // datetime converts local → UTC; a partial entry has no value, so we store none.
    const raw = e.target.value;
    const next = this.type === 'datetime' ? localToUtc(raw) : raw;
    this._lastValue = next;
    this.value = next;
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  render() {
    // The SDK is the single source of the error (it validates the stored value).
    const showHint = !this.error && this.description;
    return html`
      <div class="form-field${this.error ? ' has-error' : ''}">
        ${this.label ? html`<label for="form-date">${this.label}${this.required ? html`<span class="form-required">*</span>` : nothing}</label>` : nothing}
        <input
          id="form-date"
          type=${NATIVE_TYPE[this.type] ?? 'date'}
          min=${RANGE[this.type]?.min ?? nothing}
          max=${RANGE[this.type]?.max ?? nothing}
          ?disabled=${this.disabled}
          @input=${this._onInput}
          @change=${this._onInput}
        />
        ${this.error ? html`<p class="form-field-error">${this.error}</p>` : nothing}
        ${showHint ? html`<p class="form-field-description">${this.description}</p>` : nothing}
      </div>
    `;
  }
}

if (!customElements.get('form-date')) customElements.define('form-date', FormDate);

export default FormDate;
