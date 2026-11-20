import getElementMetadata from '../../../nx2/utils/getElementMetadata.js';
import {
  regionalDiff, removeLocTags, getBlockHashes, getContentHashes, smartMerge, LOC_MARKERS,
  isSnapshotPath, removeRejectedBlocks,
} from './regional-diff.js';
import {
  ACCEPTED_KEY, REJECTED_KEY, REVIEW_KEYS, ROLLOUT_BASE_KEY, ROLLOUT_ORDER_KEY,
  getDiffHash, readReviewHashes, restoreReviewKeys,
} from './hashes.js';

const DA_METADATA_SELECTOR = 'body > .da-metadata';
const EMPTY_TAGS = new Set(['DIV', 'P', 'BR']);
const MARKED_VERSION_LABEL = 'Sync point set';
const NOT_ENABLED = 'Smart overwrite is not enabled for this site';

const toBasePath = (path) => path.toLowerCase();

// Keeps metadata values exactly as authored (getElementMetadata's `text` is lowercased).
const readMetadata = (el) => restoreReviewKeys(Object.fromEntries(
  Object.entries(getElementMetadata(el)).map(([key, { content }]) => [key, content.innerHTML]),
), el);

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

// Fingerprint of the blocks upstream swapped, so an unchanged reorder is listed once.
const formatRolloutOrder = (path, hashes) => `${toBasePath(path)}|${getDiffHash(hashes.join(','))}`;

const readRolloutOrder = (metadataEl) => getElementMetadata(metadataEl)[ROLLOUT_ORDER_KEY]
  ?.content.textContent.trim();

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

const getRejected = (el) => readReviewHashes(el, REJECTED_KEY);

// An emptied page keeps its merge review decisions: rejected blocks stay out of the copy.
async function copySource({
  source, site, config, destMetadataEl,
}) {
  const rejected = getRejected(destMetadataEl);
  const copy = await removeRejectedBlocks({
    doc: source, rejected, site, config,
  });
  const html = copy.querySelector('main').innerHTML;
  const daMetadata = readMetadata(source.querySelector(DA_METADATA_SELECTOR));
  const destMetadata = readMetadata(destMetadataEl);
  REVIEW_KEYS.forEach((key) => {
    if (destMetadata[key]) daMetadata[key] = destMetadata[key];
    else delete daMetadata[key];
  });
  const sourceHashes = await getBlockHashes({ doc: copy, site, config });
  return { html, skipped: 0, sourceHashes, daMetadata };
}

async function mergeReview({
  source, dest, metadataEl, site, config, sourceHashes,
}) {
  const accepted = readReviewHashes(metadataEl, ACCEPTED_KEY);
  const rejected = getRejected(metadataEl);
  const diffed = await regionalDiff(source, dest, accepted, rejected, { site, config });
  return {
    html: diffed.innerHTML, skipped: 0, sourceHashes, review: !!diffed.querySelector(LOC_MARKERS),
  };
}

// No valid baseline yet: today's merge, so the author reviews every difference once.
async function firstRollout({
  source, dest, destHtml, destMarked, metadataEl, site, config,
}) {
  const sourceHashes = await getBlockHashes({ doc: source, site, config });
  if (!destMarked) {
    const destHashes = await getBlockHashes({ doc: dest, site, config });
    if (sourceHashes.join() === destHashes.join()) {
      return { html: destHtml, skipped: 0, sourceHashes };
    }
  }
  return mergeReview({
    source, dest, metadataEl, site, config, sourceHashes,
  });
}

async function smartRollout({
  source, dest, destHtml, destMarked, empty, path, site, config,
}) {
  if (!dest) return copySource({ source, site, config });
  const metadataEl = dest.querySelector(DA_METADATA_SELECTOR);
  const daMetadata = readMetadata(metadataEl);
  // A snapshot never merges against a sync point: it only keeps the live page's.
  const base = !isSnapshotPath(path) && getRolloutBase(metadataEl, path);
  if (base && !destMarked) {
    const sourceHashes = await getBlockHashes({ doc: source, site, config });
    if (sourceHashes.join() === base.join()) return { unchanged: true, reordered: false };
    const merged = await smartMerge({
      base, source, dest, rejected: getRejected(metadataEl), site, config,
    });
    const orders = {
      reordered: merged.reordered,
      order: formatRolloutOrder(path, merged.swaps),
      seenOrder: formatRolloutOrder(path, merged.swapsAsBase),
    };
    if (merged.sourceHashes.join() === base.join()) return { unchanged: true, ...orders };
    return { ...merged, ...orders, daMetadata };
  }
  if (empty) {
    return copySource({
      source, site, config, destMetadataEl: metadataEl,
    });
  }
  const merged = await firstRollout({
    source, dest, destHtml, destMarked, metadataEl, site, config,
  });
  return { ...merged, daMetadata };
}

