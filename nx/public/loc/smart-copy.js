import getElementMetadata from '../../../nx2/utils/getElementMetadata.js';
import { removeLocTags, getBlockHashes, smartMerge } from './regional-diff.js';

const DA_METADATA_SELECTOR = 'body > .da-metadata';
const ROLLOUT_BASE_KEY = 'rolloutbase';
const EMPTY_TAGS = new Set(['DIV', 'P', 'BR']);

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

async function smartRollout({
  source, dest, destHtml, empty, path, site, config,
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
  const sourceHashes = await getBlockHashes({ doc: source, site, config });
  return {
    html: destHtml, skipped: 0, sourceHashes, daMetadata, baselineOnly: true,
  };
}

/**
 * Creates the engine's smart-overwrite rollout (see docs/rollout-smart-overwrite.md) from the
 * engine's own helpers. Documents are read raw so they are saved exactly as authored.
 */
export default function createSmartOverwrite({
  getHtml, loadConfig, saveHtml, saveVersion, fail, responseError,
}) {
  return async (url, title) => {
    try {
      const regional = await getHtml(url.destination, undefined, { raw: true });
      const regionalMain = regional && getSectionedMain(regional);
      if (regional && !regionalMain) throw new Error('Unexpected destination content');
      const source = await getHtml(url.source, url.sourceContent || url.sourceHtml, { raw: true });
      if (!getSectionedMain(source)) throw new Error('Source content not found or malformed');

      const destHtml = regionalMain?.innerHTML;
      const empty = !!regionalMain && isEmptyMain(regionalMain);
      if (regional) removeLocTags(regional);
      removeLocTags(source);

      const [, org, site] = url.destination.split('/');
      const config = await loadConfig({ org, site });
      if (config?.error) throw new Error(config.error);

      const {
        html, skipped, sourceHashes, daMetadata, baselineOnly,
      } = await smartRollout({
        source,
        dest: regional,
        destHtml,
        empty,
        path: url.destination,
        site,
        config,
      });
      daMetadata[ROLLOUT_BASE_KEY] = formatRolloutBase(url.destination, sourceHashes);

      const response = await saveHtml(url, html, daMetadata);
      if (!response.ok) return fail(url, responseError(response, 'Save'));
      if (!baselineOnly) await saveVersion(url.destination, `${title} - Rolled Out`);
      url.status = 'success';
      url.skipped = skipped;
      url.baselineOnly = !!baselineOnly;
      return response;
    } catch (error) {
      return fail(url, error);
    }
  };
}
