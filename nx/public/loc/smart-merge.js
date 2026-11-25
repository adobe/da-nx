/**
 * Block-level three-way merge (diff3 style) used by the smart-overwrite rollout.
 * See docs/rollout-smart-overwrite.md for the rules.
 */

function tableMatches(a, b) {
  const table = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i][j] = a[i] === b[j]
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const matches = new Map();
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      matches.set(i, j);
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return matches;
}

// Matching the shared prefix up front gives the same result as the table and keeps it small.
function lcsMatches(a, b) {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  const rest = tableMatches(a.slice(start), b.slice(start));
  return new Map([
    ...Array.from({ length: start }, (_, idx) => [idx, idx]),
    ...[...rest].map(([i, j]) => [i + start, j + start]),
  ]);
}

const toHashes = (blocks) => blocks.map(({ hash }) => hash);

const isSection = ({ block }) => !!block?.isSection;

// An insert ending in a section break right after a section break is the same document as a
// whole new section inserted before it. Using that form keeps concurrent new sections apart.
function asWholeSections(hunk, base) {
  const last = hunk.blocks[hunk.blocks.length - 1];
  if (hunk.start !== hunk.end || !hunk.start || !last || !isSection(last)) return hunk;
  if (base[hunk.start - 1] !== last.hash) return hunk;
  const start = hunk.start - 1;
  return { start, end: start, blocks: [last, ...hunk.blocks.slice(0, -1)] };
}

function splitInPlace(hunk) {
  const { start, end, blocks } = hunk;
  if (end - start < 2 || blocks.length !== end - start) return [hunk];
  return blocks.map((block, idx) => ({
    start: start + idx, end: start + idx + 1, blocks: [block],
  }));
}

function getHunks({
  base, blocks, side, matches = lcsMatches(base, toHashes(blocks)),
}) {
  const anchors = [...matches.entries(), [base.length, blocks.length]];
  const { hunks } = anchors.reduce((acc, [b, s]) => {
    if (b > acc.b + 1 || s > acc.s + 1) {
      acc.hunks.push({ start: acc.b + 1, end: b, blocks: blocks.slice(acc.s + 1, s) });
    }
    return { hunks: acc.hunks, b, s };
  }, { hunks: [], b: -1, s: -1 });
  return {
    matches,
    hunks: hunks
      .map((hunk) => asWholeSections(hunk, base))
      .flatMap(splitInPlace)
      .map((hunk) => ({ ...hunk, side })),
  };
}

function conflicts(hunk, cluster) {
  const { start: a, end: b } = hunk;
  const { start: c, end: d } = cluster;
  if (a < d && c < b) return true;
  if (a === b && c === d) return a === c;
  if (a === b) return c < a && a < d;
  if (c === d) return a < c && c < b;
  return false;
}

function getClusters(hunks) {
  const sorted = [...hunks].sort((x, y) => x.start - y.start || x.end - y.end);
  return sorted.reduce((clusters, hunk) => {
    const last = clusters[clusters.length - 1];
    if (last && conflicts(hunk, last)) {
      last.start = Math.min(last.start, hunk.start);
      last.end = Math.max(last.end, hunk.end);
      last.hunks.push(hunk);
    } else {
      clusters.push({ start: hunk.start, end: hunk.end, hunks: [hunk] });
    }
    return clusters;
  }, []);
}

function countHashes(hashes) {
  return hashes.reduce((acc, hash) => acc.set(hash, (acc.get(hash) || 0) + 1), new Map());
}

function withoutPresent(blocks, present) {
  const remaining = countHashes(toHashes(present));
  return blocks.filter(({ hash }) => {
    if (!remaining.get(hash)) return true;
    remaining.set(hash, remaining.get(hash) - 1);
    return false;
  });
}

