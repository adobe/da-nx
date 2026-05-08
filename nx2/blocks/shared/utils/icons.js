const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'mp4', 'webm', 'mov']);
const TABLE_EXTS = new Set(['json', 'xlsx', 'xls', 'csv']);

export function iconClassFromName(name, fallback = 'icon-file') {
  if (!String(name ?? '').includes('.')) return fallback;
  const ext = String(name).split('.').pop().toLowerCase();
  if (IMAGE_EXTS.has(ext)) return 'icon-image';
  if (TABLE_EXTS.has(ext)) return 'icon-table';
  return fallback;
}
