import { expect } from '@esm-bundle/chai';
import threeWayMerge from '../../nx/public/loc/smart-merge.js';

const toBlocks = (str) => (str ? str.split(' ') : [])
  .map((hash) => ({ hash, block: hash === '|' ? { isSection: true } : {} }));
const run = ({
  base, source, dest, rejected,
}) => {
  const { blocks, skipped } = threeWayMerge({
    base: base ? base.split(' ') : [],
    source: toBlocks(source),
    dest: toBlocks(dest),
    rejected: new Set(rejected ? rejected.split(' ') : []),
  });
  return { result: blocks.map(({ hash }) => hash).join(' '), skipped };
};

describe('threeWayMerge', () => {
  const cases = [
    ['applies upstream when the destination is unchanged', 'A B C', 'A X C D', 'A B C', 'A X C D', 0],
    ['keeps the destination when upstream is unchanged', 'A B C', 'A B C', 'L B', 'L B', 0],
    ['keeps identical changes without skips', 'A B C', 'A X C', 'A X C', 'A X C', 0],
    ['applies an upstream edit next to a local edit', 'A B C', 'A B2 C', 'L B C', 'L B2 C', 0],
    ['keeps the local version when both edited a block', 'A B C', 'A G C', 'A L C', 'A L C', 1],
    ['applies an upstream insert next to a localized block', 'A B C', 'A X B C', 'A L C', 'A X L C', 0],
    ['keeps both inserts at the same spot', 'A C', 'A X C', 'A Y C', 'A Y X C', 0],
    ['does not duplicate an insert the destination already has', 'A C', 'A X C', 'A X Y C', 'A X Y C', 0],
    ['applies a new duplicate of a localized block', 'A B C', 'A A B C', 'L B C', 'L A B C', 0],
    ['keeps a local deletion when upstream is unchanged', 'A B C', 'A B C', 'A C', 'A C', 0],
    ['keeps a local deletion when upstream edited the block', 'A B C', 'A B2 C', 'A C', 'A C', 1],
    ['applies an upstream deletion of an unchanged block', 'A B C', 'A C', 'A B C', 'A C', 0],
    ['keeps a local edit of a block upstream deleted', 'A B C', 'A C', 'A L C', 'A L C', 1],
    ['merges against an empty base', '', 'N', 'L', 'L N', 0],
    ['keeps a destination emptied on purpose', 'A B', 'A B', '', '', 0],
    ['applies in-place upstream edits around a conflict', 'A B C', 'A2 B2 C', 'L B C', 'L B2 C', 1],
    ['applies a new copy alongside a move both sides made', 'A B C', 'B A C A', 'B A C', 'B A C A', 0],
    ['keeps sections both sides added at the same spot', 'A', 'A | G', 'A | L', 'A | L | G', 0],
    ['does not duplicate a section both sides added', 'A', 'A | X', 'A | X | L', 'A | X | L', 0],
    ['keeps repeated sections upstream added', 'A', 'A | X | X', 'A | X', 'A | X | X', 0],
    ['keeps sections both sides prepended apart', '| A', '| G | A', '| L | A', '| L | G | A', 0],
    ['keeps sections both sides inserted between sections apart', '| A | B', '| A | G | B', '| A | L | B', '| A | L | G | B', 0],
    ['ignores an upstream section swap while the destination has edits', 'A | B', 'B | A', 'L | B', 'L | B', 0],
    ['ignores upstream moves while the destination has edits', 'A B C D', 'B A C D', 'A B C L', 'A B C L', 0],
    ['applies upstream moves when the destination is unchanged', 'A B C', 'B A C', 'A B C', 'B A C', 0],
    ['keeps a local reorder and applies an upstream edit', 'A B C', 'A B2 C', 'B A C', 'B2 A C', 0],
    ['keeps edits with their section when upstream reorders sections', '| A MA | B MB', '| B MB2 | A MA', '| AL MA | B MB', '| AL MA | B MB2', 0],
    ['keeps a new copy of a section upstream prepended', '| A | B', '| B | A | B', '| L | B', '| B | L | B', 0],
    ['does not swap sections that only share blocks', '| A X | A Y', '| A Y | A Z', '| L X | A Y', '| L | A Y Z', 0],
  ];

  cases.forEach(([name, base, source, dest, expected, skipped]) => {
    it(name, () => {
      expect(run({ base, source, dest })).to.deep.equal({ result: expected, skipped });
    });
  });

  // Rejected blocks: as if upstream never had them (docs/rollout-smart-overwrite.md).
  const rejectedCases = [
    ['keeps a rejected upstream insert out', 'A C', 'A N C', 'A C', 'N', 'A C', 0],
    ['keeps a rejected insert out when both sides insert at one spot', 'A C', 'A N C', 'A Y C', 'N', 'A Y C', 0],
    ['applies upstream edits when other blocks are rejected', 'A B', 'A2 B', 'A B', 'X', 'A2 B', 0],
    ['keeps an upstream insert next to a rejected one', 'A B', 'A N R B', 'A B', 'R', 'A N B', 0],
    ['keeps the rest of an upstream section with a rejected block', 'A', 'A | N R', 'A', 'R', 'A | N', 0],
    ['applies the rest of a replacement that holds a rejected block', 'A B C', 'A N R C', 'A B C', 'R', 'A N C', 0],
    ['deletes a block upstream replaced with only rejected blocks', 'A B C', 'A R C', 'A B C', 'R', 'A C', 0],
    ['applies upstream changes around a rejected edit next to a local edit', 'A B C', 'A2 B C', 'A B L', 'A2', 'B L', 0],
    ['applies an upstream edit next to a rejected block left out earlier', 'A N B', 'A N2 R B', 'A N B', 'R', 'A N2 B', 0],
    ['applies an upstream move next to a rejected insert on an unchanged page', 'A B C', 'A R C B', 'A B C', 'R', 'A C B', 0],
    ['applies an upstream move to the end next to a rejected insert', 'A X B', 'R X A B', 'A X B', 'R', 'X A B', 0],
    ['applies an upstream reorder when the rejected block was already received', 'R A B', 'R B A', 'R A B', 'R', 'R B A', 0],
    ['treats a rejected block the page already received as content', 'A R B', 'A R B2', 'A R B', 'R', 'A R B2', 0],
    ['keeps the author\'s block over a rejected edit a review recorded', 'A2 B', 'A2 B2', 'A B', 'A2', 'A B2', 0],
    ['leaves out an extra copy of a rejected block the base already has', 'A R B', 'A R B R', 'A B', 'R', 'A B', 0],
    ['leaves out a rejected block that replaced another upstream', 'A R B', 'A R R', 'A B', 'R', 'A', 0],
  ];

  rejectedCases.forEach(([name, base, source, dest, rejected, expected, skipped]) => {
    it(name, () => {
      expect(run({
        base, source, dest, rejected,
      })).to.deep.equal({ result: expected, skipped });
    });
  });

  const sectioned = (str) => str.split(' ')
    .map((hash) => ({ hash, block: hash.startsWith('S') ? { isSection: true } : {} }));
  const hashesOf = (list) => list.map(({ hash }) => hash).join(' ');

  it('leaves out a section that held only rejected blocks, also for later rollouts', () => {
    const rejected = new Set(['R']);
    const first = threeWayMerge({
      base: ['S1', 'A'], source: sectioned('S1 A S2 R'), dest: sectioned('S1 A'), rejected,
    });
    expect(hashesOf(first.blocks)).to.equal('S1 A');
    expect(first.baseline).to.deep.equal(['S1', 'A']);
    const second = threeWayMerge({
      base: first.baseline, source: sectioned('S1 A S2 N'), dest: first.blocks, rejected,
    });
    expect(hashesOf(second.blocks)).to.equal('S1 A S2 N');
  });

  it('applies the section structure upstream has around a rejected block', () => {
    const rejected = new Set(['R']);
    const first = threeWayMerge({
      base: ['S0', 'P', 'S1', 'A'], source: sectioned('S0 P S1 R S2 A'), dest: sectioned('S0 P S1 A'), rejected,
    });
    expect(hashesOf(first.blocks)).to.equal('S0 P S2 A');
    expect(first.baseline).to.deep.equal(['S0', 'P', 'S2', 'A']);
    const wrapper = threeWayMerge({
      base: ['S', 'A', 'S', 'B'], source: sectioned('S A Sx R B'), dest: sectioned('S A S B'), rejected,
    });
    expect(hashesOf(wrapper.blocks)).to.equal('S A Sx B');
  });

  it('records exactly what a page without local changes now has as its next base', () => {
    const { blocks: result, baseline } = threeWayMerge({
      base: ['B', 'Sx', 'A'], source: sectioned('R Sx B'), dest: sectioned('B Sx A'), rejected: new Set(['R']),
    });
    expect(baseline).to.deep.equal(result.map(({ hash }) => hash));
  });

  it('keeps the page\'s own copy when upstream later removes a block next to a rejected one', () => {
    const rejected = new Set(['R']);
    const first = threeWayMerge({
      base: ['A'], source: toBlocks('R L'), dest: toBlocks('A L'), rejected,
    });
    const second = threeWayMerge({
      base: first.baseline, source: toBlocks('R'), dest: first.blocks, rejected,
    });
    expect(second.blocks.map(({ hash }) => hash)).to.include('L');
  });

  it('records the merged upstream order so later upstream edits still apply', () => {
    const first = threeWayMerge({ base: ['A', 'B', 'C', 'D'], source: toBlocks('B A C D'), dest: toBlocks('A B C L') });
    expect(first.baseline).to.deep.equal(['A', 'B', 'C', 'D']);
    const second = threeWayMerge({ base: first.baseline, source: toBlocks('B2 A C D'), dest: first.blocks });
    expect(second.blocks.map(({ hash }) => hash).join(' ')).to.equal('B2 A C L');
    expect(second.skipped).to.equal(0);
  });

  it('keeps local content in its section on rollouts after tidying away an upstream section', () => {
    const start = { base: ['S1', 'Hero', 'Promo'], source: sectioned('S1 Hero S2 Promo') };
    const first = threeWayMerge({ ...start, dest: sectioned('S1 Hero') });
    expect(hashesOf(first.blocks)).to.equal('S1 Hero');
    const unchanged = threeWayMerge({
      base: first.baseline, source: start.source, dest: sectioned('S1 Hero Local'),
    });
    expect(hashesOf(unchanged.blocks)).to.equal('S1 Hero Local');
    const ownBreak = threeWayMerge({ ...start, dest: sectioned('S1 Hero S2 Local') });
    const later = threeWayMerge({
      base: ownBreak.baseline, source: sectioned('S1 Hero S2 Banner Promo'), dest: ownBreak.blocks,
    });
    expect(hashesOf(later.blocks)).to.equal('S1 Hero S2 Banner Local');
  });

  it('never duplicates a localized block that upstream moved', () => {
    const { result } = run({ base: 'A B C', source: 'B A C', dest: 'L B C' });
    expect(result.split(' ').sort()).to.deep.equal(['B', 'C', 'L']);
  });
});

