import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../utils/utils.js';
import { getSiteOptions, checkSiteChoices, getCreateSiteHref, setRecentSite } from './site-utils.js';
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
    this._choicesKey = undefined;
    this._accessResults = new Map();
    this._inaccessibleSites = undefined;
    this._selectRecent = !this.value;
    this.size ??= 's';
    const { signal } = this._connection;
    document.addEventListener('site-add', () => this.showAddSite(), { signal });
    window.addEventListener('storage', ({ key }) => {
      if (key === 'da-sites' || key === null) this.refresh();
    }, { signal });
    this.refresh();
  }

  disconnectedCallback() {
    this._connection.abort();
    this._request?.abort();
    this.closeDialog();
    super.disconnectedCallback();
  }

  focus(options) { this.shadowRoot.querySelector('nx-picker')?.focus(options); }

  async refresh() {
    if (!this.isConnected) return;
    const value = getSiteOptions({ current: this.value })[0]?.value ?? '';
    if (value) this._selectRecent = false;
    let recentSites = [];
    let error;
    try {
      recentSites = JSON.parse(localStorage.getItem('da-sites') || '[]');
      if (!Array.isArray(recentSites)) throw new TypeError('Recent sites must be a list.');
    } catch (cause) {
      recentSites = [];
      error = `Could not read recent sites: ${cause.message}`;
    }
    if (value && !error) {
      try {
        const [org, site] = value.split('/');
        setRecentSite({ org, site });
        recentSites = JSON.parse(localStorage.getItem('da-sites'));
      } catch (cause) {
        error = `Could not save the current site in this browser: ${cause.message}`;
      }
    }
    const sites = getSiteOptions({ recentSites, current: value });
    const key = JSON.stringify({ sites, value, error });
    if (key === this._choicesKey) return;
    this._choicesKey = key;
    this._request?.abort();
    if (this.value !== value) this.closeDialog();
    this.sites = sites.filter(({ value: siteValue }) => !this._inaccessibleSites?.has(siteValue));
    this.value = value;
    this.error = error;
    if (!sites.length) {
      this._selectRecent = false;
      return;
    }
    const request = new AbortController();
    this._request = request;
    try {
      const { source } = await import('../../utils/api.js');
      request.signal.throwIfAborted();
      const result = await checkSiteChoices({
        sites,
        source,
        signal: request.signal,
        inaccessibleSites: this._inaccessibleSites,
        accessResults: this._accessResults,
      });
      if (request.signal.aborted) return;
      this._inaccessibleSites = result.inaccessibleSites;
      this.sites = result.sites;
      const currentError = this._inaccessibleSites.has(value)
        ? `You do not have access to ${value}. Choose another site or try again.` : undefined;
      this.error = [error, currentError, result.error].filter(Boolean).join(' ') || undefined;
      if (this._selectRecent) {
        this._selectRecent = false;
        const recent = this.sites.find((site) => {
          const access = this._accessResults.get(site.value);
          return access.status === 'fulfilled' && access.value;
        });
        if (recent) await this.selectSite(recent.value);
      }
    } catch (cause) {
      if (!request.signal.aborted) {
        this.error = [error, `Could not check your sites: ${cause.message}`].filter(Boolean).join(' ');
      }
    }
  }

  selectSite(value) {
    if (this.value !== value) this.closeDialog();
    this._selectRecent = false;
    this.value = value;
    const checking = this.refresh();
    this.dispatchEvent(new CustomEvent('site-select', {
      bubbles: true, composed: true, detail: { value },
    }));
    return checking;
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
    else this.error = 'This site is no longer available. Reload the page and try again.';
    return undefined;
  }

  onRetry() {
    this._accessResults.clear();
    this._choicesKey = undefined;
    return this.refresh();
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
        <button type="button" @click=${this.onRetry}>Try again</button></p>` : nothing}
    `;
  }
}

if (!customElements.get('nx-siteselector')) customElements.define('nx-siteselector', NxSiteselector);
