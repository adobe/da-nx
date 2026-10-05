import { html, LitElement, nothing } from 'da-lit';
import { loadStyle } from '../../../nx2/utils/utils.js';
import { loadHrefSvg } from '../../../nx2/utils/svg.js';
import { loadSchemas, saveSchema, deleteSchema, loadCodeMirror, updateCodeMirror } from './utils/utils.js';

import '../../../nx2/public/sl/components.js';
import '../shared/path/path.js';

const ALERT_ICONS = {
  info: '/img/icons/s2-icon-infocircle-20-n.svg',
  warning: '/img/icons/s2-icon-alertdiamond-20-n.svg',
  success: '/img/icons/s2-icon-checkmarkcircle-20-n.svg',
};

const EL_NAME = 'nx-schema-editor';
const DEFAULT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {},
};

function describeSchemaIssues(issues) {
  const lines = issues.map((issue) => {
    // The SDK supplies the human `message` and points at the schema source via
    // `schemaPath` ($refs re-rooted at their $def). Root is '/' — show a
    // friendly label there. Strip the message's trailing period before the
    // location suffix so it reads as one clause.
    const where = issue.schemaPath && issue.schemaPath !== '/' ? `#${issue.schemaPath}` : 'the schema root';
    const what = (issue.message || issue.reason || '').replace(/\.$/, '');
    return `${what} (at ${where})`;
  });
  // Distinct schema locations may collapse to the same line (a shared $def).
  return [...new Set(lines)];
}

const style = await loadStyle(import.meta.url);
const icons = (await Promise.all(
  Object.values(ALERT_ICONS).map((path) => loadHrefSvg(path)),
)).filter(Boolean);

class SchemaEditor extends LitElement {
  static properties = {
    _org: { state: true },
    _site: { state: true },
    _alert: { state: true },
    _schemaErrors: { state: true },
    _schemas: { state: true },
    _currentSchema: { state: true },
    _createNew: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this.shadowRoot.append(...icons);
  }

  updated(props) {
    if (!(props.has('_currentSchema') || props.has('_createNew'))) return;

    const entry = this._schemas?.[this._currentSchema];

    // A malformed schema keeps its raw text so it can be repaired in the editor;
    // anything else renders the parsed schema (falling back to a new one).
    const doc = entry?.status === 'invalid-json'
      ? entry.raw
      : JSON.stringify(entry?.schema ?? DEFAULT_SCHEMA, null, 2);

    if (!this._editor) {
      this._editor = loadCodeMirror(this.codeEditor, doc);
    } else {
      updateCodeMirror(this._editor, doc);
    }

    // Flag a saved schema that's broken so the author isn't editing it blind.
    if (this._currentSchema) this.validateCurrent();
  }

  // Lazily loaded on first use to keep the SDK bundle out of the editor's load.
  async runValidation(schema) {
    const { validateSchema } = await import('../../deps/da-sc-sdk/dist/index.js');
    return validateSchema({ schema });
  }

  async validateCurrent() {
    const id = this._currentSchema;
    const entry = this._schemas?.[id];
    if (!entry) return;

    if (entry.status === 'invalid-json') {
      this._schemaErrors = { message: 'This schema contains invalid JSON. Correct the syntax and save to continue.' };
      return;
    }

    const { valid, schemaIssues } = await this.runValidation(entry.schema);
    // Selection may have changed while the validator loaded.
    if (this._currentSchema !== id) return;
    this._schemaErrors = valid
      ? undefined
      : {
        message: 'This schema has validation errors:',
        issues: describeSchemaIssues(schemaIssues),
      };
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
      // Drop any validation errors from the previously selected schema.
      this._schemaErrors = undefined;
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
    const id = isUpdate && this._currentSchema ? this._currentSchema : this.newInput?.value;
    if (this._createNew && !id) {
      this._alert = { type: 'warning', message: 'Please enter a schema name before saving.' };
      return;
    }
    const content = this._editor.state.doc.toString();

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      this._schemaErrors = {
        message: 'This schema has invalid JSON and cannot be saved:',
        issues: [e.message],
      };
      return;
    }

    // Structural validation against the SC engine. A schema it can't compile
    // is unusable, so block the save and surface the issues rather than
    // persisting something no form can consume. The default template is seeded
    // valid so a new schema isn't trapped by this gate.
    const { valid, schemaIssues } = await this.runValidation(parsed);
    if (!valid) {
      this._schemaErrors = {
        message: 'This schema has validation errors and cannot be saved:',
        issues: describeSchemaIssues(schemaIssues),
      };
      return;
    }

    const prefix = this.getPrefix();
    const result = await saveSchema(prefix, id, content);
    if (result.error) {
      this.newInput.error = result.error;
      return;
    }
    this._schemas[id] = { status: 'loaded', schema: parsed };
    if (!isUpdate) {
      this._createNew = undefined;
    }
    this._schemaErrors = undefined;
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
    // Make a synthetic list with a "new schema" entry (same tagged shape).
    const schemas = { ...this._schemas, 'nx-new-schema': { status: 'loaded', schema: { title: 'New schema' } } };
    const select = document.createElement('sl-select');
    const options = Object.keys(schemas).map((key) => {
      const option = document.createElement('option');
      option.value = key;
      // A malformed schema has no parsed title, so fall back to its name.
      option.innerText = schemas[key].schema?.title || key;
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
      ${this.renderSchemaErrors()}
      <div class="nx-codemirror"></div>
    `;
  }

  renderAlert() {
    if (!this._alert) return nothing;

    return html`
      <div class="nx-alert ${this._alert.type || 'info'}">
        <svg class="icon"><use href="${ALERT_ICONS[this._alert.type || 'info']}"/></svg>
        <p>${this._alert.message}</p>
      </div>
    `;
  }

  renderSchemaErrors() {
    if (!this._schemaErrors) return nothing;

    const { message, issues } = this._schemaErrors;
    return html`
      <div class="nx-schema-errors" role="alert">
        <p class="nx-schema-errors-title">${message}</p>
        ${Array.isArray(issues) && issues.length
    ? html`<ul>${issues.map((issue) => html`<li>${issue}</li>`)}</ul>`
    : nothing}
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