describe('threeWayMerge invariants (seeded random)', () => {
  const rng = (seed) => {
    let state = seed % 2147483647;
    return () => {
      state = (state * 48271) % 2147483647;
      return (state - 1) / 2147483646;
    };
  };
  const random = rng(20261103);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const fresh = (() => {
    let n = 0;
    return (prefix) => {
      n += 1;
      return `${prefix}${n}`;
    };
  })();

  const moveSection = (out) => {
    const starts = out.map((t, j) => (t === '|' ? j : -1)).filter((j) => j >= 0);
    if (starts.length < 2) return;
    const from = pick(starts);
    const next = out.findIndex((t, j) => j > from && t === '|');
    const section = out.splice(from, (next === -1 ? out.length : next) - from);
    const targets = [...out.map((t, j) => (t === '|' ? j : -1)).filter((j) => j >= 0), out.length];
    out.splice(pick(targets), 0, ...section);
  };
  const mutate = (tokens, prefix) => {
    const out = [...tokens];
    const ops = Math.floor(random() * 4);
    for (let i = 0; i < ops; i += 1) {
      const idx = Math.floor(random() * (out.length + 1));
      const op = pick(['edit', 'delete', 'insert', 'move', 'copy', 'section', 'moveSection']);
      if (op === 'moveSection') moveSection(out);
      if (op === 'edit' && idx < out.length) out[idx] = fresh(prefix);
      if (op === 'delete' && idx < out.length) out.splice(idx, 1);
      if (op === 'insert') out.splice(idx, 0, fresh(prefix));
      if (op === 'section') out.splice(idx, 0, '|');
      if (op === 'move' && out.length > 1) {
        const [moved] = out.splice(Math.floor(random() * out.length), 1);
        out.splice(Math.floor(random() * (out.length + 1)), 0, moved);
      }
      if (op === 'copy' && tokens.length) out.splice(idx, 0, pick(tokens));
    }
    return out;
  };
  const count = (list, token) => list.filter((t) => t === token).length;
  // Reference for "upstream minus rejected blocks": extra copies beyond the base's go, and so do
  // sections left holding nothing; one (the last) section stays if nothing remains.
  const upstreamWithoutRejected = ({ base, source, rejected }) => {
    const budget = new Map([...rejected].map((t) => [t, count(base, t)]));
    const removed = source.map((t) => {
      if (!rejected.has(t)) return false;
      budget.set(t, budget.get(t) - 1);
      return budget.get(t) < 0;
    });
    const sections = source.reduce((acc, t, idx) => {
      if (t === '|' || !acc.length) acc.push([]);
      acc[acc.length - 1].push(idx);
      return acc;
    }, []);
    const kept = sections.flatMap((idxs) => {
      const opens = source[idxs[0]] === '|';
      const content = opens ? idxs.slice(1) : idxs;
      const left = content.filter((idx) => !removed[idx]);
      if (opens && content.length && !left.length) return [];
      return (opens ? [idxs[0], ...left] : left).map((idx) => source[idx]);
    });
    return kept.length ? kept : source.filter((t) => t === '|').slice(-1);
  };
  const opensEmpty = (list) => list
    .some((t, idx) => t === '|' && (idx === list.length - 1 || list[idx + 1] === '|'));
  const expectNoLossOrDuplicates = ({
    base, source, dest, result, label, rejected = new Set(),
  }) => {
    // A page whose upstream content was all rejected still keeps one (empty) section.
    const allRejected = rejected.size > 0 && source.filter((t) => t !== '|').every((t) => rejected.has(t));
    if (opensEmpty(result) && !allRejected) {
      expect(opensEmpty(dest) || opensEmpty(source), `no new empty sections: ${label}`).to.be.true;
    }
    new Set(result).forEach((token) => {
      const addedUpstream = Math.max(0, count(source, token) - count(base, token));
      expect(count(result, token), `no duplicates or resurrected local deletions: ${label}`)
        .to.be.at.most(count(dest, token) + addedUpstream);
    });
    new Set([...base, ...source, ...dest]).forEach((token) => {
      if (token === '|' || ![base, source, dest].every((list) => count(list, token) === 1)) return;
      expect(count(result, token), `unique common content kept: ${label}`).to.equal(1);
    });
  };

  it('holds for 3000 random documents', () => {
    for (let i = 0; i < 3000; i += 1) {
      const base = Array.from({ length: Math.floor(random() * 7) }, () => pick(['A', 'B', 'C', 'D', 'E', '|']));
      const source = mutate(base, 's');
      const dest = mutate(base, 'd');
      const { blocks, skipped } = threeWayMerge({ base, source: toBlocks(source.join(' ')), dest: toBlocks(dest.join(' ')) });
      const result = blocks.map(({ hash }) => hash);
      const label = `base=${base} source=${source} dest=${dest} result=${result} skipped=${skipped}`;
      const same = (a, b) => a.join() === b.join();

      if (same(dest, base)) {
        expect(result, label).to.deep.equal(source);
        expect(skipped, label).to.equal(0);
      }
      if (same(source, base)) expect(result, label).to.deep.equal(dest);
      if (same(source, dest)) expect(result, label).to.deep.equal(dest);
      dest.filter((t) => t !== '|' && !base.includes(t)).forEach((token) => {
        expect(count(result, token), `local content kept: ${label}`).to.equal(count(dest, token));
      });
      expectNoLossOrDuplicates({
        base, source, dest, result, label,
      });
      if (skipped === 0) {
        source.filter((t) => t !== '|' && !base.includes(t)).forEach((token) => {
          expect(result, `applied when nothing skipped: ${label}`).to.include(token);
        });
      }
    }
  });

  it('never adds a rejected upstream block in 3000 random documents', () => {
    for (let i = 0; i < 3000; i += 1) {
      const base = Array.from({ length: Math.floor(random() * 7) }, () => pick(['A', 'B', 'C', 'D', 'E', '|']));
      const source = mutate(base, 's');
      const dest = mutate(base, 'd');
      const rejected = new Set(source.filter((t) => t.startsWith('s') && random() < 0.5));
      const { blocks, skipped } = threeWayMerge({
        base, source: toBlocks(source.join(' ')), dest: toBlocks(dest.join(' ')), rejected,
      });
      const result = blocks.map(({ hash }) => hash);
      const label = `base=${base} source=${source} dest=${dest} rejected=${[...rejected]} result=${result} skipped=${skipped}`;

      expect(result.filter((t) => rejected.has(t)), `no rejected blocks: ${label}`).to.deep.equal([]);
      expectNoLossOrDuplicates({
        base, source, dest, result, label, rejected,
      });
      dest.filter((t) => t !== '|' && !base.includes(t)).forEach((token) => {
        expect(count(result, token), `local content kept: ${label}`).to.equal(count(dest, token));
      });
      if (skipped === 0) {
        source.filter((t) => t !== '|' && !base.includes(t) && !rejected.has(t)).forEach((token) => {
          expect(result, `applied when nothing skipped: ${label}`).to.include(token);
        });
      }
    }
  });

  it('applies later upstream changes after rejections in 3000 random two-rollout sequences', () => {
    for (let i = 0; i < 3000; i += 1) {
      const base = Array.from({ length: Math.floor(random() * 7) }, () => pick(['A', 'B', 'C', 'D', '|']));
      const source = mutate(base, 's').map((t) => (t.startsWith('s') && random() < 0.4 ? 'R' : t));
      const dest = mutate(base, 'd');
      const rejected = new Set(['R']);
      const first = threeWayMerge({
        base, source: toBlocks(source.join(' ')), dest: toBlocks(dest.join(' ')), rejected,
      });
      const later = source.map((t) => (t === 'R' ? fresh('n') : t));
      const second = threeWayMerge({
        base: first.baseline, source: toBlocks(later.join(' ')), dest: first.blocks, rejected,
      });
      const result = second.blocks.map(({ hash }) => hash);
      const label = `base=${base} source=${source} dest=${dest} later=${later} result=${result}`;

      if (second.skipped === 0) {
        later.filter((t) => t.startsWith('n')).forEach((token) => {
          expect(result, `later upstream block applied: ${label}`).to.include(token);
        });
      }
      dest.filter((t) => t.startsWith('d')).forEach((token) => {
        expect(count(result, token), `local content kept: ${label}`).to.equal(count(dest, token));
      });
      expect(count(result, 'R'), `rejected block stays out: ${label}`).to.be.at.most(count(dest, 'R'));
    }
  });

  it('applies later edits next to a rejected block without skips in 3000 random pages', () => {
    for (let i = 0; i < 3000; i += 1) {
      const base = Array.from({ length: 2 + Math.floor(random() * 5) }, () => pick(['A', 'B', 'C', 'D', '|']));
      const source = [...base];
      source.splice(Math.floor(random() * (source.length + 1)), 0, 'R');
      const rejected = new Set(['R']);
      const first = threeWayMerge({
        base, source: toBlocks(source.join(' ')), dest: toBlocks(base.join(' ')), rejected,
      });
      const later = source.map((t) => (t !== 'R' && t !== '|' && random() < 0.4 ? fresh('n') : t));
      const second = threeWayMerge({
        base: first.baseline, source: toBlocks(later.join(' ')), dest: first.blocks, rejected,
      });
      const label = `base=${base} source=${source} later=${later}`;
      expect(second.skipped, `nothing skipped: ${label}`).to.equal(0);
      const content = (list) => list.filter((t) => t !== 'R' && t !== '|');
      expect(content(second.blocks.map(({ hash }) => hash)), label).to.deep.equal(content(later));
    }
  });

  it('stays stable with rejected blocks the page may already have in 3000 random documents', () => {
    for (let i = 0; i < 3000; i += 1) {
      const base = Array.from({ length: Math.floor(random() * 7) }, () => pick(['A', 'B', 'C', 'R', '|']));
      const source = mutate(base, 's').map((t) => (t.startsWith('s') && random() < 0.3 ? 'R' : t));
      const dest = mutate(base, 'd');
      const rejected = new Set(random() < 0.8 ? ['R'] : []);
      const first = threeWayMerge({
        base, source: toBlocks(source.join(' ')), dest: toBlocks(dest.join(' ')), rejected,
      });
      const result = first.blocks.map(({ hash }) => hash);
      const label = `base=${base} source=${source} dest=${dest} rejected=${[...rejected]} result=${result}`;

      const second = threeWayMerge({
        base: first.baseline, source: toBlocks(source.join(' ')), dest: first.blocks, rejected,
      }).blocks.map(({ hash }) => hash);
      expectNoLossOrDuplicates({
        base, source, dest, result, label, rejected,
      });
      if (rejected.has('R')) {
        expect(count(result, 'R'), `new rejected block left out: ${label}`).to.be.at.most(count(dest, 'R'));
        expect(count(second, 'R'), `still left out next time: ${label}`).to.be.at.most(count(dest, 'R'));
      }
      if (dest.join() === base.join()) {
        expect(result, `unchanged page takes upstream minus rejected blocks: ${label}`)
          .to.deep.equal(upstreamWithoutRejected({ base, source, rejected }));
      }
      if (dest.join() === base.join()) {
        expect(first.baseline, `page without local changes equals its next base: ${label}`).to.deep.equal(result);
      }
      dest.filter((t) => t.startsWith('d')).forEach((token) => {
        expect(count(second, token), `local content kept next time: ${label}`).to.equal(count(dest, token));
      });
    }
  });
});
