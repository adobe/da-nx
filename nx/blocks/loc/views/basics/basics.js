import { LitElement, html } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import formatBasics from './index.js';

const style = await getStyle(import.meta.url);

// const MOCK_URLS = '';
const MOCK_URLS = 'https://main--da-bacom--adobecom.aem.page/drafts/cmillar/loc-test/main-doc';

class NxLocBasics extends LitElement {
  static properties = {
    project: { attribute: false },
    _title: { state: true },
    _textUrls: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this.setupProject();
  }

  setupProject() {
    const { org, site, title, urls } = this.project || {};
    this._title = title;
    this._textUrls = urls ? this.formatUrls(org, site, urls) : MOCK_URLS;
  }

  formatTitle({ target }) {
    this._title = target.value.replaceAll(/[^a-zA-Z0-9]/g, '-').toLowerCase();
  }

  formatUrls(org, site, urls) {
    return urls.map((url) => `https://main--${site}--${org}.aem.page${url.suppliedPath}`).join('\n');
  }

  getUpdates() {
    const textUrls = this.shadowRoot.querySelector('[name="urls"]').value;
    return formatBasics(this._title, textUrls);
  }

  render() {
    return html`
      <form>
        <div class="nx-loc-title-wrapper">
          <label for="title">Title</label>
          <sl-input
            type="text" name="title"
            .value=${this._title}
            placeholder="demo"
            @input=${this.formatTitle}></sl-input>
        </div>
        <div>
          <label for="urls">URLs</label>
          <sl-textarea name="urls"
            placeholder="Add AEM URLs here."
            style="font-family: monospace; padding: 4px 12px;"
            resize="none"
            .value=${this._textUrls}></sl-textarea>
        </div>
      </form>
    `;
  }
}

customElements.define('nx-loc-basics', NxLocBasics);
