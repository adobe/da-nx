import { html, LitElement, nothing } from 'da-lit';
import { loadStyle } from '../../../../nx2/utils/utils.js';
import { NO_SCHEMAS_MESSAGE } from '../utils/endpoint.js';
import { describeProblem } from '../utils/messages.js';
import { getSchemaOptions } from '../nx-gql-schema-picker/helpers/options.js';
import { inlineAlertStyle, renderInlineAlert } from '../shared/inline-alert/inline-alert.js';
import '../nx-gql-schema-picker/nx-gql-schema-picker.js';

const style = await loadStyle(import.meta.url);

const EL_NAME = 'nx-gql-endpoint-editor';

const TABS = [
  { id: 'schemas', label: 'Schemas' },
  { id: 'graphql', label: 'GraphQL SDL' },
];

const endpointKey = (draft) => (draft?.isNew ? '' : draft?.name);

class EndpointEditor extends LitElement {
  static properties = {
    draft: { attribute: false },
    schemas: { attribute: false },
    savedSchemas: { attribute: false },
    preview: { attribute: false },
    schemaEditorHref: { type: String },
    busy: { type: Boolean },
    readOnly: { type: Boolean },
    _tab: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [inlineAlertStyle, style];
  }

  get tab() {
    return this._tab ?? 'schemas';
  }

  // Opening another endpoint starts at Schemas; saving a new one keeps the tab.
  willUpdate(props) {
    if (props.has('draft')) {
      const prev = props.get('draft');
      const saved = prev?.isNew && this.draft?.isNew === false && prev.name === this.draft.name;
      if (!saved && endpointKey(prev) !== endpointKey(this.draft)) this._tab = undefined;
    }
    if (!['draft', 'schemas', 'savedSchemas'].some((prop) => props.has(prop))) return;
    this._options = this.draft
      ? getSchemaOptions({ draft: this.draft, schemas: this.schemas, saved: this.savedSchemas })
      : undefined;
  }

  forward({ type, detail }) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  selectTab(id) {
    if (id === 'graphql') import('../nx-gql-sdl-preview/nx-gql-sdl-preview.js');
    this._tab = id;
  }

  renderTabs() {
    return html`
      <div class="tab-bar">
        <div class="tabs" role="tablist">
          ${TABS.map(({ id, label }) => html`
            <button type="button" role="tab" id="tab-${id}" aria-controls="panel"
              aria-selected=${this.tab === id ? 'true' : 'false'}
              @click=${() => this.selectTab(id)}>
              ${label}
            </button>`)}
        </div>
      </div>`;
  }

  renderNoSchemas() {
    if (this.readOnly || this.draft.schemas.length || !this._options.length) return nothing;
    return renderInlineAlert({
      variant: 'informative',
      className: 'no-schemas',
      heading: NO_SCHEMAS_MESSAGE,
    });
  }

  renderSchemas() {
    return html`
      ${this.renderNoSchemas()}
      <nx-gql-schema-picker .options=${this._options} ?busy=${this.busy || this.readOnly}
        schemaEditorHref=${this.schemaEditorHref ?? nothing}
        @schemas-select=${this.forward}></nx-gql-schema-picker>`;
  }

  renderProblems() {
    const errors = this.preview?.errors ?? [];
    if (!errors.length) return nothing;
    return renderInlineAlert({
      variant: 'negative',
      className: 'error',
      role: 'alert',
      heading: 'The GraphQL schema cannot be generated',
      content: html`<ul>${errors.map((error) => html`<li>${describeProblem(error)}</li>`)}</ul>`,
    });
  }

  renderGraphqlEmpty() {
    return html`
      <div class="graphql-empty">
        <p class="graphql-empty-title">No schemas selected</p>
        <p>Select at least one Structured Content schema to generate the GraphQL schema.</p>
        <sl-button class="primary outline" @click=${() => { this._tab = 'schemas'; }}>
          Select schemas</sl-button>
      </div>`;
  }

  renderGraphql() {
    if (!this.draft.schemas.length) return this.renderGraphqlEmpty();
    return html`
      <div class="panel-header">
        <p class="panel-intro">A read-only preview of the GraphQL schema generated from the
          Structured Content schemas selected for this endpoint. It reflects the current
          selection, including unsaved changes.</p>
      </div>
      <nx-gql-sdl-preview .sdl=${this.preview?.sdl}>${this.renderProblems()}</nx-gql-sdl-preview>`;
  }

  renderPanel() {
    if (this.tab === 'graphql') return this.renderGraphql();
    return this.renderSchemas();
  }

  render() {
    const { draft } = this;
    if (!draft) return nothing;
    return html`
      ${this.renderTabs()}
      <div class="panel ${this.tab}" id="panel" role="tabpanel" aria-labelledby="tab-${this.tab}">
        ${this.renderPanel()}
      </div>
    `;
  }
}

customElements.define(EL_NAME, EndpointEditor);
