import { LitElement, html } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import formatBasics from './index.js';

const style = await getStyle(import.meta.url);

const MOCK_URLS = '';
// const MOCK_URLS = 'https://main--da-bacom--adobecom.aem.page/drafts/cmillar/loc-test/main-doc';

class NxLocBasics extends LitElement {
  static properties = {
    project: { attribute: false },
    message: { attribute: false },
    _title: { state: true },
    _textUrls: { state: true },
    _message: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this.setupProject();
  }

  update(props) {
    // Allow the parent to pass a message if it has one
    if (props.has('message')) this._message = this.message;
    super.update();
  }

  setupProject() {
    const { org, site, title, urls } = this.project;

    this._title = title;

    // If the existing project has URLs, format them down to plain text
    this._textUrls = urls ? this.formatUrls(org, site, urls) : MOCK_URLS;
  }

  formatTitle({ target }) {
    this._title = target.value.replaceAll(/[^a-zA-Z0-9]/g, '-').toLowerCase();
  }

  formatUrls(org, site, urls) {
    return urls.map((url) => `https://main--${site}--${org}.aem.page${url.suppliedPath}`).join('\n');
  }

  async getUpdates(view) {
    const formData = new FormData(this.form);
    const { title, urls } = Object.fromEntries(formData);
    const { message, updates } = await formatBasics(title, urls);
    if (message) {
      this._message = message;
      return null;
    }

    // Combine the view and the data so it persists into the project
    return { data: { view, ...updates } };
  }

  async handleAction(e) {
    const { view } = e.detail;

    // If the next view is not a hash or an href, get updates
    const detail = view ? await this.getUpdates(view) : e.detail;

    // If no detail, don't send the event.
    if (!detail) return;

    const opts = { detail, bubbles: true, composed: true };
    const event = new CustomEvent('action', opts);
    this.dispatchEvent(event);
  }

  get form() {
    return this.shadowRoot.querySelector('form');
  }

  render() {
    return html`
      <nx-loc-actions
        .project=${this.project}
        .message=${this._message}
        @action=${this.handleAction}>
      </nx-loc-actions>
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
