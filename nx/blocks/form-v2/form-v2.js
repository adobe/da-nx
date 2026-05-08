import { LitElement, html, nothing } from 'da-lit';
import getPathDetails from 'https://da.live/blocks/shared/pathDetails.js';

import 'https://da.live/blocks/edit/da-title/da-title.js';
import 'https://da.live/blocks/shared/da-dialog/da-dialog.js';

import { buildRuntimeContext, loadFormContext } from './controllers/async-loader.controller.js';
import { createFormEditorController } from './editor/form-editor-controller.js';
import { getDisplayPath } from './services/loader/document-resource.js';
import './views/editor.js';
import './views/sidebar.js';
import './views/preview.js';

await import('../../public/sl/components.js');

const { default: getStyle } = await import('../../utils/styles.js');
const style = await getStyle(new URL('./form.css', import.meta.url).href);

const EL_NAME = 'da-sc-form';
const PREVIEW_PREFIX = 'https://da-sc.adobeaem.workers.dev/preview';
const LIVE_PREFIX = 'https://da-sc.adobeaem.workers.dev/live';

class StructuredContentForm extends LitElement {
  static properties = {
    details: { attribute: false },
    _loaderState: { state: true },
    _pendingSchemaId: { state: true },
  };

  constructor() {
    super();
    this._loaderState = { status: 'idle' };
    this._pendingSchemaId = '';
    this._loadVersion = 0;
    this._controllerUnsubscribe = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  disconnectedCallback() {
    this._disconnectController();
    super.disconnectedCallback();
  }

  updated(changed) {
    if (changed.has('details') && this.details) {
      this._loadContext();
    }
  }

  async _loadContext() {
    this._loadVersion += 1;
    const requestVersion = this._loadVersion;
    this._loaderState = { status: 'loading' };
    this._pendingSchemaId = '';

    const result = await loadFormContext({ details: this.details });
    if (requestVersion !== this._loadVersion) return;

    if (result.status === 'ready') {
      this._setReadyState(result);
      return;
    }

    this._disconnectController();
    this._loaderState = result;
  }

  _disconnectController() {
    this._loaderState?.controller?.dispose?.();
    if (!this._controllerUnsubscribe) return;
    this._controllerUnsubscribe();
    this._controllerUnsubscribe = null;
  }

  _setReadyState(readyState) {
    this._disconnectController();

    const controller = createFormEditorController({
      formStore: readyState.formStore,
      selectionStore: readyState.selectionStore,
      savingStore: readyState.savingStore,
      path: this.details?.fullpath,
    });

    this._controllerUnsubscribe = controller.subscribe((snapshot) => {
      this._loaderState = {
        ...this._loaderState,
        ...snapshot,
        controller,
      };
    });

    const snapshot = controller.getSnapshot();
    this._loaderState = {
      ...readyState,
      ...snapshot,
      controller,
      status: 'ready',
    };
  }

  _onPendingSchemaChange(e) {
    this._pendingSchemaId = e.currentTarget?.value ?? '';
  }

  _applySelectedSchema() {
    const schemaName = this._pendingSchemaId;
    const schema = this._loaderState.schemas?.[schemaName];
    if (!schema || !schemaName) return;

    const title = this.details?.name ?? '';
    const json = {
      metadata: { title, schemaName },
      data: {},
    };

    const runtimeContext = buildRuntimeContext({ schema, json });
    if (!runtimeContext) {
      this._loaderState = {
        ...this._loaderState,
        status: 'blocked',
        blocker: { type: 'unsupported-schema' },
        schemaName,
        schema,
        json,
      };
      return;
    }

    this._loaderState = {
      ...this._loaderState,
      ...runtimeContext,
      status: 'ready',
      schemaName,
      json: runtimeContext.runtime.json,
    };

    this._setReadyState(this._loaderState);
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

  _renderResourcePathSuffix(displayPath) {
    return displayPath ? html` at <strong>${displayPath}</strong>` : nothing;
  }

  _renderLoaderMessage(title, body, { showHomeAction = false } = {}) {
    return html`
      <section class="da-sc-form-message">
        <h2>${title}</h2>
        <p>${body}</p>
        ${showHomeAction ? html`
          <div class="da-sc-form-actions">
            <button
              type="button"
              class="da-sc-form-button"
              @click=${() => this._goToRepoRoot()}
            >Return to Home</button>
          </div>
        ` : nothing}
      </section>
    `;
  }

  _renderBlockedState() {
    const blocker = this._loaderState.blocker ?? {};
    const displayPath = getDisplayPath(this.details);
    const schemaEditorHref = this._getSchemaEditorHref();
    const action = {
      label: 'Return to Home',
      style: '',
      click: () => this._goToRepoRoot(),
    };

    let title = 'Unable to open';
    let body = html`
      <p class="da-form-schema-hint">
        This resource could not be opened.
      </p>
    `;

    if (blocker.type === 'missing-schema') {
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
    } else if (blocker.type === 'not-document' || blocker.type === 'not-form-content') {
      title = 'Unsupported resource';
      body = html`
        <p class="da-form-schema-hint">
          This resource${this._renderResourcePathSuffix(displayPath)} is not Structured Content.
        </p>
      `;
    } else if (blocker.type === 'no-access') {
      title = 'Access denied';
      body = html`
        <p class="da-form-schema-hint">
          You do not have access to this resource${this._renderResourcePathSuffix(displayPath)}.
        </p>
      `;
    } else if (blocker.type === 'unsupported-schema') {
      title = 'Unsupported schema';
      body = html`
        <p class="da-form-schema-hint">
          This schema uses features not yet supported by form-v2.
        </p>
      `;
    } else if (blocker.type === 'load-failed') {
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

  _renderSchemaSelector() {
    const schemas = this._loaderState.schemas ?? {};
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
            ${Object.entries(schemas).map(([id, schema]) => html`
              <option value="${id}">${schema?.title ?? id}</option>
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
            @click=${this._applySelectedSchema}
          >Create</sl-button>
        </div>
      </div>
    `;
  }

  _renderNoSchemas() {
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

  _renderSchemaSetupState(content) {
    return html`
      <div class="da-form-wrapper da-form-wrapper-centered">
        ${content}
      </div>
    `;
  }

  _renderReadyState() {
    return html`
      <div class="da-form-wrapper" @form-intent=${this._handleFormIntent}>
        <div class="da-form-editor">
          <da-sc-form-editor
            .context=${this._loaderState}
            .controller=${this._loaderState.controller}
          ></da-sc-form-editor>
          <da-sc-form-preview .context=${this._loaderState}></da-sc-form-preview>
        </div>
        <da-sc-form-sidebar .context=${this._loaderState}></da-sc-form-sidebar>
      </div>
    `;
  }

  async _handleFormIntent(e) {
    const detail = e?.detail ?? {};
    if (!detail.type) return;

    await this._loaderState?.controller?.handleIntent(detail);
  }

  render() {
    if (!this.details) return nothing;

    const { status } = this._loaderState;

    if (status === 'idle' || status === 'loading') {
      return this._renderLoaderMessage('Loading', 'Preparing structured content editor...');
    }
    if (status === 'blocked') return this._renderBlockedState();
    if (status === 'select-schema') return this._renderSchemaSetupState(this._renderSchemaSelector());
    if (status === 'no-schemas') return this._renderSchemaSetupState(this._renderNoSchemas());
    if (status === 'ready') return this._renderReadyState();

    return this._renderLoaderMessage('Loading', 'Preparing structured content editor...');
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, StructuredContentForm);
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
