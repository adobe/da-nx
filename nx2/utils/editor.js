import { getFirstSheet } from './daConfig.js';

/** Editor URL that `editor.path` assigns to `path`; longest prefix wins, site beats org on ties. */
export function getEditor({ path, configs, ewEnabled }) {
  const DEF_EDIT = ewEnabled ? '/canvas#' : '/edit#';
  const [match] = (configs ?? []).filter(Boolean).reverse()
    .flatMap((config) => getFirstSheet(config) ?? [])
    .filter(({ key, value }) => key === 'editor.path' && path.startsWith(value.split('=')[0]))
    .sort((a, b) => b.value.split('=')[0].length - a.value.split('=')[0].length);
  return match?.value.split('=')[1] ?? DEF_EDIT;
}