function splitSections(blocks) {
  const first = blocks.findIndex(isSection);
  if (first === -1) return { loose: blocks, sections: [] };
  const sections = blocks.slice(first).reduce((acc, block) => {
    if (isSection(block)) acc.push([]);
    acc[acc.length - 1].push(block);
    return acc;
  }, []);
  return { loose: blocks.slice(0, first), sections };
}

// Both sides inserted at the same spot: keep the destination's blocks plus the upstream blocks
// it does not already have. New sections are compared whole so their boundaries survive.
function mergeInserts(destBlocks, sourceBlocks) {
  const dest = splitSections(destBlocks);
  const source = splitSections(sourceBlocks);
  const asKeyed = (sections) => sections
    .map((section) => ({ hash: toHashes(section).join(), section }));
  const newSections = withoutPresent(asKeyed(source.sections), asKeyed(dest.sections));
  return [
    ...dest.loose,
    ...withoutPresent(source.loose, dest.loose),
    ...dest.sections.flat(),
    ...newSections.flatMap(({ section }) => section),
  ];
}

const sameHunk = (x, y) => x.start === y.start && x.end === y.end
  && toHashes(x.blocks).join() === toHashes(y.blocks).join();

const sameHunks = (x, y) => x.length === y.length && x.every((hunk, idx) => sameHunk(hunk, y[idx]));

function classify(cluster) {
  const sourceHunks = cluster.hunks.filter((hunk) => hunk.side === 'source');
  const destHunks = cluster.hunks.filter((hunk) => hunk.side === 'dest');
  const type = (() => {
    if (!sourceHunks.length) return 'dest';
    if (!destHunks.length) return 'source';
    if (sameHunks(sourceHunks, destHunks)) return 'same';
    if (cluster.start === cluster.end) return 'inserts';
    return 'conflict';
  })();
  return { ...cluster, sourceHunks, destHunks, type };
}

function getMoves({ base, source, matches }) {
  const matched = countHashes([...matches.keys()].map((idx) => base[idx]));
  const sourceCounts = countHashes(toHashes(source));
  return new Map([...countHashes(base)]
    .map(([hash, n]) => {
      const m = matched.get(hash) || 0;
      return [hash, Math.min(n - m, (sourceCounts.get(hash) || 0) - m)];
    })
    .filter(([, n]) => n > 0));
}

// Like merge, upstream reorders are not applied when the destination has its own changes: moved
// blocks are put back in their baseline position before merging.
function revertMoves({
  base, source, matches, moves,
}) {
  const restoreBudget = new Map(moves);
  const dropBudget = new Map(moves);
  const take = (budget, hash) => {
    if (!budget.get(hash)) return false;
    budget.set(hash, budget.get(hash) - 1);
    return true;
  };
  const matchedIdx = new Set(matches.values());
  const pool = new Map([...moves.keys()].map((hash) => [hash, []]));
  source.forEach((block, idx) => {
    if (!matchedIdx.has(idx) && pool.has(block.hash)) pool.get(block.hash).push(block);
  });
  const blocks = [];
  const anchors = [...matches.entries(), [base.length, source.length]];
  anchors.reduce((prev, [b, s]) => {
    base.slice(prev.b + 1, b)
      .filter((hash) => take(restoreBudget, hash))
      .forEach((hash) => blocks.push(pool.get(hash).shift()));
    source.slice(prev.s + 1, s)
      .filter(({ hash }) => !take(dropBudget, hash))
      .forEach((block) => blocks.push(block));
    if (s < source.length) blocks.push(source[s]);
    return { b, s };
  }, { b: -1, s: -1 });
  return blocks;
}

const groupBySection = (items, isBreak) => items.reduce((acc, item) => {
  if (isBreak(item) || !acc.length) acc.push([]);
  acc[acc.length - 1].push(item);
  return acc;
}, []);

