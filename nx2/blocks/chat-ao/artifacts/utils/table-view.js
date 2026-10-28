export function getCellValue({ row, column }) {
  return Object.hasOwn(row, column.id) ? row[column.id] : undefined;
}

function csvCell(value) {
  const text = String(value ?? '');
  // Prevent spreadsheet formulas in model-supplied strings from executing on import.
  const safe = typeof value === 'string' && /^(?:[\t\r\n]|\s*[=+\-@])/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function tableToCsv({ columns, items }) {
  const rows = [
    columns.map((col) => col.name),
    ...items.map((row) => columns.map((column) => getCellValue({ row, column }))),
  ];
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}
