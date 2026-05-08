function spliceInput(input, text, start, end = start) {
  input.value = input.value.slice(0, start) + text + input.value.slice(end);
  input.setSelectionRange(start + text.length, start + text.length);
}

export class SlashMenuController {
  _ctx = null;

  _menuEl = null;

  _skills = [];

  connect(menuEl) {
    this._menuEl = menuEl;
  }

  setSkills(skills) {
    this._skills = skills ?? [];
  }

  _getItems(filter) {
    const skills = this._skills.map((id) => ({ id, label: id }));
    const filtered = filter
      ? skills.filter((item) => item.id.toLowerCase().includes(filter))
      : skills;
    if (!filtered.length) return [];
    return [{ section: 'Skills' }, ...filtered];
  }

  _getContext(input) {
    const pos = input.selectionStart;
    const before = input.value.slice(0, pos);
    const wordStart = Math.max(before.lastIndexOf(' '), before.lastIndexOf('\n')) + 1;
    const word = before.slice(wordStart);
    if (!word.startsWith('/')) return null;
    return { filter: word.slice(1).toLowerCase(), wordStart };
  }

  _sync(ctx, anchor) {
    if (!this._menuEl) return;
    if (!ctx) {
      this._menuEl.close();
      return;
    }
    const items = this._getItems(ctx.filter);
    if (!items.length) {
      this._menuEl.close();
      return;
    }
    this._menuEl.items = items;
    if (!this._menuEl.open) this._menuEl.show({ anchor, placement: 'above' });
  }

  handleInput(input, anchor) {
    this._ctx = this._getContext(input);
    this._sync(this._ctx, anchor);
  }

  handleBlur() {
    setTimeout(() => {
      this._menuEl?.close();
      this._ctx = null;
    }, 0);
  }

  // Returns true if the key was consumed by the menu.
  handleKey(key) {
    if (!this._menuEl?.open) return false;
    const keys = ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'];
    if (!keys.includes(key)) return false;
    this._menuEl.handleKey(key);
    return true;
  }

  refresh(anchor) {
    if (this._ctx) this._sync(this._ctx, anchor);
  }

  select(skillId, input, onSend) {
    const { wordStart } = this._ctx ?? {};
    const before = input?.value.slice(0, wordStart ?? 0).trimEnd();
    const after = input?.value.slice(input.selectionStart).trimStart();
    const message = [before, `/${skillId}`, after].filter(Boolean).join(' ');
    this._ctx = null;
    this._menuEl?.close();
    if (input) input.value = '';
    onSend(message, skillId);
  }

  insertSlash(input) {
    if (!input) return;
    const { value, selectionStart: pos } = input;
    const before = value.slice(0, pos);
    const slash = (before && !before.endsWith(' ')) ? ' /' : '/';
    spliceInput(input, slash, pos);
    input.focus();
    input.dispatchEvent(new Event('input'));
  }

  close() {
    this._menuEl?.close();
    this._ctx = null;
  }
}