// Puts reordered upstream sections back in baseline order as whole units. Breaks also come from the
// destination, so a section whose wrapper changed upstream is still found in the baseline.
function revertSectionMoves({ base, source, dest = [] }) {
  const breaks = new Set(toHashes([...source, ...dest].filter(isSection)));
  if (!breaks.size) return source;
  // A section is identified only by blocks that appear in exactly one baseline section.
  const baseGroups = groupBySection(base, (hash) => breaks.has(hash))
    .map((hashes) => hashes.filter((hash) => !breaks.has(hash)));
  const owners = baseGroups.reduce((acc, hashes, j) => {
    new Set(hashes).forEach((hash) => acc.set(hash, acc.has(hash) ? -1 : j));
    return acc;
  }, new Map());
  const groups = groupBySection(source, isSection);
  const matched = groups.reduce((acc, group, i) => {
    const ids = new Set(group.map(({ hash }) => owners.get(hash)).filter((j) => j >= 0));
    if (ids.size === 1) acc.set(i, [...ids][0]);
    return acc;
  }, new Map());
  const targets = [...matched.values()];
  if (new Set(targets).size !== targets.length) return source;
  const order = groups.map((_, i) => matched.get(i)).filter((j) => j !== undefined);
  if (order.every((j, idx) => !idx || order[idx - 1] < j)) return source;
  const units = groups.reduce((acc, group, i) => {
    if (matched.has(i) || !acc.length) acc.push({ key: matched.get(i) ?? -1, blocks: [...group] });
    else acc[acc.length - 1].blocks.push(...group);
    return acc;
  }, []);
  return [...units].sort((x, y) => x.key - y.key).flatMap(({ blocks }) => blocks);
}

// Content only the page has: blocks and section breaks it added that are not in the baseline.
// Blocks the page edited one for one count as the baseline blocks they replaced.
function pageOnlyBlocks({ base, dest }) {
  const inBase = new Set(base);
  const added = new Set(getHunks({ base, blocks: dest, side: 'dest' }).hunks
    .filter(({ start, end, blocks }) => blocks.length !== end - start)
    .flatMap(({ blocks }) => blocks));
  return dest.filter((block) => !inBase.has(block.hash) && (added.has(block) || isSection(block)));
}

// Moves of blocks the page left as they were (see rule 4 in rollout-smart-overwrite.md).
function safeMoves({ base, dest, moves }) {
  const destHashes = toHashes(dest);
  const kept = new Set([...lcsMatches(base, destHashes).keys()].map((idx) => base[idx]));
  const breaks = new Set(toHashes(dest.filter(isSection)));
  const baseCounts = countHashes(base);
  const destCounts = countHashes(destHashes);
  const once = (hash) => baseCounts.get(hash) === 1 && destCounts.get(hash) === 1;
  const destPos = new Map(destHashes.map((hash, idx) => [hash, idx]));
  const pairs = base.map((hash) => [hash, destPos.get(hash)]).filter(([hash]) => once(hash));
  const inOrder = (hash) => {
    const at = destPos.get(hash);
    const idx = pairs.findIndex(([other]) => other === hash);
    return pairs.every(([, pos], k) => k === idx || (k < idx) === (pos < at));
  };
  return [...moves.keys()].filter((hash) => !breaks.has(hash) && kept.has(hash) && once(hash)
    && inOrder(hash));
}

function withoutMoves({
  base, source: upstream, dest, applyMoves,
}) {
  const upstreamMatches = lcsMatches(base, toHashes(upstream));
  if (upstreamMatches.size === base.length) {
    return {
      blocks: upstream, matches: upstreamMatches, applied: [], reverted: false,
    };
  }
  const source = revertSectionMoves({ base, source: upstream, dest });
  const matches = source === upstream ? upstreamMatches : lcsMatches(base, toHashes(source));
  const found = getMoves({ base, source, matches });
  const applied = applyMoves ? safeMoves({ base, dest, moves: found }) : [];
  const moves = new Map([...found].filter(([hash]) => !applied.includes(hash)));
  const reverted = source !== upstream || moves.size > 0;
  if (!moves.size) {
    return {
      blocks: source, matches, applied, reverted,
    };
  }
  return {
    blocks: revertMoves({
      base, source, matches, moves,
    }),
    applied,
    reverted,
  };
}

