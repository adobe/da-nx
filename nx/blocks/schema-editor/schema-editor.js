import { html, LitElement, nothing } from 'da-lit';
import { getConfig } from '../../scripts/nexter.js';
import getStyle from '../../utils/styles.js';
import getSvg from '../../utils/svg.js';
import { loadSchemas, saveSchema, deleteSchema, loadCodeMirror, updateCodeMirror } from './utils/utils.js';

import '../../public/sl/components.js';
import '../shared/path/path.js';

const { nxBase: nx } = getConfig();

const ICONS = [
  `${nx}/public/icons/S2_Icon_InfoCircle_20_N.svg`,
  `${nx}/public/icons/S2_Icon_AlertDiamond_20_N.svg`,
  `${nx}/public/icons/S2_Icon_CheckmarkCircle_20_N.svg`,
];

const EL_NAME = 'nx-schema-editor';
const DEFAULT_SCHEMA = { $schema: 'https://json-schema.org/draft/2020-12/schema' };

const styles = await getStyle(import.meta.url);
const icons = await getSvg({ paths: ICONS });

class SchemaEditor extends LitElement {
  static properties = {
    _org: { state: true },
    _site: { state: true },
    _alert: { state: true },
    _schemas: { state: true },
    _currentSchema: { state: true },
    _createNew: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    this.shadowRoot.append(...icons);
  }

  updated(props) {
    if (!(props.has('_currentSchema') || props.has('_createNew'))) return;

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

    if (!this._org) {
      this._alert = { type: 'warning', message: 'Please enter an org/site to view schemas.' };
      return;
    }

    const schemas = await loadSchemas(this._org, this._site);

    // We at least have an org, but the schemas are empty
    if (!Object.keys(schemas).length) {
      this._schemas = {};
      this._createNew = true;
      this._alert = { type: 'warning', message: 'No schemas found. Please create one.' };
      return;
    }

    this._schemas = schemas;
    this.setDefault();
  }

  setDefault() {
    this._createNew = undefined;
    this._alert = { type: 'info', message: 'Select a schema to edit.' };
    ([this._currentSchema] = Object.keys(this._schemas));
  }

  getPrefix() {
    const prefix = `/${this._org}`;
    return this._site ? `${prefix}/${this._site}` : prefix;
  }

  handleSchemaChange({ target }) {
    if (target.value === 'nx-new-schema') {
      this._createNew = true;
      // Remove any existing schema
      this._currentSchema = undefined;
      return;
    }
    this._currentSchema = target.value;
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
    const id = isUpdate && this._currentSchema ? this._currentSchema : this.newInput.value;
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
    this._alert = { type: 'success', message: 'Schema saved.' };
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
  get schemaSelect() {
    // Make a synthetic list with a "new schema" entry
    const schemas = { ...this._schemas, 'nx-new-schema': { title: 'New schema' } };
    const select = document.createElement('sl-select');
    const options = Object.keys(schemas).map((key) => {
      const option = document.createElement('option');
      option.value = key;
      option.innerText = schemas[key].title || key;
      return option;
    });
    if (this._currentSchema) select.value = this._currentSchema;
    select.append(...options);
    select.addEventListener('change', (e) => { this.handleSchemaChange(e); });
    return select;
  }

  renderSelectSchema() {
    return html`
      ${this.schemaSelect}
      <sl-button class="negative outline" @click=${this.handleDelete}>Delete schema</sl-button>
      <sl-button @click=${() => this.handleSave(true)}>Save schema</sl-button>`;
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

  renderAlert() {
    if (!this._alert) return nothing;

    const type2icon = {
      info: 'InfoCircle',
      warning: 'AlertDiamond',
      success: 'CheckmarkCircle',
    };

    return html`
      <div class="nx-alert ${this._alert.type || 'info'}">
        <svg class="icon"><use href="#S2_Icon_${type2icon[this._alert.type || 'info']}_20_N"/></svg>
        <p>${this._alert.message}</p>
      </div>
    `;
  }

  render() {
    return html`
      <nx-path label="Load schemas" @details=${this.handleDetail}></nx-path>
      <h1>Schema Editor</h1>
      ${this.renderAlert()}
      ${this._schemas ? this.renderEditor() : nothing}
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
