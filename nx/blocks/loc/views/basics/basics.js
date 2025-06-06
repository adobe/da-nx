import { LitElement, html } from 'da-lit';
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

  getData() {
    return formatBasics(this.title, this.textUrls);
  }

  get form() {
    return this.shadowRoot.querySelector('form');
  }

  get textUrls() {
    return this.urls?.map((url) => `https://main--${this.site}--${this.org}.aem.page${url.suppliedPath}`).join('\n') || MOCK_URLS;
  }

  render() {
    return html`
      <form>
        <div class="nx-loc-title-wrapper">
          <label for="title">Title</label>
          <sl-input type="text" name="title" .value=${this.title} placeholder="demo" @input=${this.formatTitle}></sl-input>
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
