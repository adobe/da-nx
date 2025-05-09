import { LitElement, html, nothing } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import formatBasics from './index.js';

const style = await getStyle(import.meta.url);

// const MOCK_URLS = '';
const MOCK_URLS = 'https://main--da-bacom--adobecom.aem.page/drafts/cmillar/loc-test/main-doc';

class NxLocBasics extends LitElement {
  static properties = {
    title: { attribute: false },
    org: { attribute: false },
    site: { attribute: false },
    urls: { attribute: false },
    _message: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  formatTitle({ target }) {
    this.title = target.value.replaceAll(/[^a-zA-Z0-9]/g, '-').toLowerCase();
  }

  async handleSubmit() {
    const formData = new FormData(this.form);
    const { title, urls } = Object.fromEntries(formData);

    const { error, detail } = await formatBasics(title, urls);
    if (error) {
      this._message = { text: error, type: 'error' };
      return;
    }

    const opts = { detail, bubbles: true, composed: true };
    const event = new CustomEvent('next', opts);
    this.dispatchEvent(event);
  }

  handleAction({ detail }) {
    if (detail === 'prev') {
      const opts = { bubbles: true, composed: true };
      const event = new CustomEvent('prev', opts);
      this.dispatchEvent(event);
    }
    if (detail === 'next') this.handleSubmit();
  }

  get form() {
    return this.shadowRoot.querySelector('form');
  }

  get textUrls() {
    return this.urls?.map((url) => `https://main--${this.site}--${this.org}.aem.page${url.suppliedPath}`).join('\n') || MOCK_URLS;
  }

  render() {
    return html`
      <nx-loc-actions
        @action=${this.handleAction}
        .message=${this._message}
        prev="Dashboard"
        ?prevDisabled="${!(this.org && this.site)}"
        next="Validate references">
      </nx-loc-actions>
      <form>
        <div class="nx-loc-title-wrapper">
          <label for="title">Title</label>
          <sl-input type="text" name="title" .value=${this.title || 'demo'} @input=${this.formatTitle}></sl-input>
        </div>
        <div>
          <label for="urls">URLs</label>
          <sl-textarea name="urls"
            placeholder="Add AEM URLs here."
            style="font-family: monospace; padding: 4px 12px;"
            resize="none"
            .value=${this.textUrls}></sl-textarea>
        </div>
      </form>
    `;
  }
}

customElements.define('nx-loc-basics', NxLocBasics);
