const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'mp4', 'webm', 'mov']);
const TABLE_EXTS = new Set(['json', 'xlsx', 'xls', 'csv']);

export function fileIconName(filename) {
  const ext = (filename ?? '').includes('.') ? filename.split('.').pop().toLowerCase() : '';
  if (IMAGE_EXTS.has(ext)) return 's2-icon-image-20-n';
  if (TABLE_EXTS.has(ext)) return 's2-icon-table-20-n';
  if (ext) return 's2-icon-filetext-20-n';
  return 's2-icon-3d-20-n';
}
