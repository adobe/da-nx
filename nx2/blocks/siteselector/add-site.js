import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../utils/utils.js';
import { parseSubdomain, setRecentSite } from './site-utils.js';
import '../shared/dialog/dialog.js';

const style = await loadStyle(new URL('../../styles/form.css', import.meta.url).href);

export class NxAddSite extends LitElement {
  static properties = {
    createHref: { attribute: false },
    _error: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  close() {
    this.shadowRoot.querySelector('nx-dialog').close();
  }

  submitForm(event) {
    event.preventDefault();
    this._error = undefined;
    const input = this.shadowRoot.querySelector('input');
    const hash = parseSubdomain(input.value.trim());
    if (!hash) {
      this._error = 'Enter an existing AEM site URL, such as https://main--site--org.aem.page.';
      input.focus();
      return;
    }
    const value = hash.slice(2);
    try {
      const [org, site] = value.split('/');
      setRecentSite({ org, site });
      this.dispatchEvent(new CustomEvent('site-added', { detail: { value }, bubbles: true, composed: true }));
    } catch {
      this._error = 'Could not save this site in your browser.';
    }
  }

  render() {
    return html`
      <nx-dialog title="Add site">
        <form id="add-site-form" novalidate @submit=${this.submitForm}>
          <div class="nx-form-field ${this._error ? 'nx-field-error' : ''}">
            <label for="site-url">Existing site URL</label>
            <input id="site-url" class="nx-input" type="url" required autofocus autocomplete="url"
              placeholder="https://main--site--org.aem.page"
              aria-describedby="site-help site-error" aria-invalid=${!!this._error}
              @input=${() => { this._error = undefined; }}>
            <span id="site-error" class="nx-input-error-msg" role="alert" ?hidden=${!this._error}>${this._error || ''}</span>
          </div>
          <p id="site-help">Add an existing site to this browser's list. This does not create a site or grant access.</p>
          <hr style="border: 0; border-top: 1px solid var(--s2-gray-300);"/>
        </form>
        ${this.createHref ? html`
          <p class="site-creation">
            <a href=${this.createHref}>Create a new site</a>
          </p>` : nothing}
        <button type="button" slot="actions" class="nx-form-btn-secondary" @click=${this.close}>Cancel</button>
        <button type="submit" slot="actions" form="add-site-form" class="nx-form-btn-primary">Add site</button>
      </nx-dialog>`;
  }
}

customElements.define('nx-add-site', NxAddSite);
