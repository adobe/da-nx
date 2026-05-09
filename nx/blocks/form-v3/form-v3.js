import { LitElement, html, nothing } from 'da-lit';
import getPathDetails from 'https://da.live/blocks/shared/pathDetails.js';

import 'https://da.live/blocks/edit/da-title/da-title.js';
import 'https://da.live/blocks/shared/da-dialog/da-dialog.js';

import { createFormApp } from './app/bootstrap.js';
import { loadFormContext } from './app/context-loader.js';

import './ui-lit/components/editor.js';
import './ui-lit/components/sidebar.js';
import './ui-lit/components/preview.js';

await import('../../public/sl/components.js');

const { default: getStyle } = await import('../../utils/styles.js');
const style = await getStyle(new URL('./ui-lit/components/form-shell.css', import.meta.url).href);

const EL_NAME = 'da-sc-form-shell';
const PREVIEW_PREFIX = 'https://da-sc.adobeaem.workers.dev/preview';
const LIVE_PREFIX = 'https://da-sc.adobeaem.workers.dev/live';

export { createFormApp };

class StructuredContentForm extends LitElement {
  static properties = {
    details: { attribute: false },
    _contextState: { state: true },
    _state: { state: true },
    _pendingSchemaId: { state: true },
  };

  constructor() {
    super();
    this._contextState = { status: 'idle', schemas: {} };
    this._state = null;
    this._pendingSchemaId = '';
    this._loadVersion = 0;
    this._app = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  disconnectedCallback() {
    this._disposeApp();
    super.disconnectedCallback();
  }

  updated(changed) {
    if (changed.has('details') && this.details) {
      this._loadContext();
    }
  }

  _disposeApp() {
    this._app?.destroy?.();
    this._app = null;
  }

  async _startApp({ schema, document, permissions }) {
    this._disposeApp();

    this._app = createFormApp({
      path: this.details?.fullpath,
      schema,
      document,
      permissions,
      onState: (snapshot) => {
        this._state = snapshot;
        this.requestUpdate();
      },
    });

    this._state = await this._app.load();
  }

  async _loadContext() {
    this._loadVersion += 1;
    const requestVersion = this._loadVersion;
    this._pendingSchemaId = '';
    this._state = null;
    this._contextState = { status: 'loading', schemas: {} };
    this._disposeApp();

    const context = await loadFormContext({ details: this.details });
    if (requestVersion !== this._loadVersion) return;
    this._contextState = context;

    if (context.status === 'ready') {
      await this._startApp({
        schema: context.schema,
        document: context.document,
        permissions: { canEdit: true },
      });
    }
  }

  _onPendingSchemaChange(e) {
    this._pendingSchemaId = e.currentTarget?.value ?? '';
  }

  async _applySelectedSchema() {
    const schemaName = this._pendingSchemaId;
    const schema = this._contextState.schemas?.[schemaName];
    if (!schema || !schemaName) return;

    const document = {
      metadata: {
        title: this.details?.name ?? '',
        schemaName,
      },
      data: {},
    };

    this._contextState = {
      ...this._contextState,
      status: 'ready',
      schemaName,
      schema,
      document,
    };

    await this._startApp({
      schema,
      document,
      permissions: { canEdit: true },
    });
  }

  async _handleIntent(e) {
    const detail = e?.detail ?? {};
    if (!detail.type) return;
    await this._app?.controller?.handleIntent?.(detail);
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
    const { blocker = {}, displayPath } = this._contextState ?? {};
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
          This resource${displayPath ? html` at <strong>${displayPath}</strong>` : nothing}
          is not Structured Content.
        </p>
      `;
    } else if (blocker.type === 'no-access') {
      title = 'Access denied';
      body = html`
        <p class="da-form-schema-hint">
          You do not have access to this resource${displayPath ? html` at <strong>${displayPath}</strong>` : nothing}.
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
    const schemas = this._contextState.schemas ?? {};
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

  _toViewContext() {
    const errorsMap = new Map(Object.entries(this._state?.errorsByPointer ?? {}));
    return {
      runtime: {
        root: this._state?.formModel,
      },
      validation: {
        errorsByPointer: errorsMap,
      },
      activeNavPointer: this._state?.selection?.activePointer,
      activeNavOrigin: this._state?.selection?.origin ?? null,
      json: this._state?.values,
    };
  }

  _renderReadyState() {
    if (!this._state) {
      return this._renderLoaderMessage('Loading', 'Preparing structured content editor...');
    }

    const context = this._toViewContext();
    const stateCode = this._state?.status?.code ?? 'ready';
    const saveState = this._state?.saving?.status ?? 'idle';

    if (!context.runtime.root) {
      return this._renderLoaderMessage(
        'Unavailable',
        `Current state: ${stateCode}.`,
        { showHomeAction: true },
      );
    }

    return html`
      <div class="da-form-wrapper" @form-intent=${this._handleIntent}>
        <div class="da-form-editor">
          <p class="da-form-runtime-status" data-state=${stateCode}>
            State: ${stateCode} | Save: ${saveState}
          </p>
          <da-sc-form-editor .context=${context}></da-sc-form-editor>
          <da-sc-form-preview .context=${context}></da-sc-form-preview>
        </div>
        <da-sc-form-sidebar .context=${context}></da-sc-form-sidebar>
      </div>
    `;
  }

  render() {
    if (!this.details) return nothing;

    const { status } = this._contextState;
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
