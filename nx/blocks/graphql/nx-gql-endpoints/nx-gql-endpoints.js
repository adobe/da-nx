import { html, LitElement, nothing } from 'da-lit';
import { loadStyle } from '../../../../nx2/utils/utils.js';
import { endpointDeleted, READ_ONLY } from '../utils/messages.js';
import {
  ENDPOINT_NAME_MAX_LENGTH, ENDPOINT_NAME_MIN_LENGTH, getDeliveryPath, validateEndpointName,
} from '../utils/endpoint.js';
import { deleteEndpoint } from '../utils/store.js';
import { showToast, VARIANT_ERROR } from '../../../../nx2/blocks/shared/toast/toast.js';
import { inlineAlertStyle, renderInlineAlert } from '../shared/inline-alert/inline-alert.js';
import '../nx-gql-header/nx-gql-header.js';
import '../nx-gql-endpoint-list/nx-gql-endpoint-list.js';

const [formStyle, style] = await Promise.all([
  loadStyle(new URL('../../../../nx2/styles/form.css', import.meta.url).href),
  loadStyle(import.meta.url),
]);

const EL_NAME = 'nx-gql-endpoints';

const NAME_HINT = `Use ${ENDPOINT_NAME_MIN_LENGTH}–${ENDPOINT_NAME_MAX_LENGTH} lowercase letters, `
  + 'numbers, or hyphens, starting with a letter.';

// The endpoint list page. `site` is { org, site, endpoints, canWrite }.
class Endpoints extends LitElement {
  static properties = {
    site: { attribute: false },
    _busy: { state: true },
    _newName: { state: true },
    _nameError: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [formStyle, inlineAlertStyle, style];
  }

  async handleDelete(name) {
    if (this._busy || !this.site.canWrite) return;
    await import('../shared/confirm/confirm.js');
    const confirmed = await this.shadowRoot.querySelector('nx-confirm').ask({
      title: 'Delete endpoint?',
      body: html`<p>The <strong>${name}</strong> endpoint and its GraphQL schema will be
        permanently deleted. Client applications that query
        <strong>${getDeliveryPath({ name })}</strong> will no longer be able to retrieve
        content.</p>`,
      confirmLabel: 'Delete',
      negative: true,
    });
    if (!confirmed || this._busy) return;
    this._busy = true;
    const { org, site } = this.site;
    const result = await deleteEndpoint({ org, site, name });
    this._busy = undefined;
    if (result.error) {
      showToast({ text: result.error, variant: VARIANT_ERROR });
      return;
    }
    const endpoints = this.site.endpoints.filter((endpoint) => endpoint !== name);
    this.dispatchEvent(new CustomEvent('endpoints-change', { detail: { endpoints } }));
    showToast({ text: endpointDeleted(name) });
  }

  async handleAdd() {
    await import('../../../../nx2/blocks/shared/dialog/dialog.js');
    this._newName = '';
    this._nameError = undefined;
  }

  handleName({ target }) {
    this._newName = target.value;
    this._nameError = undefined;
  }

  // Confirming only starts an unsaved endpoint page.
  handleCreate(event) {
    event?.preventDefault();
    const name = this._newName;
    this._nameError = validateEndpointName({ name, existing: this.site.endpoints });
    if (this._nameError) {
      this.shadowRoot.querySelector('input[name="name"]')?.focus();
      return;
    }
    this._newName = undefined;
    const { org, site } = this.site;
    const detail = { route: { org, site, endpoint: name }, isNew: true };
    this.dispatchEvent(new CustomEvent('route-change', { detail }));
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

  renderCreateDialog() {
    if (this._newName === undefined) return nothing;
    const error = this._nameError;
    return html`
      <nx-dialog class="create-dialog" title="New endpoint"
        @close=${() => { this._newName = undefined; }}>
        <form @submit=${this.handleCreate}>
          <div class="nx-form-field ${error ? 'nx-field-error' : ''}">
            <label for="endpoint-name">Name</label>
            <input id="endpoint-name" class="nx-input" type="text" name="name"
              placeholder="endpoint name" autofocus
              required minlength=${ENDPOINT_NAME_MIN_LENGTH} maxlength=${ENDPOINT_NAME_MAX_LENGTH}
              autocomplete="off" spellcheck="false"
              aria-invalid=${error ? 'true' : 'false'} aria-describedby="endpoint-name-help"
              .value=${this._newName} @input=${this.handleName} />
            <p id="endpoint-name-help" class=${error ? 'nx-input-error-msg' : 'field-hint'}
              role=${error ? 'alert' : nothing}>${error ?? NAME_HINT}</p>
          </div>
          <button type="submit" hidden></button>
        </form>
        <button type="button" slot="actions" class="nx-form-btn-secondary"
          @click=${() => this.shadowRoot.querySelector('nx-dialog')?.close()}>Cancel</button>
        <button type="button" slot="actions" class="nx-form-btn-primary"
          @click=${() => this.handleCreate()}>Continue</button>
      </nx-dialog>`;
  }

  render() {
    const {
      org, site, endpoints, canWrite,
    } = this.site;
    const busy = !!this._busy;
    return html`
      <nx-gql-header org=${org} site=${site} addable ?addDisabled=${busy || !canWrite}
        @endpoint-add=${this.handleAdd}
        @change-site=${() => this.dispatchEvent(new Event('change-site'))}></nx-gql-header>
      <p class="intro">Manage GraphQL endpoints for the Structured Content delivery API.</p>
      ${this.renderReadOnly()}
      <nx-gql-endpoint-list
        org=${org}
        site=${site}
        .endpoints=${endpoints}
        ?busy=${busy}
        ?readOnly=${!canWrite}
        @endpoint-delete=${({ detail }) => this.handleDelete(detail.endpoint)}>
      </nx-gql-endpoint-list>
      ${this.renderCreateDialog()}
      <nx-confirm></nx-confirm>`;
  }
}

customElements.define(EL_NAME, Endpoints);