function destRange({ start, end, hunks, dest, toDest }) {
  const blocks = [];
  const pushMatched = (from, to) => {
    for (let k = from; k < to; k += 1) {
      if (toDest.has(k)) blocks.push(dest[toDest.get(k)]);
    }
  };
  const pos = [...hunks].sort((x, y) => x.start - y.start).reduce((k, hunk) => {
    pushMatched(k, hunk.start);
    blocks.push(...hunk.blocks);
    return Math.max(k, hunk.end);
  }, start);
  pushMatched(pos, end);
  return blocks;
}

// Inserts with a section break after loose blocks also move later content into a new section.
// When both sides insert at one spot that can't be combined safely, so the destination wins.
const isAmbiguousInsert = (blocks) => blocks.some(isSection) && !isSection(blocks[0]);

const hasBreak = ({ block }) => !!block?.isSection
  || (Array.isArray(block) && block.some((el) => el?.isSection));

const withMark = (blocks, mark) => blocks.map((entry) => ({ ...entry, mark }));

const indexesOf = ({ start, end }) => Array.from({ length: end - start }, (_, idx) => start + idx);

// The page wins a conflict; uncertain ones are marked for review (see rollout-smart-overwrite.md).
function resolveConflict({ cluster, context }) {
  const { sourceHunks, destHunks } = cluster;
  const { dest, toDest, upstream } = context;
  const count = sourceHunks.length;
  const keepDest = (hunks = destHunks) => destRange({
    ...cluster, hunks, dest, toDest,
  });
  const destBlocks = keepDest();
  const flag = { blocks: destBlocks, review: count };
  const destTouched = new Set(destHunks.flatMap(indexesOf));
  const covered = (hunk) => hunk.start < hunk.end && hunk.blocks.length <= hunk.end - hunk.start
    && indexesOf(hunk).every((idx) => destTouched.has(idx));
  const deletes = sourceHunks.filter((hunk) => !hunk.blocks.length);
  const pageBlocks = destHunks.flatMap((hunk) => hunk.blocks);
  if (sourceHunks.every(covered)) {
    if (!deletes.length || !pageBlocks.length) return { blocks: destBlocks, skipped: count };
    const repeated = deletes.flatMap(indexesOf)
      .some((idx) => context.baseCounts.get(context.base[idx]) > 1);
    if (!repeated && !context.addsBlocks) {
      return { blocks: destBlocks, skipped: count, removedUpstream: deletes.length };
    }
    if (pageBlocks.some(hasBreak)) return flag;
    const marked = destHunks.map((hunk) => ({ ...hunk, blocks: withMark(hunk.blocks, 'local') }));
    return { blocks: keepDest(marked), review: count };
  }
  const upstreamBlocks = destRange({
    ...cluster, hunks: sourceHunks, dest: upstream, toDest: context.toSource,
  });
  if ([...upstreamBlocks, ...destBlocks].some(hasBreak)) return flag;
  return {
    blocks: [...withMark(upstreamBlocks, 'upstream'), ...withMark(destBlocks, 'local')],
    review: count,
  };
}

function resolveCluster({ cluster, context }) {
  const { sourceHunks, destHunks, type } = cluster;
  const { dest, toDest } = context;
  const keepDest = () => destRange({
    ...cluster, hunks: destHunks, dest, toDest,
  });
  const sourceBlocks = sourceHunks.flatMap((hunk) => hunk.blocks);
  if (type === 'dest' || type === 'same') return { blocks: keepDest() };
  if (type === 'source') return { blocks: sourceBlocks };
  if (type === 'inserts') {
    const destBlocks = keepDest();
    if (isAmbiguousInsert(destBlocks) || isAmbiguousInsert(sourceBlocks)) {
      return { blocks: destBlocks, review: sourceHunks.length };
    }
    return { blocks: mergeInserts(destBlocks, sourceBlocks) };
  }
  return resolveConflict({ cluster, context });
}

