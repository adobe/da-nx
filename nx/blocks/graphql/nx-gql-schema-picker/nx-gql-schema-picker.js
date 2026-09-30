import { html, LitElement, nothing } from 'da-lit';
import { loadStyle } from '../../../../nx2/utils/utils.js';
import {
  countChanges, filterSchemaOptions, getSchemaStatus, sortSchemaOptions,
} from './helpers/options.js';
import { SCHEMA_STATUSES, unsavedSchemaChanges } from '../utils/messages.js';
import { icon } from '../shared/icons.js';
import {
  delegateRowClick, renderEmptyRow, renderSortHeader, tableStyle,
} from '../shared/table/table.js';
import { renderStatusLight, statusLightStyle } from '../shared/status-light/status-light.js';

const [formStyle, buttonStyle, style] = await Promise.all([
  loadStyle(new URL('../../../../nx2/styles/form.css', import.meta.url).href),
  loadStyle(new URL('../../../../nx2/styles/buttons.css', import.meta.url).href),
  loadStyle(import.meta.url),
]);

const EL_NAME = 'nx-gql-schema-picker';

const DEFAULT_SORT = { key: 'title', direction: 'ascending' };

class SchemaPicker extends LitElement {
  static properties = {
    options: { attribute: false },
    busy: { type: Boolean },
    schemaEditorHref: { type: String },
    _query: { state: true },
    _sort: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [
      formStyle, buttonStyle, tableStyle, statusLightStyle, style,
    ];
  }

  get _visible() {
    const options = filterSchemaOptions({
      options: this.options ?? [],
      query: this._query,
      statusLabel: (option) => SCHEMA_STATUSES[getSchemaStatus(option)]?.label,
    });
    return sortSchemaOptions({ options, ...this.sort });
  }

  get sort() {
    return this._sort ?? DEFAULT_SORT;
  }

  handleSearch({ target }) {
    this._query = target.value;
  }

  select({ ids, selected }) {
    this.dispatchEvent(new CustomEvent('schemas-select', { detail: { ids, selected } }));
  }

  handleSelectAll(selected) {
    const ids = this._visible
      .filter((option) => option.usable || (!selected && option.selected))
      .map((option) => option.id);
    if (ids.length) this.select({ ids, selected });
  }

  // Unusable schemas can only be deselected, so they count only when selected.
  renderSelectAll(visible) {
    const togglable = visible.filter((option) => option.usable || option.selected);
    const all = togglable.length > 0 && togglable.every((option) => option.selected);
    const some = togglable.some((option) => option.selected);
    return html`
      <span class="nx-checkbox ${some && !all ? 'indeterminate' : ''}">
        <input type="checkbox" class="select-all" aria-label="Select all shown schemas"
          .checked=${all} .indeterminate=${some && !all}
          ?disabled=${this.busy || !togglable.length}
          @change=${() => this.handleSelectAll(!all)} />
      </span>`;
  }

  renderCount() {
    const options = this.options ?? [];
    const selected = options.filter((option) => option.selected).length;
    const changes = unsavedSchemaChanges(countChanges(options));
    return html`
      <span class="count">${selected} of ${options.length} selected${changes
        ? html` · <span class="changes">${changes}</span>` : nothing}</span>`;
  }

  renderEditorLink() {
    if (!this.schemaEditorHref) return nothing;
    return html`
      <a class="nx-action-btn-icon nx-btn-sm editor-link" href=${this.schemaEditorHref} target="_blank" rel="noopener"
        title="Open in Schema Editor" aria-label="Open in Schema Editor">${icon({ name: 'openIn' })}</a>`;
  }

  renderStatus(option) {
    const kind = getSchemaStatus(option);
    if (!kind) return nothing;
    const { variant, label, title } = SCHEMA_STATUSES[kind];
    const issues = kind === 'invalid' && option.issues.join('\n');
    return html`
      ${renderStatusLight({ variant, label, title: issues || title })}
      ${kind === 'invalid' ? this.renderEditorLink() : nothing}`;
  }

  isDisabled(option) {
    return this.busy || (!option.usable && !option.selected);
  }

  renderCheckbox(option) {
    return html`
      <span class="nx-checkbox">
        <input type="checkbox" class="row-control" aria-label=${option.id} .value=${option.id}
          .checked=${option.selected} ?disabled=${this.isDisabled(option)}
          @change=${({ target }) => this.select({ ids: [option.id], selected: target.checked })} />
      </span>`;
  }

  renderRow(option, hasStatus) {
    const label = option.title || option.id;
    const className = `schema-option ${this.isDisabled(option) ? 'disabled' : 'clickable'}`;
    return html`
      <tr class=${className} @click=${delegateRowClick}>
        <td class="select">${this.renderCheckbox(option)}</td>
        <td class="schema-title"><span title=${label}>${label}</span></td>
        <td class="schema-id"><span title=${option.id}>${option.id}</span></td>
        ${hasStatus ? html`<td class="state"><div class="state-cell">${this.renderStatus(option)}</div></td>` : nothing}
      </tr>`;
  }

  renderList(visible) {
    const hasStatus = this.options.some((option) => getSchemaStatus(option));
    const { sort } = this;
    const onSort = (next) => { this._sort = next; };
    const header = (key, label, className) => renderSortHeader({
      key, label, className, sort, onSort,
    });
    const body = visible.length
      ? visible.map((option) => this.renderRow(option, hasStatus))
      : renderEmptyRow({
        colspan: hasStatus ? 4 : 3, text: `No schemas match “${this._query?.trim()}”.`,
      });
    return html`
      <div class="table-wrap">
        <table class="list-table schema-list">
          <thead>
            <tr>
              <th class="select" scope="col">${this.renderSelectAll(visible)}</th>
              ${header('title', 'Title', 'schema-title')}
              ${header('id', 'ID', 'schema-id')}
              ${hasStatus ? header('status', 'Status', 'state') : nothing}
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
  }

  render() {
    if (!this.options?.length) {
      const editor = this.schemaEditorHref
        ? html`<a href=${this.schemaEditorHref} target="_blank" rel="noopener">Schema Editor</a>`
        : 'Schema Editor';
      return html`<p class="empty">This site has no Structured Content schemas yet. Create one
        in the ${editor} first.</p>`;
    }
    const visible = this._visible;
    return html`
      <div class="picker-toolbar">
        <input class="search" type="search" placeholder="Search schemas"
          aria-label="Search schemas" .value=${this._query ?? ''} @input=${this.handleSearch} />
        ${this.renderCount()}
      </div>
      ${this.renderList(visible)}
    `;
  }
}

customElements.define(EL_NAME, SchemaPicker);
