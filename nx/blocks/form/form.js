import { LitElement, html, nothing } from 'da-lit';
import getPathDetails from 'https://da.live/blocks/shared/pathDetails.js';

import FormModel from './data/model.js';

// Internal utils
import { getParentPointer } from './utils/pointer.js';
import { schemas as schemasPromise } from './utils/schema.js';
import {
  findNodeByPointer,
  isDaDocumentResource,
  isEmptyDocumentHtml,
  isStructuredContentHtml,
  loadHtml,
} from './utils/utils.js';

import 'https://da.live/blocks/edit/da-title/da-title.js';
import 'https://da.live/blocks/shared/da-dialog/da-dialog.js';

// Internal Web Components
import './views/editor.js';
import './views/sidebar.js';
import './views/preview.js';

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
    _formBlocker: { state: true },
    _activeNavPointer: { state: true },
    _scrollEditorIntoView: { state: true },
    _scrollNavItemIntoView: { state: true },
    _pendingSchemaId: { state: true },
  };

  constructor() {
    super();
    this._pendingSchemaId = '';
    this._formBlocker = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this.fetchDoc(this.details);
  }

  _resetEditorState() {
    this.formModel = null;
    this._formBlocker = null;
    this._pendingSchemaId = '';
    this._activeNavPointer = undefined;
    this._scrollEditorIntoView = undefined;
    this._scrollNavItemIntoView = undefined;
  }

  async fetchDoc() {
    if (!isDaDocumentResource(this.details)) {
      this._resetEditorState();
      this._formBlocker = { type: 'not-document' };
      return;
    }

    const resultPromise = loadHtml(this.details);

    const [schemas, result] = await Promise.all([schemasPromise, resultPromise]);

    if (schemas) this._schemas = schemas;

    if (result.error) {
      this._resetEditorState();
      const { status } = result;
      if (status === 401 || status === 403) {
        this._formBlocker = { type: 'no-access' };
      } else if (status === 404) {
        // Folders and similar paths often yield 404 for the resolved source URL.
        this._formBlocker = { type: 'not-document' };
      } else if (typeof status === 'number') {
        this._formBlocker = { type: 'load-failed', status };
      } else {
        this._formBlocker = { type: 'load-failed' };
      }
      return;
    }

    if (typeof result.html !== 'string') {
      this._resetEditorState();
      this._formBlocker = { type: 'load-failed' };
      return;
    }

    if (isEmptyDocumentHtml(result.html)) {
      this._resetEditorState();
      return;
    }

    if (!isStructuredContentHtml(result.html)) {
      this._resetEditorState();
      this._formBlocker = { type: 'not-form-content' };
      return;
    }

    const path = this.details.fullpath;
    this._formBlocker = null;
    this._activeNavPointer = undefined;
    this._scrollEditorIntoView = undefined;
    this._scrollNavItemIntoView = undefined;
    const model = new FormModel({ path, html: result.html, schemas });
    const json = JSON.parse(model.getSerializedJson());
    const schemaName = json?.metadata?.schemaName;

    if (!model.schema) {
      this._resetEditorState();
      this._formBlocker = { type: 'missing-schema', schemaName: schemaName ?? '' };
      return;
    }

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
    this._formBlocker = null;
    this._activeNavPointer = undefined;
    this._scrollEditorIntoView = undefined;
    this._scrollNavItemIntoView = undefined;
    this.formModel = new FormModel({ path, json: emptyForm, schemas: this._schemas });
  }

  _confirmSchemaStart() {
    this._applySelectedSchema(this._pendingSchemaId);
  }

  _getSchemaEditorHref() {
    const { owner, repo } = this.details ?? {};
    if (!owner || !repo) return 'https://da.live/apps/schema';
    return `https://da.live/apps/schema#/${owner}/${repo}`;
  }

  _goToRepoRoot() {
    const { owner, repo } = this.details ?? {};
    if (!owner || !repo) return;
    const query = window.location.search ?? '';
    window.location.href = `https://da.live${query}#/${owner}/${repo}`;
  }

  _getDisplayPath() {
    const fullpath = (this.details?.fullpath ?? '').trim();
    return fullpath.toLowerCase().endsWith('.html')
      ? fullpath.slice(0, -5)
      : fullpath;
  }

  _renderResourcePathSuffix(displayPath) {
    return displayPath ? html` at <strong>${displayPath}</strong>` : nothing;
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
    const schemaEditorHref = this._getSchemaEditorHref();
    return html`
      <div class="da-form-schema-shell">
        <h2 class="da-form-schema-heading">Choose a schema</h2>
        <div class="da-form-schema-form">
          <sl-select
            hoist
            class="da-form-schema-select"
            label="Schema"
            placeholder="Select a schema"
            .value=${this._pendingSchemaId}
            @change=${this._onPendingSchemaChange}
          >
            <option value="">Select a schema</option>
            ${Object.entries(this._schemas).map(([key, value]) => html`
              <option value="${key}">${value.title}</option>
            `)}
          </sl-select>
          <p class="da-form-schema-hint da-form-schema-selector-hint">
            To create a new schema, open
            <a
              class="da-form-schema-text-link"
              href=${schemaEditorHref}
              target="_blank"
              rel="noopener noreferrer"
            >Schema Editor</a>.
          </p>
          <sl-button
            class="da-form-schema-start"
            ?disabled=${!this._pendingSchemaId}
            @click=${this._confirmSchemaStart}
          >Create</sl-button>
        </div>
      </div>`;
  }

  renderUnsupportedContentMessage() {
    const schemaEditorHref = this._getSchemaEditorHref();
    const blocker = this._formBlocker;
    const action = {
      label: 'Return to Home',
      style: '',
      click: () => this._goToRepoRoot(),
    };
    const displayPath = this._getDisplayPath();

    let title = 'Unable to open';
    let body = html`
      <p class="da-form-schema-hint">
        This resource could not be opened.
      </p>
    `;

    if (blocker?.type === 'missing-schema') {
      const schemaName = blocker.schemaName || '(empty)';
      title = 'Schema not found';
      body = html`
        <p class="da-form-schema-hint">
          No schema named <strong>${schemaName}</strong>.
          <a
            class="da-form-schema-text-link"
            href=${schemaEditorHref}
            target="_blank"
            rel="noopener noreferrer"
          >Schema Editor</a>
        </p>
      `;
    } else if (blocker?.type === 'not-document' || blocker?.type === 'not-form-content') {
      title = 'Unsupported resource';
      body = html`
        <p class="da-form-schema-hint">
          This resource${this._renderResourcePathSuffix(displayPath)} is not Structured Content.
        </p>
      `;
    } else if (blocker?.type === 'no-access') {
      title = 'Access denied';
      body = html`
        <p class="da-form-schema-hint">
          You do not have access to this resource${this._renderResourcePathSuffix(displayPath)}.
        </p>
      `;
    } else if (blocker?.type === 'load-failed') {
      title = 'Unable to load';
      body = html`
        <p class="da-form-schema-hint">
          This resource could not be loaded. Try again later.
        </p>
      `;
    }

    return html`
      <da-dialog
        title=${title}
        size="large"
        @close=${this._goToRepoRoot}
        .action=${action}
      >
        ${body}
      </da-dialog>
    `;
  }

  renderFormEditor() {
    if (this._formBlocker) return this.renderUnsupportedContentMessage();

    if (this.formModel === null) {
      if (this._schemas) return this.renderSchemaSelector();

      return html`
        <div class="da-form-schema-shell">
          <div class="da-form-schema-card">
            <p class="da-form-title">Please create a schema</p>
            <p class="da-form-schema-hint">
              This project has no schemas yet. Open the schema editor to add one, then return here.
            </p>
            <div class="da-form-schema-field da-form-schema-field-link">
              <a
                class="da-form-schema-cta"
                href=${this._getSchemaEditorHref()}
                target="_blank"
                rel="noopener noreferrer"
              >Open Schema Editor</a>
            </div>
          </div>
        </div>
      `;
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
