import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../utils/utils.js';
import { source, config } from '../../utils/api.js';
import { parseSubdomain, hasOrgAdminGrant, addExistingSite } from './site-utils.js';
import '../shared/dialog/dialog.js';

const style = await loadStyle(new URL('../../styles/form.css', import.meta.url).href);

export class NxAddSite extends LitElement {
  static properties = {
    org: { attribute: false },
    createHref: { attribute: false },
    _saving: { state: true },
    _error: { state: true },
    _canCreate: { state: true },
    _permissionError: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  firstUpdated() {
    this.loadCreationPermission();
  }

  disconnectedCallback() {
    this._permissionRequest?.abort();
    this._submitRequest?.abort();
    super.disconnectedCallback();
  }

  async loadCreationPermission() {
    this._permissionRequest?.abort();
    const request = new AbortController();
    this._permissionRequest = request;
    this._canCreate = false;
    this._permissionError = undefined;
    if (!this.org || !this.createHref) return;
    try {
      const response = await config.get({ org: this.org });
      if (request.signal.aborted || !this.isConnected) return;
      if ([403, 404].includes(response.status)) return;
      if (!response.ok || !response.headers?.has('x-da-actions')) {
        throw new Error('Administrator permissions could not be verified. You can still add an existing site.');
      }
      this._canCreate = hasOrgAdminGrant(response);
    } catch (error) {
      if (!request.signal.aborted && this.isConnected) this._permissionError = error.message;
    }
  }

  close() {
    this.shadowRoot.querySelector('nx-dialog').close();
  }

  onClose() {
    this._permissionRequest?.abort();
    this._submitRequest?.abort();
  }

  async submitForm(event) {
    event.preventDefault();
    if (this._saving) return;
    this._error = undefined;
    const input = this.shadowRoot.querySelector('input');
    const hash = parseSubdomain(input.value.trim());
    if (!hash) {
      this._error = 'Enter an existing AEM site URL, such as https://main--site--org.aem.page.';
      input.focus();
      return;
    }
    const value = hash.slice(2);
    this._saving = true;
    const request = new AbortController();
    this._submitRequest = request;
    try {
      await addExistingSite({ value, source, signal: request.signal });
      if (request.signal.aborted || !this.isConnected) return;
      this.dispatchEvent(new CustomEvent('site-added', { detail: { value }, bubbles: true, composed: true }));
    } catch (error) {
      if (!request.signal.aborted && this.isConnected) {
        this._error = `Could not add the site: ${error.message}`;
      }
    } finally {
      if (!request.signal.aborted && this.isConnected) this._saving = false;
    }
  }

  render() {
    return html`
      <nx-dialog title="Add site" @close=${this.onClose}>
        <form id="add-site-form" class=${this._error ? 'nx-field-error' : nothing}
          @submit=${this.submitForm} aria-busy=${!!this._saving}>
          <label class="nx-form-field">
            <span>Existing site URL</span>
            <input class="nx-input" type="url" required autofocus autocomplete="url"
              placeholder="https://main--site--org.aem.page" ?disabled=${this._saving}
              aria-describedby="site-help site-error" aria-invalid=${!!this._error}
              @input=${() => { this._error = undefined; }}>
          </label>
          <p id="site-help">Add an existing site to this browser's list. This does not create a site or grant access.</p>
          <p id="site-error" class="nx-input-error-msg" role="alert" ?hidden=${!this._error}>${this._error || ''}</p>
          ${this._saving ? html`<p role="status">Checking site access...</p>` : nothing}
        </form>
        ${this._canCreate && this.createHref ? html`
          <p class="site-creation">
            <a href=${this.createHref}>Create new site in ${this.org}</a>
          </p>` : nothing}
        ${this._permissionError ? html`
          <p class="permission-error" role="status">${this._permissionError}
            <button type="button" class="nx-form-btn-secondary" @click=${this.loadCreationPermission}>Try again</button>
          </p>` : nothing}
        <button type="button" slot="actions" class="nx-form-btn-secondary" @click=${this.close}>Cancel</button>
        <button type="submit" slot="actions" form="add-site-form" class="nx-form-btn-primary"
          ?disabled=${this._saving}>${this._saving ? 'Checking...' : 'Add site'}</button>
      </nx-dialog>`;
  }
}

customElements.define('nx-add-site', NxAddSite);
