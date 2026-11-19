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

const SVG_NS = 'http://www.w3.org/2000/svg';

// Decorative <svg> for an S2 sprite icon (`<use href="{href}#icon">`), e.g. for a component's
// `icon` slot. `use` at 100% scales the referenced icon into the 20×20 frame.
export function iconSvg({ href, slot } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('aria-hidden', 'true');
  if (slot) svg.setAttribute('slot', slot);
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `${href}#icon`);
  use.setAttribute('width', '100%');
  use.setAttribute('height', '100%');
  svg.append(use);
  return svg;
}
