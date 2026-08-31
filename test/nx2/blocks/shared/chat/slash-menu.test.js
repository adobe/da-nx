import { expect } from '@esm-bundle/chai';
import {
  getSlashContext, spliceInput, syncSlashMenu, createSlashMenu,
} from '../../../../../nx2/blocks/shared/chat/slash-menu.js';

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

describe('createSlashMenu', () => {
  // Real shadow-root querySelector wiring; only the menu element's own
  // show/close/reposition/handleKey are stubbed, same boundary makeMenu() used above.
  function makeHost({ open = false } = {}) {
    const host = document.createElement('div');
    host.attachShadow({ mode: 'open' });
    const form = document.createElement('div');
    form.className = 'chat-form';
    const input = document.createElement('textarea');
    input.className = 'chat-input';
    const menu = document.createElement('div');
    menu.className = 'slash-menu';
    const calls = [];
    menu.open = open;
    menu.items = null;
    menu.close = () => {
      calls.push('close');
      menu.open = false;
    };
    menu.show = (opts) => {
      calls.push(['show', opts]);
      menu.open = true;
    };
    menu.reposition = () => calls.push('reposition');
    menu.handleKey = (key) => calls.push(['handleKey', key]);
    host.shadowRoot.append(form, input, menu);
    return { host, form, input, menu, calls };
  }

  function setCursorInSlashWord(input, value, selectionStart) {
    input.value = value;
    input.selectionStart = selectionStart;
  }

  it('onInput shows the menu anchored to the form when the cursor is in a slash word', () => {
    const { host, form, input, menu, calls } = makeHost();
    const items = [{ id: 'writeBlog', label: 'writeBlog' }];
    const slashMenu = createSlashMenu(host, { getItems: (filter) => (filter === 'write' ? items : []) });
    setCursorInSlashWord(input, '/write', 6);

    slashMenu.onInput({ target: input });

    expect(menu.items).to.equal(items);
    expect(calls).to.deep.equal([['show', { anchor: form, placement: 'above' }]]);
  });

  it('onInput closes the menu once the cursor leaves the slash word', () => {
    const { host, input, calls } = makeHost({ open: true });
    const slashMenu = createSlashMenu(host, { getItems: () => [{ id: 'x', label: 'x' }] });
    setCursorInSlashWord(input, 'hello world', 11);

    slashMenu.onInput({ target: input });

    expect(calls).to.deep.equal(['close']);
  });

  it('onBlur closes the menu and clears context, but only after a tick — so a menu-item click lands first', async () => {
    const items = [{ id: 'writeBlog', label: 'writeBlog' }];
    const { host, input, calls } = makeHost({ open: true });
    const slashMenu = createSlashMenu(host, { getItems: () => items });
    setCursorInSlashWord(input, '/write', 6);
    slashMenu.onInput({ target: input });
    calls.length = 0;

    slashMenu.onBlur();
    expect(calls).to.have.length(0);

    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expect(calls).to.deep.equal(['close']);

    calls.length = 0;
    slashMenu.refresh();
    expect(calls).to.deep.equal(['close']); // ctx is null now, so refresh re-closes rather than re-showing
  });

  it('onKeydown ignores every key when the menu is not open', () => {
    const { host, calls } = makeHost({ open: false });
    const slashMenu = createSlashMenu(host, { getItems: () => [] });

    const consumed = slashMenu.onKeydown({ key: 'Enter', preventDefault: () => calls.push('preventDefault') });

    expect(consumed).to.equal(false);
    expect(calls).to.have.length(0);
  });

  it('onKeydown ignores a key outside arrows/enter/escape even when open', () => {
    const { host, calls } = makeHost({ open: true });
    const slashMenu = createSlashMenu(host, { getItems: () => [] });

    const consumed = slashMenu.onKeydown({ key: 'a', preventDefault: () => calls.push('preventDefault') });

    expect(consumed).to.equal(false);
    expect(calls).to.have.length(0);
  });

  ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].forEach((key) => {
    it(`onKeydown consumes ${key} and forwards it to the menu when open`, () => {
      const { host, calls } = makeHost({ open: true });
      const slashMenu = createSlashMenu(host, { getItems: () => [] });
      let prevented = false;

      const consumed = slashMenu.onKeydown({ key, preventDefault: () => { prevented = true; } });

      expect(consumed).to.equal(true);
      expect(prevented).to.equal(true);
      expect(calls).to.deep.equal([['handleKey', key]]);
    });
  });

  it('resolveSelection builds the slash message from the tracked wordStart, clears context, and closes the menu', () => {
    const { host, input, calls } = makeHost({ open: true });
    const slashMenu = createSlashMenu(host, { getItems: () => [{ id: 'writeBlog', label: 'writeBlog' }] });
    setCursorInSlashWord(input, 'hello /wri', 10);
    slashMenu.onInput({ target: input });
    calls.length = 0;

    const result = slashMenu.resolveSelection('writeBlog');

    expect(result).to.deep.equal({ message: 'hello /writeBlog', input });
    expect(calls).to.deep.equal(['close']);
  });

  it('insertSlash prefixes a space before the slash when the input already has content', () => {
    const { host, input } = makeHost();
    const slashMenu = createSlashMenu(host, { getItems: () => [] });
    input.value = 'hello';
    input.selectionStart = 5;
    input.focus = () => { input._focused = true; };
    let fired = false;
    input.addEventListener('input', () => { fired = true; });

    slashMenu.insertSlash();

    expect(input.value).to.equal('hello /');
    expect(input._focused).to.equal(true);
    expect(fired).to.equal(true);
  });

  it('insertSlash uses a bare slash when the input is empty', () => {
    const { host, input } = makeHost();
    const slashMenu = createSlashMenu(host, { getItems: () => [] });
    input.value = '';
    input.selectionStart = 0;

    slashMenu.insertSlash();

    expect(input.value).to.equal('/');
  });

  it('close() closes the menu and clears context', () => {
    const { host, input, calls } = makeHost({ open: true });
    const slashMenu = createSlashMenu(host, { getItems: () => [{ id: 'x', label: 'x' }] });
    setCursorInSlashWord(input, '/x', 2);
    slashMenu.onInput({ target: input });
    calls.length = 0;

    slashMenu.close();
    expect(calls).to.deep.equal(['close']);

    calls.length = 0;
    slashMenu.refresh();
    expect(calls).to.deep.equal(['close']); // ctx cleared by close(), so refresh re-closes
  });

  it('refresh re-syncs against the live item list for the current context', () => {
    const { host, form, input, menu, calls } = makeHost({ open: false });
    let items = [];
    const slashMenu = createSlashMenu(host, { getItems: () => items });
    setCursorInSlashWord(input, '/wri', 4);
    slashMenu.onInput({ target: input });
    calls.length = 0;

    items = [{ id: 'writeBlog', label: 'writeBlog' }];
    slashMenu.refresh();

    expect(menu.items).to.deep.equal(items);
    expect(calls).to.deep.equal([['show', { anchor: form, placement: 'above' }]]);
  });
});
