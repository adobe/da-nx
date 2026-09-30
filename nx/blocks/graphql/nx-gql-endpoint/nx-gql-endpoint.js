import { html, LitElement, nothing } from 'da-lit';
import { loadStyle } from '../../../../nx2/utils/utils.js';
import { showToast, VARIANT_ERROR } from '../../../../nx2/blocks/shared/toast/toast.js';
import {
  createDraft, getSaveBlocker, getSchemaEditorHref, toSavePayload,
} from '../utils/endpoint.js';
import { loadEndpoint, loadSchemas, saveEndpoint } from '../utils/store.js';
import { getSaveState, isDirty, selectSchemas } from './helpers/draft.js';
import { endpointSaved, READ_ONLY } from '../utils/messages.js';
import { inlineAlertStyle, renderInlineAlert } from '../shared/inline-alert/inline-alert.js';
import { renderStatusLight, statusLightStyle } from '../shared/status-light/status-light.js';
import '../nx-gql-header/nx-gql-header.js';
import '../nx-gql-endpoint-editor/nx-gql-endpoint-editor.js';

const [buttonStyle, style] = await Promise.all([
  loadStyle(new URL('../../../../nx2/styles/buttons.css', import.meta.url).href),
  loadStyle(import.meta.url),
]);

const EL_NAME = 'nx-gql-endpoint';

// One endpoint's page; `isNew` starts an unsaved endpoint called `name`.
class Endpoint extends LitElement {
  static properties = {
    site: { attribute: false },
    name: { type: String },
    isNew: { type: Boolean },
    _config: { state: true },
    _draft: { state: true },
    _schemas: { state: true },
    _busy: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [
      buttonStyle, inlineAlertStyle, statusLightStyle, style,
    ];
  }

  get dirty() {
    return isDirty({ draft: this._draft, config: this._config });
  }

  willUpdate(props) {
    if (props.has('site') || props.has('name')) this.load();
    if (props.has('_draft') || props.has('_schemas')) {
      this._preview = this._draft
        ? this._sdl.buildPreview({ draft: this._draft, schemas: this._schemas })
        : undefined;
    }
  }

  navigate(route) {
    this.dispatchEvent(new CustomEvent('route-change', { detail: { route, replace: true } }));
  }

  async confirm(request) {
    await import('../shared/confirm/confirm.js');
    return this.shadowRoot.querySelector('nx-confirm').ask(request);
  }

  async load() {
    const { org, site } = this.site;
    const key = `${org}/${site}/${this.name}`;
    if (key === this._key) return;
    this._key = key;
    this._config = undefined;
    this._draft = undefined;
    const [result, schemas, sdl] = await Promise.all([
      this.isNew ? {} : loadEndpoint({ org, site, name: this.name }),
      loadSchemas({ org, site }),
      import('../utils/sdl.js'),
    ]);
    if (key !== this._key) return;
    this._sdl = sdl;
    this._schemas = schemas;
    if (result.error) {
      showToast({ text: result.error, variant: VARIANT_ERROR });
      this.navigate({ org, site });
      return;
    }
    this._config = result.config;
    this._draft = createDraft({ config: result.config, name: this.name });
  }

  async confirmLeave() {
    if (!this.dirty) return true;
    return this.confirm({
      title: 'Discard unsaved changes?',
      body: html`<p>Your changes to <strong>${this._draft.name}</strong> have not been saved.
        Leaving this page discards them.</p>`,
      confirmLabel: 'Discard',
      negative: true,
    });
  }

  discard() {
    const { org, site } = this.site;
    if (this._draft.isNew) this.navigate({ org, site });
    else this._draft = createDraft({ config: this._config });
  }

  get blocker() {
    return getSaveBlocker({
      draft: this._draft, preview: this._preview, existing: this.site.endpoints,
    });
  }

  async save() {
    const { org, site, canWrite } = this.site;
    const draft = this._draft;
    if (this._busy || !canWrite || this.blocker) return;
    this._busy = true;
    const { config, artifact } = toSavePayload({ draft, preview: this._preview });
    const result = await saveEndpoint({
      org, site, config, artifact,
    });
    this._busy = undefined;
    if (result.error) {
      showToast({ text: result.error, variant: VARIANT_ERROR });
      return;
    }
    if (draft.isNew) {
      const endpoints = [...this.site.endpoints, config.name].sort();
      this.dispatchEvent(new CustomEvent('endpoints-change', { detail: { endpoints } }));
      this.navigate({ org, site, endpoint: config.name });
    }
    this._config = config;
    this._draft = createDraft({ config });
    showToast({ text: endpointSaved(config.name) });
  }

  renderReadOnly() {
    if (this.site.canWrite) return nothing;
    return renderInlineAlert({
      variant: 'informative',
      className: 'read-only',
      heading: READ_ONLY.heading,
      content: html`<p>${READ_ONLY.text}</p>`,
    });
  }

  renderActions() {
    const draft = this._draft;
    if (!draft || !this.site.canWrite) return nothing;
    const { dirty } = this;
    const busy = !!this._busy;
    const { canSave, hint } = getSaveState({
      draft, blocker: this.blocker, dirty, busy,
    });
    return html`
      <div class="save-actions">
        ${hint ? html`<p class="hint">${hint}</p>` : nothing}
        ${dirty && !draft.isNew
    ? renderStatusLight({ variant: 'notice', label: 'Unsaved changes' })
    : nothing}
        <sl-button class="primary outline" ?disabled=${(!dirty && !draft.isNew) || busy}
          @click=${() => this.discard()}>${draft.isNew ? 'Cancel' : 'Discard'}</sl-button>
        <sl-button class="primary" ?disabled=${!canSave}
          @click=${() => this.save()}>${busy ? 'Saving…' : 'Save'}</sl-button>
      </div>`;
  }

  renderEditor() {
    const draft = this._draft;
    if (!draft) {
      return html`
        <div class="loading" role="status">
          <span class="nx-loading-spinner" aria-hidden="true"></span>Loading endpoint…
        </div>`;
    }
    return html`
      <nx-gql-endpoint-editor
        .draft=${draft}
        .schemas=${this._schemas}
        .savedSchemas=${this._config?.schemas}
        .preview=${this._preview}
        schemaEditorHref=${getSchemaEditorHref({ ...this.site, origin: location.origin })}
        ?busy=${!!this._busy}
        ?readOnly=${!this.site.canWrite}
        @schemas-select=${({ detail }) => { this._draft = selectSchemas({ draft, ...detail }); }}>
      </nx-gql-endpoint-editor>`;
  }

  render() {
    const { org, site } = this.site;
    return html`
      <nx-gql-header org=${org} site=${site} endpoint=${this.name}
        @change-site=${() => this.dispatchEvent(new Event('change-site'))}>
        ${this.renderActions()}
      </nx-gql-header>
      ${this.renderReadOnly()}
      ${this.renderEditor()}
      <nx-confirm></nx-confirm>`;
  }
}

customElements.define(EL_NAME, Endpoint);
