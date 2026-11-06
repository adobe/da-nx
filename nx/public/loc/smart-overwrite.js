import getElementMetadata from '../../../nx2/utils/getElementMetadata.js';
import {
  regionalDiff, removeLocTags, getBlockHashes, smartMerge,
} from './regional-diff.js';

const DA_METADATA_SELECTOR = 'body > .da-metadata';
const ROLLOUT_BASE_KEY = 'rolloutbase';
const EMPTY_TAGS = new Set(['DIV', 'P', 'BR']);
const DIFF_MARKERS = 'da-diff-deleted, [da-diff-added], da-loc-added, da-loc-deleted, [loc-temp-dom]';
const VERSION_ID = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.html$/i;

const toBasePath = (path) => path.toLowerCase();

// Keeps metadata values exactly as authored (getElementMetadata's `text` is lowercased).
const readMetadata = (el) => Object.fromEntries(Object.entries(getElementMetadata(el))
  .map(([key, { content }]) => [key, content.innerHTML]));

function getRolloutBase(metadataEl, path) {
  const value = getElementMetadata(metadataEl)[ROLLOUT_BASE_KEY]?.content.textContent.trim();
  const parts = value?.split('|') || [];
  if (parts.length !== 2) return null;
  const [basePath, hashes] = parts;
  if (toBasePath(basePath) !== toBasePath(path)) return null;
  const list = hashes ? hashes.split(',') : [];
  return list.every((hash) => /^[0-9a-f]{12}$/.test(hash)) ? list : null;
}

const formatRolloutBase = (path, hashes) => `${toBasePath(path)}|${hashes.join(',')}`;

