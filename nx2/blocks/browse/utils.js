import { loadHrefSvg, ICONS_BASE } from '../../utils/svg.js';

export function sanitizeName(value, trimTail = false) {
  let result = value
    .replaceAll(/[^a-zA-Z0-9.]/g, '-')
    .replaceAll(/-+/g, '-')
    .toLowerCase();
  if (trimTail) result = result.replace(/[^a-zA-Z0-9]+$/, '');
  return result;
}

export function contextToPathContext(context) {
  if (!context) return null;
  const { org, site, path } = context;
  if (!org || !site) return null;
  const fullpath = path ? `/${org}/${site}/${path}` : `/${org}/${site}`;
  const pathSegments = path
    ? [org, site, ...String(path).split('/').filter(Boolean)]
    : [org, site];
  return { pathSegments, fullpath };
}

export function isFolder(item) {
  return !String(item?.ext ?? '').trim();
}

export const RESOURCE_TYPE = Object.freeze({
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
  close: `${ICONS_BASE}S2_Icon_Close_20_N.svg`,
  delete: `${ICONS_BASE}S2_Icon_Delete_20_N.svg`,
  edit: `${ICONS_BASE}S2_Icon_Edit_20_N.svg`,
  preview: `${ICONS_BASE}S2_Icon_Preview_20_N.svg`,
  publish: `${ICONS_BASE}S2_Icon_Publish_20_N.svg`,
  rename: `${ICONS_BASE}S2_Icon_Rename_20_N.svg`,
};

export function entryTypeFromExtension(ext) {
  const normalized = String(ext ?? '').trim().replace(/^\./, '').toLowerCase();
  if (!normalized) {
    return RESOURCE_TYPE.folder;
  }
  if (['html', 'htm'].includes(normalized)) {
    return RESOURCE_TYPE.document;
  }
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'mp4', 'webm', 'mov'].includes(normalized)) {
    return RESOURCE_TYPE.media;
  }
  if (['json', 'xlsx', 'xls', 'csv'].includes(normalized)) {
    return RESOURCE_TYPE.sheet;
  }
  return RESOURCE_TYPE.file;
}

export function getIconByExtension(ext) {
  switch (entryTypeFromExtension(ext)) {
    case RESOURCE_TYPE.folder:
      return 'folder';
    case RESOURCE_TYPE.document:
      return 'fileText';
    case RESOURCE_TYPE.media:
      return 'image';
    case RESOURCE_TYPE.sheet:
      return 'table';
    case RESOURCE_TYPE.file:
    default:
      return 'fileText';
  }
}

export async function loadIcons() {
  const entries = Object.entries(ICONS);
  const svgs = await Promise.all(entries.map(([, href]) => loadHrefSvg(href)));
  const loaded = {};
  entries.forEach(([k], i) => { loaded[k] = svgs[i]; });
  return loaded;
}
