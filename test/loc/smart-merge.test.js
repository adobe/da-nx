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

  const rejectedCases = [
    ['keeps a rejected upstream edit out', 'A B', 'A2 B2', 'A B', 'A2', 'A B2', 0],
    ['keeps a rejected upstream edit out next to a local edit', 'A B C', 'A2 B C', 'A B L', 'A2', 'A B L', 0],
    ['keeps a rejected upstream insert out', 'A C', 'A N C', 'A C', 'N', 'A C', 0],
    ['keeps a rejected insert out when both sides insert at one spot', 'A C', 'A N C', 'A Y C', 'N', 'A Y C', 0],
    ['applies upstream edits when other blocks are rejected', 'A B', 'A2 B', 'A B', 'X', 'A2 B', 0],
  ];

  rejectedCases.forEach(([name, base, source, dest, rejected, expected, skipped]) => {
    it(name, () => {
      expect(run({
        base, source, dest, rejected,
      })).to.deep.equal({ result: expected, skipped });
    });
  });

  it('records the merged upstream order so later upstream edits still apply', () => {
    const first = threeWayMerge({ base: ['A', 'B', 'C', 'D'], source: toBlocks('B A C D'), dest: toBlocks('A B C L') });
    expect(first.baseline).to.deep.equal(['A', 'B', 'C', 'D']);
    const second = threeWayMerge({ base: first.baseline, source: toBlocks('B2 A C D'), dest: first.blocks });
    expect(second.blocks.map(({ hash }) => hash).join(' ')).to.equal('B2 A C L');
    expect(second.skipped).to.equal(0);
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
      new Set(result).forEach((token) => {
        const addedUpstream = Math.max(0, count(source, token) - count(base, token));
        expect(count(result, token), `no duplicates or resurrected local deletions: ${label}`)
          .to.be.at.most(count(dest, token) + addedUpstream);
      });
      new Set([...base, ...source, ...dest]).forEach((token) => {
        if (token === '|' || ![base, source, dest].every((list) => count(list, token) === 1)) return;
        expect(count(result, token), `unique common content kept: ${label}`).to.equal(1);
      });
      const emptySection = (list) => list
        .some((t, idx) => t === '|' && (idx === list.length - 1 || list[idx + 1] === '|'));
      if (emptySection(result)) {
        expect(emptySection(dest) || emptySection(source), `no new empty sections: ${label}`).to.be.true;
      }
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
      const { blocks } = threeWayMerge({
        base, source: toBlocks(source.join(' ')), dest: toBlocks(dest.join(' ')), rejected,
      });
      const result = blocks.map(({ hash }) => hash);
      const label = `base=${base} source=${source} dest=${dest} rejected=${[...rejected]} result=${result}`;

      expect(result.filter((t) => rejected.has(t)), `no rejected blocks: ${label}`).to.deep.equal([]);
      dest.filter((t) => t !== '|' && !base.includes(t)).forEach((token) => {
        expect(count(result, token), `local content kept: ${label}`).to.equal(count(dest, token));
      });
    }
  });
});