const opensEmptySection = (blocks, idx) => isSection(blocks[idx])
  && (idx === blocks.length - 1 || isSection(blocks[idx + 1]));

const hasEmptySection = (blocks) => blocks.some((_, idx) => opensEmptySection(blocks, idx));

const tidySections = (blocks) => blocks.filter((_, idx) => !opensEmptySection(blocks, idx));

// Removes new rejected blocks and sections holding only them; copies the base holds stay.
function withoutRejected({ base, source, rejected }) {
  if (!source.some(({ hash }) => rejected.has(hash))) return source;
  const inBase = countHashes(base.filter((hash) => rejected.has(hash)));
  const isRejected = ({ hash }) => {
    if (!rejected.has(hash)) return false;
    const left = inBase.get(hash) || 0;
    inBase.set(hash, left - 1);
    return left <= 0;
  };
  const removed = new Set(source.filter(isRejected));
  const kept = groupBySection(source, isSection).flatMap((section) => {
    const opens = isSection(section[0]);
    const content = opens ? section.slice(1) : section;
    const blocks = content.filter((block) => !removed.has(block));
    if (opens && content.length && !blocks.length) return [];
    return opens ? [section[0], ...blocks] : blocks;
  });
  // A page keeps one section (the last, as the empty-page copy does): a saved empty page has one.
  return kept.length ? kept : source.filter(isSection).slice(-1);
}

// A block edited in place counts as the baseline block it replaced.
const asBase = ({ blocks, base, hunks }) => {
  const identities = new Map(hunks
    .filter(({ start, end, blocks: edited }) => end - start === edited.length)
    .flatMap(({ start, blocks: edited }) => edited
      .map((entry, idx) => [entry, base[start + idx]])));
  return blocks.map((entry) => ({ ...entry, hash: identities.get(entry) ?? entry.hash }));
};

const numbered = (hashes) => hashes.reduce((acc, hash) => {
  acc.seen.set(hash, (acc.seen.get(hash) || 0) + 1);
  acc.list.push(`${hash}#${acc.seen.get(hash)}`);
  return acc;
}, { seen: new Map(), list: [] }).list;

// Blocks upstream swapped, when the page keeps any pair of them in baseline order (see docs).
function keptSwaps({
  ours, theirs, upstream, base, next,
}) {
  const breaks = (list) => countHashes(toHashes(list.filter(isSection)));
  const [ourBreaks, theirBreaks, baseCounts] = [breaks(ours), breaks(theirs), countHashes(base)];
  // Which blocks count depends on upstream and the baseline only, never on page edits.
  const keeps = (block) => !isSection(block)
    || (theirBreaks.get(block.hash) === 1 && (baseCounts.get(block.hash) ?? 0) <= 1);
  const onlyOnce = (block) => keeps(block)
    && (!isSection(block) || ourBreaks.get(block.hash) === 1);
  const positions = (hashes) => new Map(hashes.map((hash, idx) => [hash, idx]));
  const mine = positions(numbered(toHashes(ours.filter(onlyOnce))));
  const counted = theirs.map((block, idx) => (keeps(block) ? idx : -1)).filter((idx) => idx >= 0);
  const ids = numbered(counted.map((idx) => theirs[idx].hash));
  const raw = numbered(counted.map((idx) => upstream[idx].hash));
  const inBase = positions(numbered(base));
  const all = ids.map((_, idx) => idx);
  const onPage = all.filter((idx) => mine.has(ids[idx]));
  const pageKeeps = onPage.some((first, idx) => onPage.some((later, at) => (
    at > idx && inBase.has(ids[first]) && inBase.has(ids[later])
    && inBase.get(ids[later]) < inBase.get(ids[first])
    && mine.get(ids[later]) < mine.get(ids[first]))));
  if (!pageKeeps) return { swaps: [], swapsAsBase: [] };
  // The swapped blocks in upstream's order, then in the baseline's: together they define the pairs.
  const swapped = ({ names, order }) => {
    const listed = all.filter((idx) => order.has(names[idx]));
    const at = listed.map((idx) => order.get(names[idx]));
    const maxBefore = [];
    at.forEach((pos, idx) => maxBefore.push(Math.max(maxBefore[idx - 1] ?? -1, pos)));
    const minAfter = [];
    [...at].reverse()
      .forEach((pos, idx) => minAfter.push(Math.min(minAfter[idx - 1] ?? Infinity, pos)));
    minAfter.reverse();
    const moved = listed
      .filter((_, idx) => maxBefore[idx - 1] > at[idx] || minAfter[idx + 1] < at[idx])
      .map((idx) => names[idx]);
    return [...moved, '|', ...[...moved].sort((one, other) => order.get(one) - order.get(other))];
  };
  return {
    swaps: swapped({ names: raw, order: positions(numbered(next)) }),
    swapsAsBase: swapped({ names: ids, order: inBase }),
  };
}

