import { html, LitElement, nothing } from 'da-lit';
import { loadStyle } from '../../../../nx2/utils/utils.js';
import { getDeliveryPath } from '../utils/endpoint.js';
import { buildHash } from '../utils/route.js';
import { icon } from '../shared/icons.js';
import { showToast, VARIANT_ERROR } from '../../../../nx2/blocks/shared/toast/toast.js';
import { delegateRowClick, renderEmptyRow, tableStyle } from '../shared/table/table.js';

const [buttonStyle, style] = await Promise.all([
  loadStyle(new URL('../../../../nx2/styles/buttons.css', import.meta.url).href),
  loadStyle(import.meta.url),
]);

const EL_NAME = 'nx-gql-endpoint-list';

async function copyPath(path) {
  try {
    await navigator.clipboard.writeText(path);
    showToast({ text: 'Endpoint path copied.' });
  } catch {
    showToast({ text: 'The endpoint path could not be copied.', variant: VARIANT_ERROR });
  }
}

class EndpointList extends LitElement {
  static properties = {
    org: { type: String },
    site: { type: String },
    endpoints: { attribute: false },
    busy: { type: Boolean },
    readOnly: { type: Boolean },
    _filter: { state: true },
    _showFilter: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [buttonStyle, tableStyle, style];
  }

  get filterQuery() {
    return this._filter?.trim().toLowerCase() ?? '';
  }

  get visibleEndpoints() {
    const query = this.filterQuery;
    return query ? this.endpoints.filter((name) => name.includes(query)) : this.endpoints;
  }

  async toggleFilter() {
    this._filter = undefined;
    this._showFilter = !this._showFilter;
    if (!this._showFilter) return;
    await this.updateComplete;
    this.shadowRoot.querySelector('input[name="filter"]')?.focus();
  }

  handleFilterBlur({ target }) {
    if (!target.value) this._showFilter = false;
  }

  handleFilterKeydown(event) {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    this.toggleFilter();
  }

  renderPath(name) {
    const path = getDeliveryPath({ name });
    return html`
      <div class="endpoint-cell">
        <code title=${path}>${path}</code>
        <button type="button" class="nx-action-btn-icon nx-btn-sm copy" title="Copy endpoint" aria-label="Copy endpoint ${path}"
          @click=${() => copyPath(path)}>${icon({ name: 'copy' })}</button>
      </div>`;
  }

  emitDelete(endpoint) {
    this.dispatchEvent(new CustomEvent('endpoint-delete', { detail: { endpoint } }));
  }

  renderRowActions(name) {
    if (this.readOnly) return nothing;
    return html`
      <div class="actions">
        <button type="button" class="nx-action-btn-icon row-action delete" title="Delete"
          aria-label="Delete ${name}" ?disabled=${this.busy}
          @click=${() => this.emitDelete(name)}>${icon({ name: 'delete' })}</button>
      </div>`;
  }

  renderRow(name) {
    return html`
      <tr class="endpoint-row clickable" @click=${delegateRowClick}>
        <td class="filter"></td>
        <td class="name">
          <a class="row-control" href=${buildHash({ org: this.org, site: this.site, endpoint: name })}>${name}</a>
          <div class="stacked-path">${this.renderPath(name)}</div>
        </td>
        <td class="endpoint">${this.renderPath(name)}</td>
        <td class="row-actions">${this.renderRowActions(name)}</td>
      </tr>`;
  }

  renderFilterToggle() {
    return html`
      <button type="button" class="filter-toggle ${this._showFilter ? 'selected' : ''}"
        title="Filter" aria-label="Filter endpoints"
        aria-pressed=${this._showFilter ? 'true' : 'false'}
        @mousedown=${(e) => e.preventDefault()} @click=${() => this.toggleFilter()}>
        ${icon({ name: 'filter' })}</button>`;
  }

  renderNameHeader() {
    if (!this._showFilter) return 'Name';
    return html`
      <input name="filter" type="text" placeholder="Filter" aria-label="Filter endpoints by name"
        autocomplete="off" spellcheck="false" .value=${this._filter ?? ''}
        @input=${({ target }) => { this._filter = target.value; }}
        @blur=${(e) => this.handleFilterBlur(e)} @keydown=${(e) => this.handleFilterKeydown(e)} />`;
  }

  renderBody() {
    const rows = this.visibleEndpoints;
    if (!rows.length) {
      return renderEmptyRow({ colspan: 4, text: `No endpoints match "${this._filter?.trim()}".` });
    }
    return rows.map((name) => this.renderRow(name));
  }

  render() {
    if (!this.endpoints.length) {
      return html`<p class="empty">No endpoints yet. Create one to generate a GraphQL schema
        from the site's schemas.</p>`;
    }
    return html`
      <table class="list-table endpoint-list">
        <thead>
          <tr>
            <th class="filter" scope="col">${this.renderFilterToggle()}</th>
            <th class="name" scope="col">${this.renderNameHeader()}</th>
            <th class="endpoint" scope="col">Endpoint</th>
            <th class="row-actions" scope="col"><span class="visually-hidden">Actions</span></th>
          </tr>
        </thead>
        <tbody>${this.renderBody()}</tbody>
      </table>`;
  }
}

customElements.define(EL_NAME, EndpointList);
