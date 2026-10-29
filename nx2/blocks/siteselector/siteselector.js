import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../utils/utils.js';
import '../shared/picker/picker.js';

const styles = await loadStyle(import.meta.url);

class NxSiteselector extends LitElement {
  static properties = {
    sites: { attribute: false },
    value: {},
    heading: {},
    error: {},
    size: { reflect: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    this._connection = new AbortController();
    this.dispatchEvent(new CustomEvent('site-selector-ready', {
      bubbles: true,
      composed: true,
      detail: { selector: this, signal: this._connection.signal },
    }));
  }

  disconnectedCallback() {
    this._connection.abort();
    super.disconnectedCallback();
  }

  focus(options) { this.shadowRoot.querySelector('nx-picker')?.focus(options); }

  onChange(event) {
    event.stopPropagation();
    const { value } = event.detail;
    this.dispatchEvent(new CustomEvent(value === 'add-site' ? 'site-add' : 'site-select', {
      bubbles: true,
      composed: true,
      detail: value === 'add-site' ? undefined : { value },
    }));
  }

  onRetry() {
    this.dispatchEvent(new CustomEvent('site-retry', { bubbles: true, composed: true }));
  }

  render() {
    const sites = this.sites ?? [];
    const items = [
      { section: this.heading ?? 'Your sites' },
      ...sites.map((site) => ({
        value: site.value,
        label: site.value.split('/').at(-1),
        description: site.value,
        ariaLabel: site.label,
      })),
      { divider: true },
      { value: 'add-site', label: 'Add site...', action: true },
    ];
    return html`
      <nx-picker
        .items=${items}
        .value=${this.value ?? ''}
        .labelOverride=${sites.find((site) => site.value === this.value)?.label ?? ''}
        .size=${this.size ?? 'm'}
        placeholder="Choose a site"
        variant="field"
        check-position="start"
        @change=${this.onChange}
      ></nx-picker>
      ${this.error ? html`<p role="alert">${this.error}
        <button type="button" @click=${this.onRetry}>Try again</button></p>` : nothing}
    `;
  }
}

if (!customElements.get('nx-siteselector')) customElements.define('nx-siteselector', NxSiteselector);