// An upstream insert at the end of a section the page removed lands in the section before it.
const endsRemovedSection = ({
  hunk, cluster, isBreak, size,
}) => hunk.side === 'source' && hunk.start === hunk.end && !isSection(hunk.blocks[0])
  && hunk.start === cluster.end
  && (hunk.start === size || isBreak(hunk.start))
  && cluster.hunks.some((other) => other.side === 'dest' && other.end === hunk.start
    && indexesOf(other).some(isBreak) && !other.blocks.some(hasBreak));

function mergeBlocks({
  base, source, dest, applyMoves,
}) {
  const {
    blocks: merged, matches, applied, reverted,
  } = withoutMoves({
    base, source, dest, applyMoves,
  });
  const destDiff = getHunks({ base, blocks: dest, side: 'dest' });
  const sourceDiff = getHunks({
    base, blocks: merged, side: 'source', matches,
  });
  const isBreak = (idx) => [[sourceDiff.matches, merged], [destDiff.matches, dest]]
    .some(([toSide, side]) => toSide.has(idx) && isSection(side[toSide.get(idx)]));
  const clusters = getClusters([...sourceDiff.hunks, ...destDiff.hunks]).map(classify);
  const misplaced = clusters.filter((cluster, idx) => idx && endsRemovedSection({
    hunk: cluster.hunks[0], cluster: clusters[idx - 1], isBreak, size: base.length,
  })).length;
  const inBase = new Set(base);
  // Only blocks upstream inserted could be a moved, edited block; in-place edits can't.
  const inserted = sourceDiff.hunks.filter((hunk) => hunk.blocks.length > hunk.end - hunk.start)
    .flatMap((hunk) => hunk.blocks);
  const context = {
    base,
    baseCounts: countHashes(base),
    dest,
    toDest: destDiff.matches,
    upstream: merged,
    toSource: sourceDiff.matches,
    addsBlocks: inserted.some((block) => !isSection(block) && !inBase.has(block.hash)),
  };

  const blocks = [];
  const add = (acc, resolved) => ({
    skipped: acc.skipped + (resolved.skipped || 0),
    review: acc.review + (resolved.review || 0),
    removedUpstream: acc.removedUpstream + (resolved.removedUpstream || 0),
  });
  const end = clusters.reduce((acc, cluster, group) => {
    blocks.push(...destRange({
      start: acc.pos, end: cluster.start, hunks: [], dest, toDest: context.toDest,
    }));
    const resolved = resolveCluster({ cluster, context });
    const tagged = resolved.blocks
      .map((entry) => (entry.mark ? { ...entry, group } : entry));
    blocks.push(...tagged);
    return { pos: cluster.end, ...add(acc, resolved) };
  }, {
    pos: 0, skipped: 0, review: 0, removedUpstream: 0,
  });
  blocks.push(...destRange({
    start: end.pos, end: base.length, hunks: [], dest, toDest: context.toDest,
  }));
  const keepAsIs = hasEmptySection(dest) || hasEmptySection(source);
  const result = keepAsIs ? blocks : tidySections(blocks);
  const { swaps, swapsAsBase } = reverted ? keptSwaps({
    ours: asBase({ blocks: result, base, hunks: [...destDiff.hunks, ...sourceDiff.hunks] }),
    theirs: asBase({ blocks: source, base, hunks: sourceDiff.hunks }),
    upstream: source,
    base,
    next: toHashes(merged),
  }) : { swaps: [], swapsAsBase: [] };
  return {
    blocks: result,
    skipped: end.skipped,
    review: end.review + misplaced,
    removedUpstream: end.removedUpstream,
    reordered: swapsAsBase.length > 0,
    swaps,
    swapsAsBase,
    baseline: toHashes(merged),
    applied,
  };
}

