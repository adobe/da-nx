import { html, LitElement, nothing } from 'da-lit';
import getStyle from '../../utils/styles.js';
import { loadSchemas, saveSchema, deleteSchema, loadCodeMirror, updateCodeMirror } from './utils/utils.js';

import '../../public/sl/components.js';
import '../shared/path/path.js';

const EL_NAME = 'nx-schema-editor';
const DEFAULT_SCHEMA = { '$schema': 'https://json-schema.org/draft/2020-12/schema' };

const styles = await getStyle(import.meta.url);

class SchemaEditor extends LitElement {
  static properties = {
    _org: { state: true },
    _site: { state: true },
    _schemas: { state: true },
    _currentSchema: { state: true },
    _createNew: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  updated(props) {
    if (!props.has('_currentSchema')) return;

    const data = this._schemas?.[this._currentSchema] || DEFAULT_SCHEMA;

    const doc = JSON.stringify(data, null, 2);

    if (!this._editor) {
      this._editor = loadCodeMirror(this.codeEditor, doc);
      return;
    }

    updateCodeMirror(this._editor, doc);
  }

  async handleDetail({ detail }) {
    this._org = detail.org;
    this._site = detail.site;
    const schemas = await loadSchemas(this._org, this._site);

    if (!Object.keys(schemas).length) {
      this._schemas = null;
      this._currentSchema = '';
      return;
    }

    this._schemas = schemas;
    this.setDefault();
  }

  handleSchemaChange({ target }) {
    if (target.value === 'nx-new-schema') {
      this._createNew = true;
    }
    this._currentSchema = target.value;
  }

  setDefault() {
    this._createNew = undefined;
    ([this._currentSchema] = Object.keys(this._schemas));
  }

  getPrefix() {
    const prefix = `/${this._org}`;
    return this._site ? `${prefix}/${this._site}` : prefix;
  }

  async handleDelete() {
    const id = this._currentSchema;
    const prefix = this.getPrefix();
    const result = await deleteSchema(prefix, id);
    if (result.error) {
      this.newInput.error = result.error;
      return;
    }
    delete this._schemas[id];
    this.setDefault();
  }

  async handleSave(isUpdate) {
    const id = isUpdate ? this._currentSchema : this.newInput.value;
    const content = this._editor.state.doc.toString();
    const prefix = this.getPrefix();
    const result = await saveSchema(prefix, id, content);
    if (result.error) {
      this.newInput.error = result.error;
      return;
    }
    if (!isUpdate) {
      this._schemas[id] = JSON.parse(content);
      this._createNew = undefined;
    }
  }

  handleNewInput({ target }) {
    target.value = target.value.replaceAll(/[^a-zA-Z0-9]/g, '-').toLowerCase();
  }

  get newInput() {
    return this.shadowRoot.querySelector('[name="new-schema"]');
  }

  get codeEditor() {
    return this.shadowRoot.querySelector('.nx-codemirror');
  }

  // Programatically make the select so lit doesn't keep old options
  // TODO: Fix me
  get schemaSelect() {
    const select = document.createElement('sl-select');
    const options = Object.keys(this._schemas).map((key) => {
      const option = document.createElement('option');
      option.value = key;
      option.innerText = this._schemas[key].title;
      return option;
    });
    select.append(...options);
    select.addEventListener('change', (e) => { this.handleSchemaChange(e); });
    return select;
  }

  renderSelectSchema() {
    return html`
      ${this.schemaSelect}
      <sl-button class="negative outline" @click=${this.handleDelete}>Delete schema</sl-button>
      <sl-button @click=${() => this.handleSave(true)}>Update schema</sl-button>`;
  }

  renderNewSchema() {
    return html`
      <sl-input type="text" name="new-schema" placeholder="new-schema-name" @input=${this.handleNewInput}></sl-input>
      <sl-button class="primary outline" @click=${this.setDefault}>Cancel</sl-button>
      <sl-button @click=${this.handleSave}>Save schema</sl-button>
    `;
  }

  renderEditor() {
    return html`
      <div class="schema-select-wrapper">
        ${!this._schemas || this._createNew ? this.renderNewSchema() : this.renderSelectSchema()}
      </div>
      <div class="nx-codemirror"></div>
    `;
  }

  render() {
    return html`
      <nx-path label="Load schemas" @details=${this.handleDetail}></nx-path>
      <h1>Schema Editor</h1>
      ${this._schemas !== undefined ? this.renderEditor() : nothing}
    `;
  }
}

customElements.define(EL_NAME, SchemaEditor);

export default function init(el) {
  el.replaceChildren();
  let cmp = el.querySelector(EL_NAME);
  if (!cmp) {
    cmp = document.createElement(EL_NAME);
    el.append(cmp);
  }
}