// Block extraction only reads `main > div` sections; anything else would be silently dropped.
function getSectionedMain(doc) {
  const main = doc?.querySelectorAll('main').length === 1 && doc.querySelector('body > main');
  const isText = (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim();
  const isLoose = (node) => isText(node)
    || (node.nodeType === Node.ELEMENT_NODE && (node.nodeName !== 'DIV' || [...node.childNodes].some(isText)));
  return main && ![...main.childNodes].some(isLoose) ? main : null;
}

const isEmptyMain = (main) => !main.textContent.trim()
  && [...main.querySelectorAll('*')].every((el) => EMPTY_TAGS.has(el.nodeName) && !el.attributes.length);

async function copySource({ source, site, config }) {
  const html = source.querySelector('main').innerHTML;
  const daMetadata = readMetadata(source.querySelector(DA_METADATA_SELECTOR));
  delete daMetadata.acceptedhashes;
  delete daMetadata.rejectedhashes;
  const sourceHashes = await getBlockHashes({ doc: source, site, config });
  return { html, skipped: 0, sourceHashes, daMetadata };
}

async function mergeReview({
  source, dest, metadataEl, site, config, sourceHashes,
}) {
  const reviewed = getElementMetadata(metadataEl);
  const accepted = reviewed.acceptedhashes?.text?.split(',') || [];
  const rejected = reviewed.rejectedhashes?.text?.split(',') || [];
  const diffed = await regionalDiff(source, dest, accepted, rejected, { site, config });
  return { html: diffed.innerHTML, skipped: 0, sourceHashes };
}

// Legacy DA lists audit-only entries alongside saved versions; only saved ones have a url.
async function readParentVersion({
  fetch, daOrigin, path, responseError,
}) {
  const listResponse = await fetch(`${daOrigin}/versionlist${path}`);
  if (listResponse.status === 404) return null;
  if (!listResponse.ok) throw responseError(listResponse, 'Reading parent versions');
  const entries = await listResponse.json();
  if (!Array.isArray(entries)) throw new Error('Unexpected parent version list');
  const latest = entries
    .filter((entry) => typeof entry?.url === 'string' && Number.isFinite(entry.timestamp))
    .reduce((newest, entry) => (newest?.timestamp >= entry.timestamp ? newest : entry), null);
  if (!latest) return null;

  const [, org, site] = path.split('/');
  const prefix = `/versionsource/${org}/${site}/`;
  const sameSite = latest.url.toLowerCase().startsWith(prefix.toLowerCase());
  const id = sameSite && latest.url.slice(prefix.length);
  if (!id || !VERSION_ID.test(id)) throw new Error('Unexpected parent version');
  const response = await fetch(`${daOrigin}${prefix}${id}`);
  if (!response.ok) throw responseError(response, 'Reading parent version');
  return response.text();
}

async function getParentBase({
  readParent, expand, getHtml, site, config,
}) {
  const text = await readParent();
  if (text === null) return null;
  const { content, error } = expand ? await expand(text) : {};
  const prepared = !error && typeof content === 'string' ? content : text;
  const parent = prepared.trim() ? await getHtml(undefined, prepared, { raw: true }) : null;
  if (!parent || !getSectionedMain(parent)) throw new Error('Parent version is malformed');
  if (parent.querySelector(DIFF_MARKERS)) return null;
  return getBlockHashes({ doc: parent, site, config });
}

// No valid baseline yet: the parent's latest saved version stands in for it when usable;
// otherwise today's merge so the author reviews every difference once.
async function firstRollout({
  source, dest, destHtml, destMarked, metadataEl, site, config, readParent, expand, getHtml,
}) {
  const sourceHashes = await getBlockHashes({ doc: source, site, config });
  const destHashes = await getBlockHashes({ doc: dest, site, config });
  if (sourceHashes.join() === destHashes.join()) {
    return { html: destHtml, skipped: 0, sourceHashes };
  }
  const review = () => mergeReview({
    source, dest, metadataEl, site, config, sourceHashes,
  });
  if (destMarked) return review();
  const base = await getParentBase({
    readParent, expand, getHtml, site, config,
  });
  if (!base || base.join() === sourceHashes.join()) return review();
  return smartMerge({
    base, source, dest, site, config,
  });
}

async function smartRollout({
  source, dest, destHtml, destMarked, empty, path, site, config, readParent, expand, getHtml,
}) {
  if (!dest) return copySource({ source, site, config });
  const metadataEl = dest.querySelector(DA_METADATA_SELECTOR);
  const daMetadata = readMetadata(metadataEl);
  const base = getRolloutBase(metadataEl, path);
  if (base) {
    const merged = await smartMerge({
      base, source, dest, site, config,
    });
    return { ...merged, daMetadata };
  }
  if (empty) return copySource({ source, site, config });
  const merged = await firstRollout({
    source, dest, destHtml, destMarked, metadataEl, site, config, readParent, expand, getHtml,
  });
  return { ...merged, daMetadata };
}

/**
 * Creates the engine's smart-overwrite rollout (see docs/rollout-smart-overwrite.md) from the
 * engine's own helpers. Documents are read raw so whitespace (e.g. in code) is not collapsed.
 */
export default function createSmartOverwrite({
  fetch, daOrigin, getHtml, loadConfig, saveHtml, saveVersion, fail, responseError,
}) {
  return async (url, title, { expand } = {}) => {
    try {
      const regional = await getHtml(url.destination, undefined, { raw: true });
      const regionalMain = regional && getSectionedMain(regional);
      if (regional && !regionalMain) throw new Error('Unexpected destination content');
      const source = await getHtml(url.source, url.sourceContent || url.sourceHtml, { raw: true });
      if (!getSectionedMain(source)) throw new Error('Source content not found or malformed');

      const empty = !!regionalMain && isEmptyMain(regionalMain);
      const destHtml = regionalMain?.innerHTML;
      const destMarked = !!regional?.querySelector(DIFF_MARKERS);
      if (regional) removeLocTags(regional);
      removeLocTags(source);

      const [, org, site] = url.destination.split('/');
      const config = await loadConfig({ org, site });
      if (config?.error) throw new Error(config.error);

      const {
        html, skipped, sourceHashes, daMetadata,
      } = await smartRollout({
        source,
        dest: regional,
        destHtml,
        destMarked,
        empty,
        path: url.destination,
        site,
        config,
        readParent: () => readParentVersion({
          fetch, daOrigin, path: url.source, responseError,
        }),
        expand,
        getHtml,
      });
      daMetadata[ROLLOUT_BASE_KEY] = formatRolloutBase(url.destination, sourceHashes);

      const response = await saveHtml(url, html, daMetadata);
      if (!response.ok) return fail(url, responseError(response, 'Save'));
      await saveVersion(url.destination, `${title} - Rolled Out`);
      url.status = 'success';
      url.skipped = skipped;
      return response;
    } catch (error) {
      return fail(url, error);
    }
  };
}
