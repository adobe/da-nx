import { buildSlashMessage } from '../../chat/utils/chat-helpers.js';

// Detects a "/word" immediately before the cursor. Returns null when the cursor
// isn't inside such a word (menu should be closed).
export function getSlashContext(input) {
  const pos = input.selectionStart;
  const before = input.value.slice(0, pos);
  const wordStart = Math.max(before.lastIndexOf(' '), before.lastIndexOf('\n')) + 1;
  const word = before.slice(wordStart);
  if (!word.startsWith('/')) return null;
  return { filter: word.slice(1).toLowerCase(), wordStart };
}

export function spliceInput(input, text, start, end = start) {
  input.value = input.value.slice(0, start) + text + input.value.slice(end);
  input.setSelectionRange(start + text.length, start + text.length);
}

// items: [] closes the menu; otherwise shows it anchored to `anchor` (or
// repositions it if already open, e.g. as the textarea grows).
export function syncSlashMenu(menuEl, anchor, items) {
  if (!menuEl) return;
  if (!items.length) {
    menuEl.close();
    return;
  }
  menuEl.items = items;
  if (!menuEl.open) {
    menuEl.show({ anchor, placement: 'above' });
  } else {
    menuEl.reposition();
  }
}

export function createSlashMenu(host, {
  getItems,
  menuSelector = '.slash-menu',
  formSelector = '.chat-form',
  inputSelector = '.chat-input',
} = {}) {
  let ctx = null;
  const menuEl = () => host.shadowRoot.querySelector(menuSelector);

  function sync() {
    if (!ctx) {
      menuEl()?.close();
      return;
    }
    syncSlashMenu(menuEl(), host.shadowRoot.querySelector(formSelector), getItems(ctx.filter));
  }

  return {
    onInput(e) {
      ctx = getSlashContext(e.target);
      sync();
    },

    onBlur() {
      // Defer past any click event on a menu item that triggered the blur.
      setTimeout(() => {
        menuEl()?.close();
        ctx = null;
      }, 0);
    },

    // Returns true when the open menu consumed the key — caller should stop there.
    onKeydown(e) {
      if (!menuEl()?.open) return false;
      if (!['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) return false;
      e.preventDefault();
      menuEl().handleKey(e.key);
      return true;
    },

    resolveSelection(skillId) {
      const input = host.shadowRoot.querySelector(inputSelector);
      const { wordStart } = ctx ?? {};
      const message = buildSlashMessage(input?.value ?? '', input?.selectionStart ?? 0, wordStart, skillId);
      ctx = null;
      menuEl()?.close();
      return { message, input };
    },

    insertSlash() {
      const input = host.shadowRoot.querySelector(inputSelector);
      if (!input) return;
      const { value, selectionStart: pos } = input;
      const before = value.slice(0, pos);
      const slash = (before && !before.endsWith(' ')) ? ' /' : '/';
      spliceInput(input, slash, pos);
      input.focus();
      input.dispatchEvent(new Event('input'));
    },

    close() {
      menuEl()?.close();
      ctx = null;
    },

    refresh() {
      sync();
    },
  };
}
