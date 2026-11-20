import { fetchDaConfigs, getFirstSheet } from './daConfig.js';

export const SC_REINDEX_URL_KEY = 'sc.graphql.url';
const MAX_PATHS = 50;
// Structured content editor routes, e.g. `/form#`, `https://da.live/form#`, `.../sc-editor/form#`.
const SC_EDITOR = /\/form#$/;

/** True when the longest matching `editor.path` rule opens the structured content editor. */
function isStructuredContent(fullpath, editorConfs) {
  const [match] = editorConfs
    .filter(({ prefix }) => fullpath.startsWith(prefix))
    .sort((a, b) => b.prefix.length - a.prefix.length);
  return !!match && SC_EDITOR.test(match.editor);
}

/** Reindex service URL from the config (site overrides org); null unless an https URL. */
function getReindexUrl(configs) {
  const value = configs
    .flatMap((json) => getFirstSheet(json) ?? [])
    .findLast(({ key }) => key === SC_REINDEX_URL_KEY)?.value?.trim();
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href.replace(/\/+$/, '') : null;
  } catch {
    return null;
  }
}

function getEditorConfs(configs) {
  return configs
    .flatMap((json) => getFirstSheet(json) ?? [])
    .filter(({ key, value }) => key === 'editor.path' && value?.includes('='))
    .map(({ value }) => {
      const i = value.indexOf('=');
      return { prefix: value.slice(0, i).trim(), editor: value.slice(i + 1).trim() };
    });
}

/**
 * Fire-and-forget: never throws and never rejects, so callers do not need to await it
 * and publish is never blocked or failed by the reindex service.
 * Sends nothing unless a reindex service URL is configured; then only paths mapped to
 * the structured content editor via `editor.path` are sent.
 * @param {{ org: string, site: string, paths: string[] }} params
 * @returns {Promise<number>} Number of notifications sent.
 */
export async function notifyScReindex({ org, site, paths }) {
  try {
    if (!org || !site) return 0;
    const configs = await Promise.all(fetchDaConfigs({ org, site }));
    const reindexUrl = getReindexUrl(configs);
    if (!reindexUrl) return 0;
    const editorConfs = getEditorConfs(configs);
    const webPaths = [...new Set(paths
      .filter((p) => isStructuredContent(`/${org}/${site}${p}`, editorConfs))
      .map((p) => p.replace(/\.html$/, '')))];
    if (!webPaths.length) return 0;

    const requests = [];
    for (let i = 0; i < webPaths.length; i += MAX_PATHS) {
      requests.push(fetch(`${reindexUrl}/${org}/${site}/reindex`, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tiers: ['live'], paths: webPaths.slice(i, i + MAX_PATHS) }),
      }).catch(() => {}));
    }
    await Promise.all(requests);
    return requests.length;
  } catch {
    return 0;
  }
}
