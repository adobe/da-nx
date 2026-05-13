import { expect } from '@esm-bundle/chai';
import { assignArrayItemIds } from '../../../nx/blocks/form/core/ids.js';

describe('assignArrayItemIds', () => {
  it('returns a fresh id when there is no previous list', () => {
    const ids = assignArrayItemIds({ nextItems: ['a'] });
    expect(ids).to.have.lengthOf(1);
    expect(ids[0]).to.be.a('string').and.have.length.greaterThan(0);
  });

  it('preserves positional ids when items are unchanged', () => {
    const prev = ['a', 'b', 'c'];
    const prevIds = ['id-a', 'id-b', 'id-c'];
    const ids = assignArrayItemIds({
      nextItems: prev.slice(),
      previousItems: prev,
      previousIds: prevIds,
    });
    expect(ids).to.deep.equal(prevIds);
  });

  it('preserves item identity across a pure reorder (multiset unchanged)', () => {
    // The clever path: when the multiset of values is identical, match by
    // content signature instead of position, so each value keeps its id.
    const prev = ['a', 'b', 'c'];
    const prevIds = ['id-a', 'id-b', 'id-c'];
    const ids = assignArrayItemIds({
      nextItems: ['c', 'a', 'b'],
      previousItems: prev,
      previousIds: prevIds,
    });
    expect(ids).to.deep.equal(['id-c', 'id-a', 'id-b']);
  });

  it('assigns a fresh id to a newly appended item', () => {
    const ids = assignArrayItemIds({
      nextItems: ['a', 'b', 'c'],
      previousItems: ['a', 'b'],
      previousIds: ['id-a', 'id-b'],
    });
    expect(ids[0]).to.equal('id-a');
    expect(ids[1]).to.equal('id-b');
    expect(ids[2]).to.be.a('string').and.not.equal('id-a').and.not.equal('id-b');
  });

  it('reuses positional ids on element replace (multiset changed)', () => {
    // When values change in place we keep the positional id — typing edits a
    // primitive item without losing its render key.
    const ids = assignArrayItemIds({
      nextItems: ['A', 'b'],
      previousItems: ['a', 'b'],
      previousIds: ['id-a', 'id-b'],
    });
    expect(ids).to.deep.equal(['id-a', 'id-b']);
  });

  it('matches duplicate-value items in FIFO order on pure reorder', () => {
    // Pure reorder: same multiset. Identity preserved via signature queues
    // in the order they were encountered in the previous list.
    const ids = assignArrayItemIds({
      nextItems: ['x', 'a', 'x'],
      previousItems: ['x', 'x', 'a'],
      previousIds: ['id-x1', 'id-x2', 'id-a'],
    });
    expect(ids).to.deep.equal(['id-x1', 'id-a', 'id-x2']);
  });

  it('treats deep object equality correctly', () => {
    const prev = [{ a: 1, b: 2 }, { a: 1, b: 3 }];
    const prevIds = ['id-1', 'id-2'];
    // pure reorder of objects → identity preserved
    const ids = assignArrayItemIds({
      nextItems: [{ b: 3, a: 1 }, { a: 1, b: 2 }],
      previousItems: prev,
      previousIds: prevIds,
    });
    expect(ids).to.deep.equal(['id-2', 'id-1']);
  });
});
