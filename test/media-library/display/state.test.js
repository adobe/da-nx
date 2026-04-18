import { expect } from '@esm-bundle/chai';
import {
  getDisplayState,
  updateDisplayState,
  resetDisplayState,
  onDisplayStateChange,
} from '../../../nx/blocks/media-library/display/state.js';

describe('Display State Management', () => {
  beforeEach(() => {
    resetDisplayState();
  });

  it('should have initial display state', () => {
    const state = getDisplayState();
    expect(state.view).to.equal('grid');
    expect(state.selectedIds).to.have.lengthOf(0);
    expect(state.sortBy).to.equal('uploadDate');
    expect(state.sortOrder).to.equal('desc');
    expect(state.filters).to.deep.equal({});
    expect(state.searchQuery).to.equal('');
    expect(state.bulkEditMode).to.equal(false);
  });

  it('should update display state', () => {
    updateDisplayState({ view: 'list' });
    const state = getDisplayState();
    expect(state.view).to.equal('list');
  });

  it('should merge updates without mutating', () => {
    const before = getDisplayState();
    updateDisplayState({ selectedIds: ['id1', 'id2'] });
    const after = getDisplayState();

    expect(before).to.not.equal(after);
    expect(after.selectedIds).to.deep.equal(['id1', 'id2']);
    expect(after.view).to.equal('grid'); // default view
  });

  it('should reset to initial state', () => {
    updateDisplayState({ view: 'list', selectedIds: ['id1'] });
    resetDisplayState();
    const state = getDisplayState();

    expect(state.view).to.equal('grid');
    expect(state.selectedIds).to.have.lengthOf(0);
  });

  it('should notify listeners on state change', () => {
    let notified = false;
    let receivedState = null;

    onDisplayStateChange(['view'], (state) => {
      notified = true;
      receivedState = state;
    });

    updateDisplayState({ view: 'list' });
    expect(notified).to.equal(true);
    expect(receivedState.view).to.equal('list');
  });

  it('should only notify when subscribed keys change', () => {
    let viewChanged = false;
    let sortChanged = false;

    onDisplayStateChange(['view'], () => { viewChanged = true; });
    onDisplayStateChange(['sortBy'], () => { sortChanged = true; });

    updateDisplayState({ view: 'list' });
    expect(viewChanged).to.equal(true);
    expect(sortChanged).to.equal(false);
  });
});
