import { LitElement, html, nothing } from 'da-lit';
import getPathDetails from 'https://da.live/blocks/shared/pathDetails.js';

import 'https://da.live/blocks/edit/da-title/da-title.js';

import { createCore } from './core/index.js';
import { loadFormContext } from './app/context.js';
import { saveSourceHtml } from './app/da-api.js';
import { serialize } from './app/serialize.js';

import './ui/editor.js';
import './ui/sidebar.js';
import './ui/preview.js';

const { default: getStyle } = await import('../../utils/styles.js');
const style = await getStyle(new URL('./ui/shell.css', import.meta.url).href);

const DIALOG_MODULE = 'https://da.live/blocks/shared/da-dialog/da-dialog.js';
const SL_COMPONENTS_MODULE = new URL('../../public/sl/components.js', import.meta.url).href;

const loadBlockedDeps = () => import(DIALOG_MODULE);
const loadSchemaPickerDeps = () => import(SL_COMPONENTS_MODULE);

const EL_NAME = 'sc-form';
const PREVIEW_PREFIX = 'https://da-sc.adobeaem.workers.dev/preview';
const LIVE_PREFIX = 'https://da-sc.adobeaem.workers.dev/live';

async function saveDocument({ path, document }) {
  const result = serialize({ json: document });
  if (result.error) return result;
  return saveSourceHtml({ path, html: result.html });
}

class Form extends LitElement {
  static properties = {
    details: { attribute: false },
    _context: { state: true },
    _state: { state: true },
    _nav: { state: true },
    _pendingSchemaId: { state: true },
  };

