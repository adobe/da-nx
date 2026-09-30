import { html, nothing } from 'da-lit';
import { loadStyle } from '../../../../../nx2/utils/utils.js';
import { icon } from '../icons.js';

// Styles a host-rendered <table class="list-table">; `clickable` rows get hover, focus and pointer.
export const tableStyle = await loadStyle(import.meta.url);

const INTERACTIVE = 'a, button, input, label, select, textarea';

const sortIcon = icon({ name: 'arrowUp', className: 'sort-icon' });

const hasSelectedText = (node) => {
  const root = node.getRootNode();
  return !!(root.getSelection?.() ?? document.getSelection())?.toString();
};

// Row @click: clicks the row's `.row-control`, unless a control was clicked or text selected.
export function delegateRowClick(event) {
  const row = event.currentTarget;
  const control = event.target.closest(INTERACTIVE);
  if ((control && row.contains(control)) || hasSelectedText(row)) return;
  row.querySelector('.row-control')?.click();
}

// sort is { key, direction } with direction 'ascending' or 'descending'.
export function nextSort({ sort, key }) {
  if (sort?.key !== key) return { key, direction: 'ascending' };
  return { key, direction: sort.direction === 'ascending' ? 'descending' : 'ascending' };
}

export function renderSortHeader({
  key, label, className = '', sort, onSort,
}) {
  const direction = sort?.key === key ? sort.direction : undefined;
  return html`
    <th class="sortable ${className}" scope="col" aria-sort=${direction ?? nothing}>
      <button type="button" class="sort ${direction ?? ''}"
        @click=${() => onSort(nextSort({ sort, key }))}>${label}${sortIcon}</button>
    </th>`;
}

export function renderEmptyRow({ colspan, text }) {
  return html`<tr class="no-match"><td colspan=${colspan}>${text}</td></tr>`;
}