const markedHashes = (blocks) => countHashes(blocks.map(({ hash, mark }) => `${mark}:${hash}`));

const sameBlocks = (one, other) => {
  const counts = markedHashes(one);
  const others = markedHashes(other);
  return counts.size === others.size
    && [...counts].every(([hash, count]) => others.get(hash) === count);
};

// Applied moves may only change the order: same blocks and sections, no more unresolved changes,
// and no moved block lands on the other side of content only the page has.
const keepsApplied = ({ tried, plain, pageOnly }) => {
  const pageOnlyBefore = (blocks, hash) => blocks
    .slice(0, blocks.findIndex((block) => block.hash === hash))
    .filter((block) => pageOnly.has(block.hash))
    .map((block) => block.hash)
    .join();
  return sameBlocks(tried.blocks, plain.blocks)
    && ['skipped', 'review', 'removedUpstream'].every((key) => tried[key] === plain[key])
    && tried.applied.every((hash) => pageOnlyBefore(tried.blocks, hash)
      === pageOnlyBefore(plain.blocks, hash));
};

/**
 * @param {Object} params
 * @param {String[]} params.base ordered block hashes at the last rollout
 * @param {{ hash: String }[]} params.source current upstream blocks
 * @param {{ hash: String }[]} params.dest current destination blocks
 * @param {Set<String>} [params.rejected] upstream block hashes rejected in a merge review
 * @returns {{ blocks: Object[], skipped: Number, review: Number, removedUpstream: Number,
 *   reordered: Boolean, swaps: String[], swapsAsBase: String[], baseline: String[] }}
 *   `baseline` becomes the next base. Fields and conflict rows: docs/rollout-smart-overwrite.md
 */
export default function threeWayMerge({
  base, source: upstream, dest, rejected = new Set(),
}) {
  const source = withoutRejected({ base, source: upstream, rejected });
  const baseKey = base.join();
  const baseline = toHashes(source);
  const clean = (blocks) => ({
    blocks,
    skipped: 0,
    review: 0,
    removedUpstream: 0,
    reordered: false,
    swaps: [],
    swapsAsBase: [],
    baseline,
  });
  if (baseline.join() === baseKey) return clean(dest);
  if (toHashes(dest).join() === baseKey) return clean(source);
  if (baseline.join() === toHashes(dest).join()) return clean(dest);
  const params = { base, source, dest };
  const tried = mergeBlocks({ ...params, applyMoves: true });
  const plain = tried.applied.length ? mergeBlocks(params) : tried;
  const upstreamHashes = new Set(baseline);
  const pageOnly = new Set(toHashes(pageOnlyBlocks({ base, dest }))
    .filter((hash) => !upstreamHashes.has(hash)));
  const { applied: _, ...result } = keepsApplied({ tried, plain, pageOnly }) ? tried : plain;
  return result;
}
