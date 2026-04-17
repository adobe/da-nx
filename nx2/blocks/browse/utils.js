import { loadHrefSvg, ICONS_BASE } from '../../utils/svg.js';

export function contextToPathContext(context) {
  if (!context) return null;
  const { org, site, path } = context;
  if (!org || !site) return null;
  const rest = path ? path.split('/').filter(Boolean) : [];
  const pathSegments = [org, site, ...rest];
  return { pathSegments, fullpath: `/${pathSegments.join('/')}` };
}

export function itemRowPathKey(folderPathKey, item) {
  const name = item.name || '';
  return folderPathKey ? `${folderPathKey}/${name}` : name;
}

export const ENTRY_TYPE = Object.freeze({
  folder: 'folder',
  document: 'document',
  media: 'media',
  sheet: 'sheet',
  file: 'file',
});

export const ICONS = {
  folder: `${ICONS_BASE}S2_Icon_Folder_20_N.svg`,
  fileText: `${ICONS_BASE}S2_Icon_FileText_20_N.svg`,
  image: `${ICONS_BASE}S2_Icon_Image_20_N.svg`,
  table: `${ICONS_BASE}S2_Icon_Table_20_N.svg`,
  globeGrid: `${ICONS_BASE}S2_Icon_GlobeGrid_20_N.svg`,
};

export function entryTypeFromExtension(ext) {
  if (!ext) {
    return ENTRY_TYPE.folder;
  }
  const e = String(ext).replace(/^\./, '').toLowerCase();
  if (['html', 'htm', 'json'].includes(e)) {
    return ENTRY_TYPE.document;
  }
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'mp4', 'webm', 'mov'].includes(e)) {
    return ENTRY_TYPE.media;
  }
  if (['xlsx', 'xls', 'csv'].includes(e)) {
    return ENTRY_TYPE.sheet;
  }
  return ENTRY_TYPE.file;
}

export function getIconByExtension(ext) {
  switch (entryTypeFromExtension(ext)) {
    case ENTRY_TYPE.folder:
      return 'folder';
    case ENTRY_TYPE.document:
      return 'fileText';
    case ENTRY_TYPE.media:
      return 'image';
    case ENTRY_TYPE.sheet:
      return 'table';
    case ENTRY_TYPE.file:
    default:
      return 'fileText';
  }
}

export async function loadIcons() {
  const entries = Object.entries(ICONS);
  const svgs = await Promise.all(entries.map(([, href]) => loadHrefSvg(href)));
  const loaded = {};
  entries.forEach(([key], i) => { loaded[key] = svgs[i]; });
  return loaded;
}
