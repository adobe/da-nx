import { LitElement, html, nothing } from 'da-lit';

const { default: getStyle } = await import('../../../utils/styles.js');

const style = await getStyle(import.meta.url);

/**
 * FormsEditor
 *
 * Standalone web component that loads a page's form data from DA, lets the
 * user pick a JSON Schema, mounts the schema-driven Form UI, and provides
 * actions to save/preview/publish via backend services.
 */
class FormSidebar extends LitElement {
  static properties = {
    formModel: { attribute: false },
    activeNavPointer: { attribute: false },
    _schemas: { attribute: false },
    _nav: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  update(props) {
    if (props.has('formModel') && this.formModel) {
      this.getNav();
    }
    super.update(props);
  }

  getNav() {
    this._nav = this.formModel.annotated;
  }

  renderNoSchemas() {
    return html`
      <p>This project has no schemas.</p>
      <p><a href="https://main--da-live--adobe.aem.live/apps/schema?nx=schema">Create one</a></p>
    `;
  }

  renderSchemaSelector() {
    return html`
      <sl-select value="${this._schema?.id || nothing}">
        ${Object.keys(this.schemas).map((key) => html`
          <option value="${key}">${this.schemas[key].title}</option>
        `)}
      </sl-select>
      <p class="da-sidebar-title">Version</p>
      <sl-select disabled>
        <option>Current</option>
      </sl-select>
      ${this.json === null ? html`<sl-button class="primary outline">Use schema</sl-button>` : nothing}`;
  }

  renderSchema() {
    if (!this.schemas) return nothing;
    return html`
      <p class="da-sidebar-title">Schema</p>
    `;
  }

  /**
   * Determine if the item should be rendered.
   * Render only object and array nodes.
   * @param {Object} item the form item
   * @returns {Boolean} whether or not something should render
   */
  canRender(item) {
    return item.type === 'object' || item.type === 'array';
  }

  _emitNavSelect(pointer) {
    this.dispatchEvent(new CustomEvent('nav-pointer-select', {
      detail: { pointer },
      bubbles: true,
      composed: true,
    }));
  }

  renderList(parent, isArrayItem = false, arrayIndex = null) {
    if (!this.canRender(parent)) return nothing;

    const children = parent.children ?? [];
    const label = isArrayItem && arrayIndex != null
      ? `#${arrayIndex} ${parent.title ?? ''}`
      : (parent.title ?? '');
    const isActive = this.activeNavPointer === parent.pointer;

    return html`
      <li data-key="${parent.key}">
        <button
          type="button"
          class="item nav-item ${isActive ? 'is-active' : ''}"
          aria-current=${isActive ? 'location' : undefined}
          @click=${() => this._emitNavSelect(parent.pointer)}
        >${label}</button>
        ${children.length
        ? html`<ul>${children.map((item, i) => {
          const isArray = parent.type === 'array';
          return this.renderList(item, isArray, isArray ? i + 1 : null);
        })}</ul>`
        : nothing}
      </li>
    `;
  }

  renderNav() {
    if (!this._nav) return nothing;

    return html`
      <p class="da-sidebar-title">Navigation</p>
      <div class="nav-list">
        <ul>${this.renderList(this._nav)}</ul>
      </div>
    `;
  }

  render() {
    if (!this.formModel) return nothing;

    return html`
      <div class="da-sidebar-section">
        ${this.renderNav()}
      </div>
    `;
  }
}

customElements.define('da-form-sidebar', FormSidebar);
