/**
 * Block-level three-way merge (diff3 style) used by the smart-overwrite rollout.
 * See docs/rollout-smart-overwrite.md for the rules.
 */

function lcsMatches(a, b) {
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

// Puts reordered upstream sections back in baseline order as whole units, so blocks edited inside
// a moved section (e.g. its section metadata) stay with that section.
function revertSectionMoves({ base, source }) {
  const breaks = new Set(toHashes(source.filter(isSection)));
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

function withoutMoves({ base, source: upstream }) {
  const upstreamMatches = lcsMatches(base, toHashes(upstream));
  if (upstreamMatches.size === base.length) return { blocks: upstream, matches: upstreamMatches };
  const source = revertSectionMoves({ base, source: upstream });
  const matches = source === upstream ? upstreamMatches : lcsMatches(base, toHashes(source));
  const moves = getMoves({ base, source, matches });
  if (!moves.size) return { blocks: source, matches };
  return {
    blocks: revertMoves({
      base, source, matches, moves,
    }),
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

function resolveCluster({ cluster, dest, toDest }) {
  const { sourceHunks, destHunks, type } = cluster;
  const keepDest = () => destRange({ ...cluster, hunks: destHunks, dest, toDest });
  const sourceBlocks = sourceHunks.flatMap((hunk) => hunk.blocks);
  if (type === 'dest' || type === 'same') return { blocks: keepDest(), skipped: 0 };
  if (type === 'source') return { blocks: sourceBlocks, skipped: 0 };
  if (type === 'inserts') {
    const destBlocks = keepDest();
    if (isAmbiguousInsert(destBlocks) || isAmbiguousInsert(sourceBlocks)) {
      return { blocks: destBlocks, skipped: sourceHunks.length };
    }
    return { blocks: mergeInserts(destBlocks, sourceBlocks), skipped: 0 };
  }
  return { blocks: keepDest(), skipped: sourceHunks.length };
}

const opensEmptySection = (blocks, idx) => isSection(blocks[idx])
  && (idx === blocks.length - 1 || isSection(blocks[idx + 1]));

const hasEmptySection = (blocks) => blocks.some((_, idx) => opensEmptySection(blocks, idx));

const tidySections = (blocks) => blocks.filter((_, idx) => !opensEmptySection(blocks, idx));

/**
 * @param {Object} params
 * @param {String[]} params.base ordered block hashes at the last rollout
 * @param {{ hash: String }[]} params.source current upstream blocks
 * @param {{ hash: String }[]} params.dest current destination blocks
 * @returns {{ blocks: Object[], skipped: Number, baseline: String[] }} `baseline` is the upstream
 *   order that was merged (with unapplied moves reverted); it becomes the next base
 */
export default function threeWayMerge({ base, source, dest }) {
  const baseKey = base.join();
  const baseline = toHashes(source);
  if (baseline.join() === baseKey) return { blocks: dest, skipped: 0, baseline };
  if (toHashes(dest).join() === baseKey) return { blocks: source, skipped: 0, baseline };
  if (baseline.join() === toHashes(dest).join()) return { blocks: dest, skipped: 0, baseline };
  const { blocks: merged, matches } = withoutMoves({ base, source });
  const destDiff = getHunks({ base, blocks: dest, side: 'dest' });
  const toDest = destDiff.matches;
  const sourceDiff = getHunks({
    base, blocks: merged, side: 'source', matches,
  });
  const clusters = getClusters([...sourceDiff.hunks, ...destDiff.hunks]).map(classify);

  const blocks = [];
  const end = clusters.reduce((acc, cluster) => {
    blocks.push(...destRange({
      start: acc.pos, end: cluster.start, hunks: [], dest, toDest,
    }));
    const resolved = resolveCluster({ cluster, dest, toDest });
    blocks.push(...resolved.blocks);
    return { pos: cluster.end, skipped: acc.skipped + resolved.skipped };
  }, { pos: 0, skipped: 0 });
  blocks.push(...destRange({
    start: end.pos, end: base.length, hunks: [], dest, toDest,
  }));
  const keepAsIs = hasEmptySection(dest) || hasEmptySection(source);
  return {
    blocks: keepAsIs ? blocks : tidySections(blocks),
    skipped: end.skipped,
    baseline: toHashes(merged),
  };
}
