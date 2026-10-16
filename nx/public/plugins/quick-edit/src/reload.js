import { OVERLAY_SELECTOR } from './dom-index.js';

const INDEX_ATTRS = ['data-prose-index', 'data-image-index', 'data-block-index'];

const getSourceSections = (root) => [...root.querySelectorAll(':scope > div')];

const getSourceBlocks = (sections) => sections
  .flatMap((section) => [...section.querySelectorAll(':scope > div[data-block-index]')]);

const getLiveSections = (root) => [...root.querySelectorAll('div.section')]
  .filter((section) => !section.parentElement.closest('.block'));

const getLiveBlocks = (sections) => sections
  .flatMap((section) => [...section.querySelectorAll(':scope > div > .block')]);

function collectIndices(root) {
  return [...root.querySelectorAll(INDEX_ATTRS.map((attr) => `[${attr}]`).join(','))]
    .filter((el) => !el.closest(OVERLAY_SELECTOR))
    .flatMap((el) => INDEX_ATTRS
      .filter((attr) => el.hasAttribute(attr))
      .map((attr) => ({ el, attr, value: Number(el.getAttribute(attr)) })))
    .filter(({ value }) => Number.isFinite(value));
}

// Without a `ref` everything counts as before it (e.g. appending after the last section).
function splitAround(entries, ref, insideIsAfter = false) {
  return entries.reduce((parts, entry) => {
    if (!ref) {
      parts.before.push(entry);
    } else if (ref.contains(entry.el)) {
      if (insideIsAfter) parts.after.push(entry);
    // eslint-disable-next-line no-bitwise
    } else if (ref.compareDocumentPosition(entry.el) & Node.DOCUMENT_POSITION_PRECEDING) {
      parts.before.push(entry);
    } else {
      parts.after.push(entry);
    }
    return parts;
  }, { before: [], after: [] });
}

function valueSets(entries) {
  return entries.reduce((sets, { attr, value }) => {
    (sets[attr] ??= new Set()).add(value);
    return sets;
  }, {});
}

const fitsWithOffset = (entries, sets, offset) => entries
  .every(({ attr, value }) => sets[attr]?.has(value + offset));

// DOM kept after the change still has pre-edit positions; find the one shift mapping all of it.
function findOffset(live, source) {
  if (!live.length) return 0;
  const sets = valueSets(source);
  const [{ attr, value }] = live;
  const expected = Math.min(...source.map((e) => e.value)) - Math.min(...live.map((e) => e.value));
  return [...(sets[attr] ?? [])]
    .map((candidate) => candidate - value)
    .sort((a, b) => Math.abs(a - expected) - Math.abs(b - expected))
    .find((offset) => fitsWithOffset(live, sets, offset));
}

// Re-keys indices on the DOM that stays; false (and no changes) when that is ambiguous.
function rekeyKept({
  live, source, liveRef, sourceRef, liveInsideIsAfter, sourceInsideIsAfter,
}) {
  const kept = splitAround(collectIndices(live), liveRef, liveInsideIsAfter);
  const fresh = splitAround(collectIndices(source), sourceRef, sourceInsideIsAfter);
  if (!fitsWithOffset(kept.before, valueSets(fresh.before), 0)) return false;
  const offset = findOffset(kept.after, fresh.after);
  if (offset === undefined) return false;
  kept.after.forEach(({ el, attr, value }) => el.setAttribute(attr, value + offset));
  return true;
}

function replaceSection({ source, live, type, sectionIndex }) {
  const sourceSections = getSourceSections(source);
  const liveSections = getLiveSections(live);
  const diff = sourceSections.length - liveSections.length;
  const next = sourceSections[sectionIndex];
  const prev = liveSections[sectionIndex];

  if (type === 'section-removed') {
    if (diff !== -1 || !prev) return undefined;
    if (!rekeyKept({
      live, source, liveRef: prev, sourceRef: next, sourceInsideIsAfter: true,
    })) return undefined;
    prev.remove();
    return { type: 'section-removed' };
  }
  if (type === 'section-added') {
    const anchor = liveSections[sectionIndex - 1];
    if (diff !== 1 || !next || (!prev && !anchor)) return undefined;
    if (!rekeyKept({
      live, source, liveRef: prev, liveInsideIsAfter: true, sourceRef: next,
    })) return undefined;
    const el = next.cloneNode(true);
    if (prev) prev.before(el);
    else anchor.after(el);
    return { type: 'section', el };
  }
  if (diff !== 0 || !next || !prev) return undefined;
  if (!rekeyKept({ live, source, liveRef: prev, sourceRef: next })) return undefined;
  const el = next.cloneNode(true);
  prev.replaceWith(el);
  return { type: 'section', el };
}

function replaceBlock({ source, live, blockIndex }) {
  const sourceBlocks = getSourceBlocks(getSourceSections(source));
  const liveBlocks = getLiveBlocks(getLiveSections(live));
  const next = sourceBlocks[blockIndex];
  const prev = liveBlocks[blockIndex];
  if (!next || !prev || sourceBlocks.length !== liveBlocks.length) return undefined;
  const aligned = sourceBlocks
    .every((block, i) => i === blockIndex || liveBlocks[i].classList.contains(block.classList[0]));
  if (!aligned || !rekeyKept({ live, source, liveRef: prev, sourceRef: next })) return undefined;
  const el = next.cloneNode(true);
  prev.replaceWith(el);
  return { type: 'block', el };
}

function replaceScope({ source, live, rerenderScope }) {
  const { type, sectionIndex, blockIndex } = rerenderScope ?? {};
  if (type === 'block') {
    return replaceBlock({ source, live, blockIndex })
      ?? replaceSection({ source, live, type: 'section', sectionIndex });
  }
  if (['section', 'section-added', 'section-removed'].includes(type)) {
    return replaceSection({ source, live, type, sectionIndex });
  }
  return undefined;
}

function getLiveRoot(targetDocument) {
  const { body } = targetDocument;
  const existing = body.querySelector('main');
  if (existing) return existing;
  const main = targetDocument.createElement('main');
  const header = body.querySelector(':scope > header');
  if (header) header.after(main);
  else body.prepend(main);
  return main;
}

/**
 * Without `ctx.partialReload` the whole body is replaced (the legacy `loadPage` contract).
 * With it, updates stay inside main and scoped blocks/sections are returned undecorated
 * as `replaced.el`, falling back to replacing all of main when necessary.
 */
export function replaceChanges({
  ctx, doc, rerenderScope, targetDocument,
}) {
  if (!ctx.partialReload) {
    targetDocument.body.innerHTML = doc.body.innerHTML;
    return undefined;
  }
  const source = doc.body.querySelector('main')
    ?? doc.createElement('main');
  const live = getLiveRoot(targetDocument);
  const replaced = replaceScope({ source, live, rerenderScope });
  if (replaced) return replaced;
  live.innerHTML = source.innerHTML;
  return undefined;
}
