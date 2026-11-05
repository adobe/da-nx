import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../utils/utils.js';
import { getSiteOptions, getCreateSiteHref, setRecentSite } from './site-utils.js';
import '../shared/picker/picker.js';

const styles = await loadStyle(import.meta.url);

class NxSiteselector extends LitElement {
  static properties = {
    sites: { state: true },
    value: { attribute: false },
    heading: {},
    error: { state: true },
    size: { reflect: true },
    getCreateSiteHref: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    this._connection = new AbortController();
    this.size ??= 's';
    const { signal } = this._connection;
    document.addEventListener('site-add', () => this.showAddSite(), { signal });
    this.refresh();
    if (this.value === undefined) {
      if (this.sites.length) this.selectSite(this.sites[0].value);
      else this.value = '';
    }
  }

  disconnectedCallback() {
    this._connection.abort();
    this.closeDialog();
    super.disconnectedCallback();
  }

  focus(options) { this.shadowRoot.querySelector('nx-picker')?.focus(options); }

  refresh() {
    try {
      const recentSites = JSON.parse(localStorage.getItem('da-sites') || '[]');
      if (!Array.isArray(recentSites)) throw new TypeError('Recent sites must be a list.');
      if (this.value) {
        const [org, site] = this.value.split('/');
        setRecentSite({ org, site });
      }
      this.sites = getSiteOptions({ recentSites, current: this.value });
      this.error = undefined;
    } catch {
      this.sites = getSiteOptions({ current: this.value });
      this.error = 'Could not update recent sites in this browser.';
    }
  }

  selectSite(value) {
    this.value = value;
    this.dispatchEvent(new CustomEvent('site-select', {
      bubbles: true, composed: true, detail: { value },
    }));
    return this.updateComplete;
  }

  closeDialog() {
    this._dialog?.remove();
    this._dialog = undefined;
  }

  async showAddSite() {
    if (this._opening || this._dialog) return;
    this._opening = true;
    const { signal } = this._connection;
    const { value } = this;
    try {
      await import('./add-site.js');
      if (signal.aborted || value !== this.value) return;
      const dialog = document.createElement('nx-add-site');
      dialog.createHref = this.getCreateSiteHref
        ? this.getCreateSiteHref()
        : getCreateSiteHref();
      dialog.addEventListener('close', () => {
        this.closeDialog();
        this.focus();
      });
      dialog.addEventListener('site-added', async ({ detail: { value: added } }) => {
        this.closeDialog();
        this.selectSite(added);
        await this.updateComplete;
        this.focus();
      });
      this._dialog = dialog;
      document.body.append(dialog);
    } catch (error) {
      if (!signal.aborted && value === this.value) this.error = `Could not open Add site: ${error.message}`;
    } finally {
      this._opening = false;
    }
  }

  onChange(event) {
    event.stopPropagation();
    const { value } = event.detail;
    if (value === 'add-site') {
      this.dispatchEvent(new CustomEvent('site-add', { bubbles: true, composed: true }));
    } else if (this.sites.some((site) => site.value === value)) return this.selectSite(value);
    return undefined;
  }

  willUpdate(changed) {
    if (changed.has('value')) {
      this.closeDialog();
      this.refresh();
    }
    this.hidden = !this.sites?.length;
  }

  render() {
    if (this.hidden) return nothing;
    const heading = this.heading ?? 'Your recent sites';
    const items = [
      { section: heading },
      ...this.sites.map((site) => ({
        value: site.value,
        label: site.value.split('/').at(-1).replace(/^./, (letter) => letter.toUpperCase()),
        description: site.value,
        ariaLabel: site.label,
      })),
      { divider: true },
      { value: 'add-site', label: 'Add site', action: true },
    ];
    return html`
      <nx-picker
        .items=${items}
        .value=${this.value ?? ''}
        .labelOverride=${this.sites.find((site) => site.value === this.value)?.label ?? ''}
        size="m"
        placeholder=${heading}
        variant="field"
        check-position="start"
        @change=${this.onChange}
      ></nx-picker>
      ${this.error ? html`<p role="alert">${this.error}
      </p>` : nothing}
    `;
  }
}

if (!customElements.get('nx-siteselector')) customElements.define('nx-siteselector', NxSiteselector);
