function decorateRow(row) {
  const cols = row.querySelectorAll(':scope > div');
  const className = 'columns-row';
  row.className = cols.length === 1 ? `${className} row-title` : `${className} row-content`;
  cols.forEach((col, i) => {
    col.className = `columns-col columns-col-${i + 1}`;
  });
}

export default function init(el) {
  const rows = el.querySelectorAll(':scope > div');
  rows.forEach((row) => {
    decorateRow(row);
  });
}