const isHtmlPath = (path) => path.toLowerCase().endsWith('.html');

function withMetadataRow(doc, { key, value, dropKeys = [] }) {
  const page = doc.cloneNode(true);
  let metadata = page.querySelector(DA_METADATA_SELECTOR);
  if (!metadata && value) {
    metadata = page.createElement('div');
    metadata.className = 'da-metadata';
    page.body.insertBefore(metadata, page.querySelector('body > footer'));
  }
  const removed = [key, ...dropKeys].map((name) => name.toLowerCase());
  [...metadata?.children || []]
    .filter((el) => removed.includes(el.children[0]?.textContent.trim().toLowerCase()))
    .forEach((el) => el.remove());
  if (value) {
    const row = page.createElement('div');
    row.append(page.createElement('div'), page.createElement('div'));
    row.firstElementChild.textContent = key;
    row.lastElementChild.textContent = value;
    metadata.append(row);
  }
  if (!doc.sourceShape?.html && !doc.head?.childNodes.length) return page.body.outerHTML;
  const doctype = doc.sourceShape.doctype ? '<!DOCTYPE html>\n' : '';
  return `${doctype}${page.documentElement.outerHTML}`;
}

// A new sync point also drops the recorded upstream order, which only described the old one.
const withBaselineRow = (doc, value, { dropKeys = [] } = {}) => withMetadataRow(doc, {
  key: ROLLOUT_BASE_KEY, value, dropKeys: [ROLLOUT_ORDER_KEY, ...dropKeys],
});

// Destination blocks with no matching upstream block (repeated blocks are matched one for one).
function countLocalBlocks(sourceHashes, destHashes) {
  const available = new Map();
  sourceHashes.forEach((hash) => available.set(hash, (available.get(hash) || 0) + 1));
  return destHashes.filter((hash) => {
    const left = available.get(hash) || 0;
    available.set(hash, left - 1);
    return left <= 0;
  }).length;
}

/**
 * Creates the engine's smart-overwrite methods (see docs/rollout-smart-overwrite.md) from the
 * engine's own helpers. Documents are read raw so whitespace (e.g. in code) is not collapsed.
 */
