import { LitElement, html, nothing } from 'da-lit';
import getPathDetails from 'https://da.live/blocks/shared/pathDetails.js';

import 'https://da.live/blocks/edit/da-title/da-title.js';

import { createCore } from './core/index.js';
import { loadFormContext } from './app/context.js';
import { saveSourceHtml } from './app/da-api.js';
import { serialize } from './app/serialize.js';

import './views/editor.js';
import './views/sidebar.js';
import './views/preview.js';

const { default: getStyle } = await import('../../utils/styles.js');
const style = await getStyle(import.meta.url);

const SL_COMPONENTS_MODULE = '../../public/sl/components.js';

const EL_NAME = 'nx-form';
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

  // Reactive state: `_context`, `_state`, and `_nav` are deliberately left
  // undefined until `_loadContext` populates them — per AGENTS.md, undefined
  // means "not loaded yet" and lets render() use simple presence checks.
  // `_pendingSchemaId` and `_loadVersion` carry counters/string state, so
  // they keep explicit defaults.
  _pendingSchemaId = '';

  _loadVersion = 0;

  _core = null;

  _onChange = () => {
    if (!this._core) return;
    this._state = this._core.getState();
  };

  _onSelect = (pointer, origin = null) => {
    if (!pointer) return;
    this._nav = {
      pointer,
      origin,
      seq: (this._nav?.seq ?? 0) + 1,
    };
  };

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

    if (context.status === 'select-schema' || context.status === 'no-schemas') {
      await import(SL_COMPONENTS_MODULE);
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
    const schema = this._context?.schemas?.[schemaName];
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
      <div class="nx-form-wrapper nx-form-wrapper-centered">
        ${content}
      </div>
    `;
  }

  _renderMessage(title, body, { showHomeAction = false } = {}) {
    return this._renderCentered(html`
      <div class="nx-form-schema-shell">
        <section class="nx-form-message">
          ${title ? html`<h2>${title}</h2>` : nothing}
          <p>${body}</p>
          ${showHomeAction ? html`
            <div class="nx-form-actions">
              <button
                type="button"
                class="nx-form-button"
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

    let title = 'Unable to open';
    let body = html`This resource could not be opened.`;

    if (blocker.type === 'missing-schema') {
      const schemaName = blocker.schemaName || '(empty)';
      title = 'Schema not found';
      body = html`
        No schema named <strong>${schemaName}</strong>.
        <a
          class="nx-form-schema-text-link"
          href=${schemaEditorHref}
          target="_blank"
          rel="noopener noreferrer"
        >Open Schema Editor</a>
      `;
    } else if (blocker.type === 'not-document' || blocker.type === 'not-form-content') {
      title = 'Unsupported resource';
      body = html`
        This resource${displayPath ? html` at <strong>${displayPath}</strong>` : nothing}
        is not Structured Content.
      `;
    } else if (blocker.type === 'no-access') {
      title = 'Access denied';
      body = html`
        You do not have access to this resource${displayPath ? html` at <strong>${displayPath}</strong>` : nothing}.
      `;
    } else if (blocker.type === 'load-failed') {
      title = 'Unable to load';
      body = html`This resource could not be loaded. Try again later.`;
    }

    return this._renderMessage(title, body);
  }

  _renderSchemaSelector() {
    const schemas = this._context?.schemas ?? {};
    const schemaEditorHref = this._schemaEditorHref();

    return html`
      <div class="nx-form-schema-shell">
        <h2 class="nx-form-schema-heading">Choose a schema</h2>
        <div class="nx-form-schema-form">
          <sl-select
            hoist
            class="nx-form-schema-select"
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
          <p class="nx-form-schema-hint nx-form-schema-selector-hint">
            To create a new schema, open
            <a
              class="nx-form-schema-text-link"
              href=${schemaEditorHref}
              target="_blank"
              rel="noopener noreferrer"
            >Schema Editor</a>.
          </p>
          <sl-button
            class="nx-form-schema-start"
            ?disabled=${!this._pendingSchemaId}
            @click=${this._applySelectedSchema}
          >Create</sl-button>
        </div>
      </div>
    `;
  }

  _renderNoSchemas() {
    return html`
      <div class="nx-form-schema-shell">
        <div class="nx-form-schema-card">
          <p class="nx-form-title">Please create a schema</p>
          <p class="nx-form-schema-hint">
            This project has no schemas yet. Open the schema editor to add one, then return here.
          </p>
          <div class="nx-form-schema-field nx-form-schema-field-link">
            <a
              class="nx-form-schema-cta"
              href=${this._schemaEditorHref()}
              target="_blank"
              rel="noopener noreferrer"
            >Open Schema Editor</a>
          </div>
        </div>
      </div>
    `;
  }

  _renderReady() {
    // Transient: context is ready but the core has not finished loading yet.
    // Render nothing rather than a half-second flash of a loading message;
    // in a warm-cache session it would just be visual noise + CLS.
    if (!this._state) return nothing;

    const root = this._state?.model?.root;
    if (!root) {
      return this._renderMessage(
        'Unavailable',
        'Structured content is unavailable for this document.',
        { showHomeAction: true },
      );
    }

    return html`
      <div class="nx-form-wrapper">
        <div class="nx-editor-pane">
          <nx-editor
            .core=${this._core}
            .state=${this._state}
            .nav=${this._nav}
            .onSelect=${this._onSelect}
          ></nx-editor>
          <nx-preview .state=${this._state}></nx-preview>
        </div>
        <nx-sidebar
          .state=${this._state}
          .nav=${this._nav}
          .onSelect=${this._onSelect}
        ></nx-sidebar>
      </div>
    `;
  }

  render() {
    if (!this.details) return nothing;

    const { status } = this._context ?? {};
    // Render nothing on the transient "loading" / unknown states — see the
    // comment in _renderReady. The fast paths (cached) would flash a message
    // for half a second and produce CLS; the slow paths still show one of
    // the explicit branches below.
    if (!status || status === 'loading') return nothing;
    if (status === 'blocked') return this._renderBlocked();
    if (status === 'select-schema') return this._renderCentered(this._renderSchemaSelector());
    if (status === 'no-schemas') return this._renderCentered(this._renderNoSchemas());
    if (status === 'ready') return this._renderReady();

    return nothing;
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
