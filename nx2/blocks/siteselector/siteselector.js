import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../utils/utils.js';
import { loadHrefSvg } from '../../utils/svg.js';
import '../shared/picker/picker.js';

const [buttonStyles, styles, addIcon] = await Promise.all([
  loadStyle(new URL('../../styles/buttons.css', import.meta.url).href),
  loadStyle(import.meta.url),
  loadHrefSvg(new URL('../../public/icons/S2_Icon_Add_20_N.svg', import.meta.url).href),
]);
addIcon?.setAttribute('aria-hidden', 'true');
addIcon?.setAttribute('focusable', 'false');

class NxSiteselector extends LitElement {
  static properties = {
    sites: { attribute: false },
    value: {},
    heading: {},
    error: {},
    size: { reflect: true },
    onSelect: { attribute: false },
    getCreateSiteHref: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [buttonStyles, styles];
    this._connection = new AbortController();
    this._adapter = undefined;
    this._loading = false;
    this.dispatchEvent(new CustomEvent('site-selector-ready', {
      bubbles: true,
      composed: true,
      detail: { selector: this, signal: this._connection.signal },
    }));
    this._managed ??= this.sites === undefined;
    if (this._managed) {
      const { signal } = this._connection;
      this.addEventListener('site-retry', () => {
        if (!this._adapter) this.ready = this.loadSites(signal);
      }, { signal });
      this.ready = this.loadSites(signal);
    }
  }

  disconnectedCallback() {
    this._connection.abort();
    super.disconnectedCallback();
  }

  focus(options) { this.shadowRoot.querySelector('nx-picker, .nx-btn-accent')?.focus(options); }

  async loadSites(signal) {
    if (this._loading || signal.aborted) return;
    this._loading = true;
    try {
      const { connectSiteSelector } = await import('./picker-controller.js');
      if (signal.aborted || !this.isConnected) return;
      this._adapter = connectSiteSelector({
        selector: this,
        signal,
        onSelect: ({ value }) => this.onSelect?.({ value }),
      });
      await this._adapter.ready;
    } catch (error) {
      if (!signal.aborted) this.error = `Could not load your sites: ${error.message}`;
    } finally {
      if (!signal.aborted) this._loading = false;
    }
  }

  onChange(event) {
    event.stopPropagation();
    const { value } = event.detail;
    this.dispatchEvent(new CustomEvent(value === 'add-site' ? 'site-add' : 'site-select', {
      bubbles: true,
      composed: true,
      detail: value === 'add-site' ? undefined : { value },
    }));
  }

  onAdd() {
    this.dispatchEvent(new CustomEvent('site-add', { bubbles: true, composed: true }));
  }

  onRetry() {
    this.dispatchEvent(new CustomEvent('site-retry', { bubbles: true, composed: true }));
  }

  render() {
    const sites = this.sites ?? [];
    const heading = this.heading ?? 'Your recent sites';
    const items = [
      { section: heading },
      ...sites.map((site) => ({
        value: site.value,
        label: site.value.split('/').at(-1).replace(/^./, (letter) => letter.toUpperCase()),
        description: site.value,
        ariaLabel: site.label,
      })),
      { divider: true },
      { value: 'add-site', label: 'Add site...', action: true },
    ];
    return html`
      ${this.sites?.length === 0 && !this.error ? html`
        <button type="button" class="nx-btn-accent" @click=${this.onAdd}>
          Add site
          ${addIcon?.cloneNode(true)}
        </button>
      ` : html`<nx-picker
        .items=${items}
        .value=${this.value ?? ''}
        .labelOverride=${sites.find((site) => site.value === this.value)?.label ?? ''}
        size="m"
        placeholder=${this.sites === undefined ? 'Loading sites...' : heading}
        aria-busy=${this.sites === undefined}
        ?inert=${this.sites === undefined}
        variant="emphasized"
        check-position="start"
        @change=${this.onChange}
      ></nx-picker>`}
      ${this.error ? html`<p role="alert">${this.error}
        <button type="button" @click=${this.onRetry}>Try again</button></p>` : nothing}
    `;
  }
}

if (!customElements.get('nx-siteselector')) customElements.define('nx-siteselector', NxSiteselector);