export default function createSmartOverwrite({
  getHtml, loadConfig, saveHtml, saveBody, saveVersion, fail, responseError,
  isSmartOverwriteEnabled,
}) {
  const getConfig = async (url) => {
    const [, org, site] = url.destination.split('/');
    const config = await loadConfig({ org, site });
    if (config?.error) throw new Error(config.error);
    return { site, config };
  };

  const readSectioned = async (url) => {
    const source = await getHtml(url.source, url.sourceContent || url.sourceHtml, { raw: true });
    if (!getSectionedMain(source)) return null;
    removeLocTags(source);
    return source;
  };

  const readSource = async (url) => {
    const source = await readSectioned(url);
    if (!source) throw new Error('Source content not found or malformed');
    return source;
  };

  const recordOrder = async ({
    url, reordered, order, keptOrder,
  }) => {
    const value = reordered ? order : null;
    if ((value ?? undefined) === keptOrder) return { ok: true };
    const latest = await getHtml(url.destination, undefined, { raw: true });
    if (!latest || !getSectionedMain(latest)) throw new Error('Unexpected destination content');
    return saveBody(url, withMetadataRow(latest, { key: ROLLOUT_ORDER_KEY, value }));
  };

  const smartOverwrite = async (url, title) => {
    delete url.outcome;
    delete url.removedUpstream;
    delete url.reordered;
    try {
      const regional = await getHtml(url.destination, undefined, { raw: true });
      const regionalMain = regional && getSectionedMain(regional);
      if (regional && !regionalMain) throw new Error('Unexpected destination content');
      const { site, config } = await getConfig(url);
      if (!isSmartOverwriteEnabled(config)) throw new Error(NOT_ENABLED);
      const source = await readSource(url);

      const empty = !!regionalMain && isEmptyMain(regionalMain);
      const destHtml = regionalMain?.innerHTML;
      const destMarked = !!regional?.querySelector(LOC_MARKERS);
      const destMetadata = readMetadata(regional?.querySelector(DA_METADATA_SELECTOR));
      const keptBase = destMetadata[ROLLOUT_BASE_KEY];
      const keptOrder = readRolloutOrder(regional?.querySelector(DA_METADATA_SELECTOR));
      if (regional) removeLocTags(regional);

      const {
        html, skipped, sourceHashes, daMetadata, unchanged, review, removedUpstream, reordered,
        order, seenOrder,
      } = await smartRollout({
        source,
        dest: regional,
        destHtml,
        destMarked,
        empty,
        path: url.destination,
        site,
        config,
      });
      const newlyReordered = reordered && seenOrder !== keptOrder;
      if (unchanged) {
        const recorded = await recordOrder({
          url, reordered, order, keptOrder,
        });
        if (!recorded.ok) return fail(url, responseError(recorded, 'Save'));
        url.status = 'success';
        url.skipped = 0;
        url.outcome = 'unchanged';
        if (newlyReordered) url.reordered = true;
        return { ok: true };
      }
      // A snapshot keeps the page's sync point and never records one.
      if (!isSnapshotPath(url.destination)) {
        daMetadata[ROLLOUT_BASE_KEY] = formatRolloutBase(url.destination, sourceHashes);
        if (reordered) daMetadata[ROLLOUT_ORDER_KEY] = order;
        else delete daMetadata[ROLLOUT_ORDER_KEY];
      } else {
        if (keptBase) daMetadata[ROLLOUT_BASE_KEY] = keptBase;
        else delete daMetadata[ROLLOUT_BASE_KEY];
        if (keptOrder) daMetadata[ROLLOUT_ORDER_KEY] = destMetadata[ROLLOUT_ORDER_KEY];
        else delete daMetadata[ROLLOUT_ORDER_KEY];
      }

      const response = await saveHtml(url, html, daMetadata);
      if (!response.ok) return fail(url, responseError(response, 'Save'));
      await saveVersion(url.destination, `${title} - Rolled Out`);
      url.status = 'success';
      url.skipped = skipped;
      if (review) url.outcome = 'review';
      if (removedUpstream) url.removedUpstream = removedUpstream;
      if (newlyReordered) url.reordered = true;
      return response;
    } catch (error) {
      return fail(url, error);
    }
  };

  const getBaselineValue = async (url) => {
    const { site, config } = await getConfig(url);
    const source = await readSectioned(url);
    if (!source) return null;
    const sourceHashes = await getBlockHashes({ doc: source, site, config });
    return formatRolloutBase(url.destination, sourceHashes);
  };

  const getOverwriteWithBaseline = async (url) => {
    const { site, config } = await getConfig(url);
    const source = await readSectioned(url);
    if (!source) return null;
    const sourceHashes = await getBlockHashes({ doc: source, site, config });
    const value = formatRolloutBase(url.destination, sourceHashes);
    return { body: withBaselineRow(source, value, { dropKeys: REVIEW_KEYS }) };
  };

  const readMarkable = async (url) => {
    const regional = await getHtml(url.destination, undefined, { raw: true });
    if (!regional) return { sync: 'missing' };
    const main = getSectionedMain(regional);
    if (!main) throw new Error('Unexpected destination content');
    if (isEmptyMain(main)) return { sync: 'missing' };
    if (regional.querySelector(LOC_MARKERS)) return { sync: 'unresolved' };
    const metadataEl = regional.querySelector(DA_METADATA_SELECTOR);
    if (getRolloutBase(metadataEl, url.destination)) return { sync: 'in-sync' };
    return { regional };
  };

  const setSync = (url, sync, extra = {}) => {
    Object.assign(url, { status: 'success', sync, ...extra });
    return { ok: true };
  };

  const recordBaseline = async (url, value) => {
    const regional = await getHtml(url.destination, undefined, { raw: true });
    if (!regional || (value && !getSectionedMain(regional))) return { ok: true };
    return saveBody(url, withBaselineRow(regional, value));
  };

  const markInSync = async (url, { dryRun = false } = {}) => {
    try {
      delete url.sync;
      delete url.differences;
      delete url.error;
      if (!isHtmlPath(url.destination)) return setSync(url, 'sheet');
      if (isSnapshotPath(url.destination)) return setSync(url, 'snapshot');
      const { site, config } = await getConfig(url);
      if (!isSmartOverwriteEnabled(config)) throw new Error(NOT_ENABLED);
      const checked = await readMarkable(url);
      if (checked.sync) return setSync(url, checked.sync);

      const source = await readSource(url);
      if (dryRun) {
        const differences = countLocalBlocks(
          await getContentHashes({ doc: source, site, config }),
          await getContentHashes({ doc: checked.regional, site, config }),
        );
        return setSync(url, 'to-mark', { differences });
      }
      // Re-read right before saving so an edit made while hashing the source is kept.
      const latest = await readMarkable(url);
      if (latest.sync) return setSync(url, latest.sync);
      const sourceHashes = await getBlockHashes({ doc: source, site, config });
      const value = formatRolloutBase(url.destination, sourceHashes);
      const response = await saveBody(url, withBaselineRow(latest.regional, value));
      if (!response.ok) return fail(url, responseError(response, 'Save'));
      await saveVersion(url.destination, MARKED_VERSION_LABEL);
      setSync(url, 'marked');
      return response;
    } catch (error) {
      return fail(url, error);
    }
  };

  return {
    smartOverwrite,
    markInSync,
    getBaselineValue,
    getOverwriteWithBaseline,
    recordBaseline,
  };
}
