import { LitElement, html, nothing } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import { getEditPath, getAemPaths, getAemDetails } from './index.js';

const style = await getStyle(import.meta.url);

class NxLocUrlDetails extends LitElement {
  static properties = {
    path: { attribute: false },
    _editPath: { state: true },
    _previewPath: { state: true },
    _publishPath: { state: true },
    _details: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._editPath = getEditPath(this.path);
    const { preview, publish } = getAemPaths(this.path);
    this._previewPath = preview;
    this._publishPath = publish;
    this.getDetails();
  }

  async getDetails() {
    const { preview, publish } = await getAemDetails(this.path);
    this._details = { preview, publish };
  }

  getFill(env) {
    return this._details && this._details[env] !== 'Never' ? 'is-active' : '';
  }

  render() {
    return html`
      <a class="link-group"
         aria-label="Open in author"
         href="${this._editPath}"
         target="${this._editPath}">
        <div class="url-icon edit-icon is-active"></div>
        <div class="group-text">
          <p class="group-title">Edit</p>
          <p class="group-detail"></p>
        </div>
      </a>
      <a class="link-group"
         aria-label="Open preview"
         href="${this._previewPath}"
         target="${this._previewPath}">
        <div class="url-icon aem-icon ${this.getFill('preview')}"></div>
        <div class="group-text">
          <p class="group-title">Previewed</p>
          <p class="group-detail">
            ${this._details ? this._details.preview : 'Checking'}
          </p>
        </div>
      </a>
      <a class="link-group"
         aria-label="Open preview"
         href="${this._publishPath}"
         target="${this._publishPath}">
        <div class="url-icon aem-icon ${this.getFill('publish')}"></div>
        <div class="group-text">
          <p class="group-title">Published</p>
          <p class="group-detail">
            ${this._details ? this._details.publish : 'Checking'}
          </p>
        </div>
      </a>
    `;
  }
}

customElements.define('nx-loc-url-details', NxLocUrlDetails);
