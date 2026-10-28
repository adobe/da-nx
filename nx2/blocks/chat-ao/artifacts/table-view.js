import { html, nothing } from 'da-lit';
import { registerArtifact } from './registry.js';
import { getCellValue, tableToCsv } from './utils/table-view.js';

const COLUMN_FIELDS = new Set(['id', 'name', 'isRowHeader', 'type', 'allowsResizing']);
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isCellValue = (value) => value === null || typeof value === 'string'
  || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));

function downloadCsv({ columns, items }) {
  const blob = new Blob(['\uFEFF', tableToCsv({ columns, items })], { type: 'text/csv;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  try {
    link.href = href;
    link.download = 'table.csv';
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 0);
  }
}

registerArtifact('TableView', ({
  label = '', columns, items, selectionMode = 'none', allowsCsvExport = false,
}) => {
  if (typeof label !== 'string' || selectionMode !== 'none' || typeof allowsCsvExport !== 'boolean'
    || !Array.isArray(columns) || columns.some((col) => (
    !isRecord(col) || typeof col.id !== 'string' || !col.id || typeof col.name !== 'string'
      || (col.isRowHeader !== undefined && typeof col.isRowHeader !== 'boolean')
      || (col.type !== undefined && col.type !== 'text')
      || (col.allowsResizing !== undefined && col.allowsResizing !== false)
      || Object.keys(col).some((key) => !COLUMN_FIELDS.has(key))
  ))
    || !Array.isArray(items) || items.some((row) => (
    !isRecord(row) || typeof row.id !== 'string' || !row.id
      || !Object.values(row).every(isCellValue)
  ))) {
    throw new Error('Unsupported TableView content.');
  }
  return html`
    <div class="ui-artifact-table-view">
      ${allowsCsvExport ? html`
        <div class="ui-artifact-table-toolbar">
          <button type="button" class="nx-action-btn-quiet" @click=${() => downloadCsv({ columns, items })}>Download CSV</button>
        </div>
      ` : nothing}
      <div class="ui-artifact-table-wrapper" role="region" aria-label=${label || 'Table'} tabindex="0">
        <table class="ui-artifact-table">
          ${label ? html`<caption>${label}</caption>` : nothing}
          <thead>
            <tr>${columns.map((col) => html`<th scope="col">${col.name}</th>`)}</tr>
          </thead>
          <tbody>
            ${items.map((row) => html`
              <tr>${columns.map((col) => (col.isRowHeader
    ? html`<th scope="row">${String(getCellValue({ row, column: col }) ?? '')}</th>`
    : html`<td>${String(getCellValue({ row, column: col }) ?? '')}</td>`))}</tr>
            `)}
          </tbody>
        </table>
      </div>
    </div>
  `;
});
