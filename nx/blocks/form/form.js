import { LitElement, html, nothing } from 'da-lit';
import getPathDetails from 'https://da.live/blocks/shared/pathDetails.js';

import FormModel from './data/model.js';

// Internal utils
import { getParentPointer } from './utils/pointer.js';
import { schemas as schemasPromise } from './utils/schema.js';
import { findNodeByPointer, loadHtml } from './utils/utils.js';

import 'https://da.live/blocks/edit/da-title/da-title.js';

// Internal Web Components
import './views/editor.js';
import './views/sidebar.js';
import './views/preview.js';
import './views/dialog.js';

// External Web Components
await import('../../public/sl/components.js');

// Styling
const { default: getStyle } = await import('../../utils/styles.js');
const style = await getStyle(import.meta.url);

const EL_NAME = 'da-form';
const PREVIEW_PREFIX = 'https://da-sc.adobeaem.workers.dev/preview';
const LIVE_PREFIX = 'https://da-sc.adobeaem.workers.dev/live';

class FormEditor extends LitElement {
  static properties = {
    details: { attribute: false },
    formModel: { state: true },
    _schemas: { state: true },
    _isUnstructuredDoc: { state: true },
    _activeNavPointer: { state: true },
    _scrollEditorIntoView: { state: true },
    _scrollNavItemIntoView: { state: true },
    _pendingSchemaId: { state: true },
  };

  constructor() {
    super();
    this._isUnstructuredDoc = false;
    this._pendingSchemaId = '';
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this.fetchDoc(this.details);
  }

  async fetchDoc() {
    if (this.details?.depth <= 2) {
      this._isUnstructuredDoc = true;
      this.formModel = null;
      this._pendingSchemaId = '';
      this._activeNavPointer = undefined;
      this._scrollEditorIntoView = undefined;
      this._scrollNavItemIntoView = undefined;
      return;
    }

    const resultPromise = loadHtml(this.details);

    const [schemas, result] = await Promise.all([schemasPromise, resultPromise]);

    if (schemas) this._schemas = schemas;

    if (!result.html) {
      this._isUnstructuredDoc = false;
      this.formModel = null;
      this._pendingSchemaId = '';
      this._activeNavPointer = undefined;
      this._scrollEditorIntoView = undefined;
      this._scrollNavItemIntoView = undefined;
      return;
    }

    const path = this.details.fullpath;
    const model = new FormModel({ path, html: result.html, schemas });
    const metadata = JSON.parse(model.getSerializedJson()).metadata ?? {};

    if (Object.keys(metadata).length === 0) {
      this._isUnstructuredDoc = true;
      this.formModel = null;
      this._pendingSchemaId = '';
      this._activeNavPointer = undefined;
      this._scrollEditorIntoView = undefined;
      this._scrollNavItemIntoView = undefined;
      return;
    }

    this._isUnstructuredDoc = false;
    this._activeNavPointer = undefined;
    this._scrollEditorIntoView = undefined;
    this._scrollNavItemIntoView = undefined;
    this.formModel = model;
  }

  _onPendingSchemaChange(e) {
    const v = e.currentTarget?.value ?? '';
    this._pendingSchemaId = v;
  }

  _applySelectedSchema(schemaId) {
    if (!schemaId) return;

    const title = this.details.name;

    const data = {};
    const metadata = { title, schemaName: schemaId };
    const emptyForm = { data, metadata };

    const path = this.details.fullpath;
    this._activeNavPointer = undefined;
    this._scrollEditorIntoView = undefined;
    this._scrollNavItemIntoView = undefined;
    this.formModel = new FormModel({ path, json: emptyForm, schemas: this._schemas });
  }

  _confirmSchemaStart() {
    this.renderRoot.querySelector('da-form-dialog')?.close();
    this._applySelectedSchema(this._pendingSchemaId);
  }

  _goToRepoRoot() {
    const query = window.location.search ?? '';
    window.location.href = `https://da.live${query}#/${this.details.owner}/${this.details.repo}`;
  }

  get schemaEditorHref() {
    return `https://da.live/apps/schema#/${this.details.owner}/${this.details.repo}`;
  }

  _handleNavPointerSelectFromSidebar(e) {
    const { pointer } = e.detail ?? {};
    if (!pointer || pointer === this._activeNavPointer) return;
    this._activeNavPointer = pointer;
    this._scrollEditorIntoView = true;
    this._scrollNavItemIntoView = false;
  }

  _handleNavPointerSelectFromEditor(e) {
    const { pointer } = e.detail ?? {};
    if (!pointer || pointer === this._activeNavPointer) return;
    this._activeNavPointer = pointer;
    this._scrollEditorIntoView = false;
    this._scrollNavItemIntoView = true;
  }

  async handleUpdate({ detail }) {
    this.formModel.updateProperty(detail);

    // Update the view with the new values
    this.formModel = this.formModel.clone();

    // Persist the data
    await this.formModel.saveHtml();
  }

  async handleAddItem({ detail }) {
    const { pointer, items } = detail;
    this.formModel.addArrayItem(pointer, items);

    // Update the view with the new values
    this.formModel = this.formModel.clone();

    // Persist the data
    await this.formModel.saveHtml();
  }

