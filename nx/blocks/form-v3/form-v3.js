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

const EL_NAME = 'sc-form-shell';
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

  async _startApp({ schema, json }) {
    this._disposeApp();

    this._app = createFormApp({
      path: this.details?.fullpath,
      schema,
      document: json,
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
        json: context.json,
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

    const json = {
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
      json,
    };

    await this._startApp({
      schema,
      json,
    });
  }

  _handleIntent(e) {
    const detail = e?.detail ?? {};
    if (!detail.type) return;
    const snapshot = this._app?.controller?.handleUiIntent?.(detail);
    if (!snapshot) return;
    this._state = snapshot;
    this.requestUpdate();
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

  _renderLoaderMessage(title, body, { showHomeAction = false, showProgress = false } = {}) {
    return this._renderSchemaSetupState(html`
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
                @click=${() => this._goToRepoRoot()}
              >Return to Home</button>
            </div>
          ` : nothing}
        </section>
      </div>
    `);
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
      <p class="sc-form-schema-hint">
        This resource could not be opened.
      </p>
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
        <p class="sc-form-schema-hint">
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
      <div class="sc-form-wrapper sc-form-wrapper-centered">
        ${content}
      </div>
    `;
  }

  _toViewContext() {
    const errorsMap = new Map(Object.entries(this._state?.validation?.errorsByPointer ?? {}));
    const navigation = this._state?.ui?.navigation ?? {};
    return {
      runtime: {
        root: this._state?.model?.formModel,
      },
      validation: {
        errorsByPointer: errorsMap,
      },
      activeNavPointer: navigation.activePointer,
      activeNavOrigin: navigation.selectionOrigin ?? null,
      activeNavSequence: navigation.selectionSequence ?? 0,
      json: this._state?.document?.values,
    };
  }

  _renderReadyState() {
    if (!this._state) {
      return this._renderLoaderMessage(
        '',
        'Preparing structured content editor...',
        { showProgress: true },
      );
    }

    const context = this._toViewContext();
    if (!context.runtime.root) {
      return this._renderLoaderMessage(
        'Unavailable',
        'Structured content is unavailable for this document.',
        { showHomeAction: true },
      );
    }

    return html`
      <div class="sc-form-wrapper" @form-intent=${this._handleIntent}>
        <div class="sc-form-editor">
          <sc-form-editor .context=${context}></sc-form-editor>
          <sc-form-preview .context=${context}></sc-form-preview>
        </div>
        <sc-form-sidebar .context=${context}></sc-form-sidebar>
      </div>
    `;
  }

  render() {
    if (!this.details) return nothing;

    const { status } = this._contextState;
    if (status === 'idle' || status === 'loading') {
      return this._renderLoaderMessage(
        '',
        'Preparing structured content editor...',
        { showProgress: true },
      );
    }
    if (status === 'blocked') return this._renderBlockedState();
    if (status === 'select-schema') return this._renderSchemaSetupState(this._renderSchemaSelector());
    if (status === 'no-schemas') return this._renderSchemaSetupState(this._renderNoSchemas());
    if (status === 'ready') return this._renderReadyState();

    return this._renderLoaderMessage('', 'Preparing structured content editor...', { showProgress: true });
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
