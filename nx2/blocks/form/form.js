import { LitElement, html, nothing } from 'da-lit';

import { createEngine } from '../../deps/da-sc-sdk/dist/index.js';
import { loadFormContext } from './utils/context.js';
import { attachPersistence } from './utils/persistence.js';
import { loadStyle, hashChange } from '../../utils/utils.js';

import './views/editor.js';
import './views/sidebar.js';
import './views/preview.js';
// Fields the shell renders directly (schema selector + messages); the editor
// imports the rest.
import './fields/picker.js';
import './fields/button.js';

const style = await loadStyle(import.meta.url);

const EL_NAME = 'nx-form';

// Derive the legacy `details` shape the form utils expect from the EW-supplied
// `ctx`. `ctx.path` is the full `org/site/path` locator; the DA source is the
// `.html` document at that path.
function detailsFromCtx(ctx) {
  if (!ctx?.org || !ctx?.repo || !ctx?.path) return null;
  const raw = `/${String(ctx.path).replace(/^\/+/, '')}`;
  const fullpath = raw.toLowerCase().endsWith('.html') ? raw : `${raw}.html`;
  const name = fullpath.slice(fullpath.lastIndexOf('/') + 1, -'.html'.length);
  return {
    owner: ctx.org,
    repo: ctx.repo,
    name,
    fullpath,
    sourceUrl: fullpath,
  };
}

// hashChange emits `{ org, site, path, fullpath }`; the element wants
// `ctx = { org, repo, path }` with `path` as the full `org/site/path` locator.
function ctxFromHashState(state) {
  if (!state?.org || !state?.site || !state?.path) return null;
  return { org: state.org, repo: state.site, path: state.fullpath.slice(1) };
}

class Form extends LitElement {
  static properties = {
    ctx: { attribute: false },
    _context: { state: true },
    _state: { state: true },
    _nav: { state: true },
    _pendingSchemaId: { state: true },
  };

  // Reactive properties (declared in static properties) must NOT have class-
  // field initializers — they would shadow Lit's reactive setter. See
  // https://lit.dev/docs/components/properties/#avoiding-issues-with-class-fields
  _loadVersion = 0;

  _details = null;

  _editor = null;

  _persistence = null;

  _unsubscribe = null;

  _onChange = () => {
    if (!this._editor) return;
    this._state = this._editor.getState();
    // The editor has a single onChange slot — used here for Lit reactivity.
    // Forward the notification to the persistence so it can save when the
    // document has actually changed (it filters non-mutation transitions).
    this._persistence?.notify();
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

  disconnectedCallback() {
    this._unsubscribe?.();
    this._unsubscribe = null;
    this._persistence?.detach();
    this._persistence = null;
    super.disconnectedCallback();
  }

  // Standalone (nx2-served) routing: subscribe the element's own ctx to the
  // hash. The EW host pushes `ctx` directly instead and never calls this.
  startRouting() {
    this._unsubscribe?.();
    this._unsubscribe = hashChange.subscribe((state) => {
      const ctx = ctxFromHashState(state);
      if (ctx) this.ctx = ctx;
    });
  }

  updated(changed) {
    if (changed.has('ctx')) {
      this._loadContext();
    }
  }

  _start({ schema, json }) {
    this._editor = createEngine({ schema, document: json, onChange: this._onChange });
    this._state = this._editor.getState();
    // Attach AFTER load so the loaded document is the persistence's baseline —
    // mutations after this point trigger saves; the load itself does not.
    this._persistence = attachPersistence(this._editor, { path: this._details?.fullpath });
    this._nav = { pointer: '/data', origin: null, seq: 0 };
  }

  async _loadContext() {
    this._loadVersion += 1;
    const version = this._loadVersion;
    this._pendingSchemaId = '';
    this._state = null;
    this._editor = null;
    this._persistence?.detach();
    this._persistence = null;
    this._details = detailsFromCtx(this.ctx);

    if (!this._details) {
      this._context = undefined;
      return;
    }

    this._context = { status: 'loading', schemas: {} };

    const context = await loadFormContext({ details: this._details });
    if (version !== this._loadVersion) return;

    this._context = context;

    if (context.status === 'ready') {
      this._start({ schema: context.schema, json: context.json });
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
        title: this._details?.name ?? '',
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

    this._start({ schema, json });
  }

  // TODO(EW): cross-app nav to the da.live schema editor. Revisit if EW should
  // own schema authoring rather than linking out.
  _schemaEditorHref() {
    const { owner, repo } = this._details ?? {};
    if (!owner || !repo) return 'https://da.live/apps/schema';
    return `https://da.live/apps/schema#/${owner}/${repo}`;
  }

  // TODO(EW): cross-app nav back to the da.live home. Revisit if EW should
  // provide its own "home" target.
  _goHome() {
    const { owner, repo } = this._details ?? {};
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
              <sl-button
                variant="secondary"
                @click=${() => this._goHome()}
              >Return to Home</sl-button>
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
          <sl-picker
            hoist
            class="nx-form-schema-select"
            label="Schema"
            placeholder="Select a schema"
            .value=${this._pendingSchemaId ?? ''}
            @change=${this._onPendingSchemaChange}
          >
            <option value="">Select a schema</option>
            ${Object.entries(schemas).map(([id, schema]) => html`
              <option value="${id}">${schema?.title ?? id}</option>
            `)}
            <p slot="description">
              To create a new schema, open
              <a
                class="nx-form-schema-text-link"
                href=${schemaEditorHref}
                target="_blank"
                rel="noopener noreferrer"
              >Schema Editor</a>.
            </p>
          </sl-picker>
          <sl-button
            variant="accent"
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
            .editor=${this._editor}
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
    if (!this.ctx) return nothing;

    const { status } = this._context ?? {};
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

// Block entry: EW surfaces the form via an `nx-form` content block, which NX
// loads as `nx2/blocks/form/form.js` and invokes with the block element. We
// mount the ctx-driven element and feed it the hash, mirroring how canvas.js
// drives ew-editor-doc.
export default function decorate(block) {
  const nxForm = document.createElement(EL_NAME);
  block.append(nxForm);
  nxForm.startRouting();
}
