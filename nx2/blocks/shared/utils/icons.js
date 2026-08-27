const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'mp4', 'webm', 'mov']);
const TABLE_EXTS = new Set(['json', 'xlsx', 'xls', 'csv']);

export function fileIconName(filename, { fallback = 's2-icon-3d-20-n' } = {}) {
  const ext = (filename ?? '').includes('.') ? filename.split('.').pop().toLowerCase() : '';
  if (IMAGE_EXTS.has(ext)) return 's2-icon-image-20-n';
  if (TABLE_EXTS.has(ext)) return 's2-icon-table-20-n';
  if (ext) return 's2-icon-filetext-20-n';
  return fallback;
}

export function pillIconName(type, name) {
  if (type === 'block') return 's2-icon-3d-20-n';
  if (type === 'text') return 's2-icon-text-20-n';
  if (type === 'image') return 's2-icon-image-20-n';
  if (type === 'folder') return 's2-icon-folder-20-n';
  if (type === 'file') return fileIconName(name, { fallback: 's2-icon-filetext-20-n' });
  return fileIconName(name);
}