  constructor() {
    super();
    this._context = { status: 'idle', schemas: {} };
    this._state = null;
    this._nav = { pointer: '/data', origin: null, seq: 0 };
    this._pendingSchemaId = '';
    this._loadVersion = 0;
    this._core = null;

    this._onChange = () => {
      if (!this._core) return;
      this._state = this._core.getState();
    };
    this._onSelect = (pointer, origin = null) => {
      if (!pointer) return;
      this._nav = {
        pointer,
        origin,
        seq: (this._nav?.seq ?? 0) + 1,
      };
    };
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  updated(changed) {
    if (changed.has('details') && this.details) {
      this._loadContext();
    }
  }

  async _start({ schema, json }) {
    this._core = createCore({
      path: this.details?.fullpath,
      saveDocument,
      onChange: this._onChange,
    });
    this._state = await this._core.load({ schema, document: json });
    this._nav = { pointer: '/data', origin: null, seq: 0 };
  }

  async _loadContext() {
    this._loadVersion += 1;
    const version = this._loadVersion;
    this._pendingSchemaId = '';
    this._state = null;
    this._core = null;
    this._context = { status: 'loading', schemas: {} };

    const context = await loadFormContext({ details: this.details });
    if (version !== this._loadVersion) return;

    if (context.status === 'blocked') {
      await loadBlockedDeps();
    } else if (context.status === 'select-schema' || context.status === 'no-schemas') {
      await loadSchemaPickerDeps();
    }
    if (version !== this._loadVersion) return;

    this._context = context;

    if (context.status === 'ready') {
      await this._start({ schema: context.schema, json: context.json });
    }
  }

  _onPendingSchemaChange(e) {
    this._pendingSchemaId = e.currentTarget?.value ?? '';
  }

  async _applySelectedSchema() {
    const schemaName = this._pendingSchemaId;
    const schema = this._context.schemas?.[schemaName];
    if (!schema || !schemaName) return;

    const json = {
      metadata: {
        title: this.details?.name ?? '',
        schemaName,
      },
      data: {},
    };

    this._context = {
      ...this._context,
      status: 'ready',
      schemaName,
      schema,
      json,
    };

    await this._start({ schema, json });
  }

  _schemaEditorHref() {
    const { owner, repo } = this.details ?? {};
    if (!owner || !repo) return 'https://da.live/apps/schema';
    return `https://da.live/apps/schema#/${owner}/${repo}`;
  }

  _goHome() {
    const { owner, repo } = this.details ?? {};
    if (!owner || !repo) return;
    const query = window.location.search ?? '';
    window.location.href = `https://da.live${query}#/${owner}/${repo}`;
  }

  _renderCentered(content) {
    return html`
      <div class="sc-form-wrapper sc-form-wrapper-centered">
        ${content}
      </div>
    `;
  }

  _renderMessage(title, body, { showHomeAction = false, showProgress = false } = {}) {
    return this._renderCentered(html`
      <div class="sc-form-schema-shell">
        <section class="sc-form-message">
          ${showProgress || title ? html`
            <div class="sc-form-message-title-row">
              ${showProgress ? html`<span class="sc-form-progress-circle" aria-hidden="true"></span>` : nothing}
              ${title ? html`<h2>${title}</h2>` : nothing}
            </div>
          ` : nothing}
          <p>${body}</p>
          ${showHomeAction ? html`
            <div class="sc-form-actions">
              <button
                type="button"
                class="sc-form-button"
                @click=${() => this._goHome()}
              >Return to Home</button>
            </div>
          ` : nothing}
        </section>
      </div>
    `);
  }

  _renderBlocked() {
    const { blocker = {}, displayPath } = this._context ?? {};
    const schemaEditorHref = this._schemaEditorHref();
    const action = {
      label: 'Return to Home',
      style: '',
      click: () => this._goHome(),
    };

    let title = 'Unable to open';
    let body = html`
      <p class="sc-form-schema-hint">This resource could not be opened.</p>
    `;

    if (blocker.type === 'missing-schema') {
      const schemaName = blocker.schemaName || '(empty)';
      title = 'Schema not found';
      body = html`
        <p class="sc-form-schema-hint">
          No schema named <strong>${schemaName}</strong>.
          <a
            class="sc-form-schema-text-link"
            href=${schemaEditorHref}
            target="_blank"
            rel="noopener noreferrer"
          >Schema Editor</a>
        </p>
      `;
    } else if (blocker.type === 'not-document' || blocker.type === 'not-form-content') {
      title = 'Unsupported resource';
      body = html`
        <p class="sc-form-schema-hint">
          This resource${displayPath ? html` at <strong>${displayPath}</strong>` : nothing}
          is not Structured Content.
        </p>
      `;
    } else if (blocker.type === 'no-access') {
      title = 'Access denied';
      body = html`
        <p class="sc-form-schema-hint">
          You do not have access to this resource${displayPath ? html` at <strong>${displayPath}</strong>` : nothing}.
        </p>
      `;
    } else if (blocker.type === 'load-failed') {
      title = 'Unable to load';
      body = html`
        <p class="sc-form-schema-hint">This resource could not be loaded. Try again later.</p>
      `;
    }

    return html`
      <da-dialog
        title=${title}
        size="large"
        @close=${this._goHome}
        .action=${action}
      >
        ${body}
      </da-dialog>
    `;
  }

  _renderSchemaSelector() {
    const schemas = this._context.schemas ?? {};
    const schemaEditorHref = this._schemaEditorHref();

    return html`
      <div class="sc-form-schema-shell">
        <h2 class="sc-form-schema-heading">Choose a schema</h2>
        <div class="sc-form-schema-form">
          <sl-select
            hoist
            class="sc-form-schema-select"
            label="Schema"
            placeholder="Select a schema"
            .value=${this._pendingSchemaId}
            @change=${this._onPendingSchemaChange}
          >
            <option value="">Select a schema</option>
            ${Object.entries(schemas).map(([id, schema]) => html`
              <option value="${id}">${schema?.title ?? id}</option>
            `)}
          </sl-select>
          <p class="sc-form-schema-hint sc-form-schema-selector-hint">
            To create a new schema, open
            <a
              class="sc-form-schema-text-link"
              href=${schemaEditorHref}
              target="_blank"
              rel="noopener noreferrer"
            >Schema Editor</a>.
          </p>
          <sl-button
            class="sc-form-schema-start"
            ?disabled=${!this._pendingSchemaId}
            @click=${this._applySelectedSchema}
          >Create</sl-button>
        </div>
      </div>
    `;
  }

  _renderNoSchemas() {
    return html`
      <div class="sc-form-schema-shell">
        <div class="sc-form-schema-card">
          <p class="sc-form-title">Please create a schema</p>
          <p class="sc-form-schema-hint">
            This project has no schemas yet. Open the schema editor to add one, then return here.
          </p>
          <div class="sc-form-schema-field sc-form-schema-field-link">
            <a
              class="sc-form-schema-cta"
              href=${this._schemaEditorHref()}
              target="_blank"
              rel="noopener noreferrer"
            >Open Schema Editor</a>
          </div>
        </div>
      </div>
    `;
  }

  _renderSaveStatus() {
    const status = this._state?.saveStatus ?? 'idle';
    if (status === 'idle') return nothing;
    const labels = { saving: 'Saving…', saved: 'Saved', error: 'Save failed' };
    const text = labels[status] ?? '';
    return html`
      <span
        class="sc-save-status sc-save-status-${status}"
        role="status"
        aria-live="polite"
      >${text}</span>
    `;
  }

  _renderReady() {
    if (!this._state) {
      return this._renderMessage('', 'Preparing structured content editor...', { showProgress: true });
    }

    const root = this._state?.model?.root;
    if (!root) {
      return this._renderMessage(
        'Unavailable',
        'Structured content is unavailable for this document.',
        { showHomeAction: true },
      );
    }

    return html`
      <div class="sc-form-wrapper">
        <div class="sc-editor-pane">
          ${this._renderSaveStatus()}
          <sc-editor
            .core=${this._core}
            .state=${this._state}
            .nav=${this._nav}
            .onSelect=${this._onSelect}
          ></sc-editor>
          <sc-preview .state=${this._state}></sc-preview>
        </div>
        <sc-sidebar
          .state=${this._state}
          .nav=${this._nav}
          .onSelect=${this._onSelect}
        ></sc-sidebar>
      </div>
    `;
  }

  render() {
    if (!this.details) return nothing;

    const { status } = this._context;
    if (status === 'idle' || status === 'loading') {
      return this._renderMessage('', 'Preparing structured content editor...', { showProgress: true });
    }
    if (status === 'blocked') return this._renderBlocked();
    if (status === 'select-schema') return this._renderCentered(this._renderSchemaSelector());
    if (status === 'no-schemas') return this._renderCentered(this._renderNoSchemas());
    if (status === 'ready') return this._renderReady();

    return this._renderMessage('', 'Preparing structured content editor...', { showProgress: true });
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, Form);
}

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