  async handleInsertItem({ detail }) {
    const { pointer } = detail;
    const parentPointer = getParentPointer(pointer);
    const node = this.formModel?.annotated && parentPointer
      ? findNodeByPointer(this.formModel.annotated, parentPointer)
      : null;
    const items = node?.items;
    if (!this.formModel.insertArrayItem(pointer, items)) return;

    // Update the view with the new values
    this.formModel = this.formModel.clone();

    // Persist the data
    await this.formModel.saveHtml();
  }

  async handleRemoveItem({ detail }) {
    const { pointer } = detail;
    if (!this.formModel.removeArrayItem(pointer)) return;

    // Update the view with the new values
    this.formModel = this.formModel.clone();

    // Persist the data
    await this.formModel.saveHtml();
  }

  async handleMoveArrayItem({ detail }) {
    const { pointer, beforePointer } = detail;
    if (!this.formModel.moveArrayItem(pointer, beforePointer)) return;

    // Update the view with the new values
    this.formModel = this.formModel.clone();

    // Persist the data
    await this.formModel.saveHtml();
  }

  renderSchemaSelector() {
    const schemaEntries = Object.entries(this._schemas || {});
    const hasSchemas = schemaEntries.length > 0;
    const emptyLabel = hasSchemas ? 'Select a schema' : 'No schemas available yet';

    return html`
      <da-form-dialog title="Choose a schema">
        <div class="da-form-schema-form">
          <sl-select
            hoist
            class="da-form-schema-select"
            label="Schema"
            placeholder=${emptyLabel}
            .value=${this._pendingSchemaId}
            @change=${this._onPendingSchemaChange}
          >
            <option value="">${emptyLabel}</option>
            ${schemaEntries.map(([key, value]) => html`
              <option value="${key}">${value.title}</option>
            `)}
          </sl-select>
          <p class="da-form-schema-hint">
            To create a new schema, open
            <a href=${this.schemaEditorHref} target="_blank" rel="noopener noreferrer">Schema Editor</a>.
          </p>
          <div class="da-form-schema-actions">
            <sl-button
              class="da-form-schema-start"
              ?disabled=${!this._pendingSchemaId}
              @click=${this._confirmSchemaStart}
            >Create</sl-button>
          </div>
        </div>
      </da-form-dialog>`;
  }

  renderUnstructuredDialog() {
    const message = 'The item at this path is not a structured content.';

    return html`
      <da-form-dialog title="Document not found">
        <p class="da-form-schema-hint">
          ${message}
        </p>
        <div class="da-form-schema-actions">
          <sl-button class="da-form-schema-start" title="" @click=${this._goToRepoRoot}>Return to Home</sl-button>
        </div>
      </da-form-dialog>`;
  }

  renderFormEditor() {
    if (this._isUnstructuredDoc) {
      return this.renderUnstructuredDialog();
    }

    if (this.formModel === null) {
      return this.renderSchemaSelector();
    }

    return html`
      <div class="da-form-editor">
        <da-form-editor
          @update=${this.handleUpdate}
          @add-item=${this.handleAddItem}
          @insert-item=${this.handleInsertItem}
          @remove-item=${this.handleRemoveItem}
          @move-array-item=${this.handleMoveArrayItem}
          @nav-pointer-select=${this._handleNavPointerSelectFromEditor}
          .formModel=${this.formModel}
          .activeNavPointer=${this._activeNavPointer}
          .scrollEditorIntoView=${this._scrollEditorIntoView}
        ></da-form-editor>
        <da-form-preview .formModel=${this.formModel}></da-form-preview>
      </div>`;
  }

  render() {
    const hasForm = this.formModel != null;
    const wrapperClass = `da-form-wrapper${hasForm ? '' : ' da-form-wrapper-centered'}`;
    return html`
      <div class=${wrapperClass}>
        ${this.formModel !== undefined ? this.renderFormEditor() : nothing}
        ${hasForm
        ? html`<da-form-sidebar
            .formModel=${this.formModel}
            .activeNavPointer=${this._activeNavPointer}
            .scrollNavItemIntoView=${this._scrollNavItemIntoView}
            @nav-pointer-select=${this._handleNavPointerSelectFromSidebar}
          ></da-form-sidebar>`
        : nothing}
      </div>
    `;
  }
}

customElements.define(EL_NAME, FormEditor);

function setDetails(parent, name, details) {
  const cmp = document.createElement(name);
  cmp.details = details;

  if (name === 'da-title') {
    cmp.previewPrefix = `${PREVIEW_PREFIX}/${details.owner}/${details.repo}`;
    cmp.livePrefix = `${LIVE_PREFIX}/${details.owner}/${details.repo}`;
  }

  parent.append(cmp);
}

function setup(el) {
  el.replaceChildren();
  const details = getPathDetails();
  setDetails(el, 'da-title', details);
  setDetails(el, EL_NAME, details);
}

export default function init(el) {
  setup(el);
  window.addEventListener('hashchange', () => { setup(el); });
}
