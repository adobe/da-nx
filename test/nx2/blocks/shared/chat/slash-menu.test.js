import { expect } from '@esm-bundle/chai';
import { getSlashContext, spliceInput, syncSlashMenu } from '../../../../../nx2/blocks/shared/chat/slash-menu.js';

function makeInput(value, selectionStart) {
  return { value, selectionStart };
}

describe('getSlashContext', () => {
  it('detects a slash word right before the cursor', () => {
    const ctx = getSlashContext(makeInput('/write', 6));
    expect(ctx).to.deep.equal({ filter: 'write', wordStart: 0 });
  });

  it('returns null when the cursor is not in a slash word', () => {
    expect(getSlashContext(makeInput('hello world', 11))).to.equal(null);
  });

  it('scopes to the current word after a space', () => {
    const ctx = getSlashContext(makeInput('hello /write', 12));
    expect(ctx).to.deep.equal({ filter: 'write', wordStart: 6 });
  });

  it('scopes to the current word after a newline', () => {
    const ctx = getSlashContext(makeInput('hello\n/write', 12));
    expect(ctx).to.deep.equal({ filter: 'write', wordStart: 6 });
  });

  it('lowercases the filter', () => {
    const ctx = getSlashContext(makeInput('/Write', 6));
    expect(ctx.filter).to.equal('write');
  });
});

describe('spliceInput', () => {
  it('inserts text at a single position and moves the cursor past it', () => {
    const input = { value: 'hello world', setSelectionRange(start, end) { this._sel = [start, end]; } };
    spliceInput(input, '/', 5);
    expect(input.value).to.equal('hello/ world');
    expect(input._sel).to.deep.equal([6, 6]);
  });

  it('replaces a range when end is given', () => {
    const input = { value: '/write world', setSelectionRange(start, end) { this._sel = [start, end]; } };
    spliceInput(input, '/writeBlog', 0, 6);
    expect(input.value).to.equal('/writeBlog world');
  });
});

describe('syncSlashMenu', () => {
  function makeMenu(open = false) {
    const calls = [];
    return {
      open,
      items: null,
      close: () => calls.push('close'),
      show: (opts) => calls.push(['show', opts]),
      reposition: () => calls.push('reposition'),
      calls,
    };
  }

  it('is a no-op when there is no menu element', () => {
    expect(() => syncSlashMenu(null, {}, [])).to.not.throw();
  });

  it('closes the menu when there are no items', () => {
    const menu = makeMenu(true);
    syncSlashMenu(menu, {}, []);
    expect(menu.calls).to.deep.equal(['close']);
  });

  it('shows the menu anchored above, with items, when closed', () => {
    const menu = makeMenu(false);
    const anchor = { id: 'form' };
    const items = [{ id: 'writeBlog', label: 'writeBlog' }];
    syncSlashMenu(menu, anchor, items);
    expect(menu.items).to.equal(items);
    expect(menu.calls).to.deep.equal([['show', { anchor, placement: 'above' }]]);
  });

  it('repositions instead of re-showing when already open', () => {
    const menu = makeMenu(true);
    syncSlashMenu(menu, {}, [{ id: 'writeBlog', label: 'writeBlog' }]);
    expect(menu.calls).to.deep.equal(['reposition']);
  });
});
