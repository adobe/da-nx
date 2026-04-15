/* eslint-disable max-len */
import { Plugin, PluginKey } from 'da-y-wrapper';
import { getKeyAutocomplete, getAutocompleteData, normalizeForSlashMenu, createKeyMenuItems } from './keyAutocomplete.js';
import {
  getDefaultSlashGroups,
  getTableCellItems,
  getTableItems,
} from './slashMenuItems.js';
import { getTableInfo } from './tableUtils.js';
import './slash-popover.js';

const SLASH_COMMAND_REGEX = /\/(([^/\s]+(?:\s+[^/\s]+)*)\s*([^/\s]*))?$/;
const slashMenuKey = new PluginKey('slashMenu');

function extractArgument(title, command) {
  const parts = command.toLowerCase().split(/\s+/);
  return parts.length > 1 && title.toLowerCase().startsWith(parts.slice(0, -1).join(' '))
    ? parts[parts.length - 1]
    : undefined;
}

const hasCellAreaSelected = (state) => state.selection.content().size > 0;

function setSlashMenuGrouped(menu) {
  menu.groups = getDefaultSlashGroups();
  menu.items = [];
}

function setSlashMenuFlat(menu, items) {
  menu.groups = undefined;
  menu.items = items;
}

/** Only top-level `doc > paragraph` (depth 1); not lists, quotes, cells, etc. */
function isTopLevelParagraphCursor($cursor) {
  return $cursor.depth === 1 && $cursor.node(0)?.type?.name === 'doc';
}

function shouldShowEmptyLineSlashHint(state, menuVisible) {
  if (menuVisible) return false;
  const { $cursor } = state.selection;
  if (!$cursor) return false;
  if ($cursor.parentOffset !== 0) return false;
  const { parent } = $cursor;
  if (!parent.isTextblock || parent.type.name !== 'paragraph') return false;
  if (parent.content.size !== 0) return false;
  if (!isTopLevelParagraphCursor($cursor)) return false;
  return true;
}

function createSlashHintEl() {
  const hintEl = document.createElement('span');
  hintEl.className = 'nx-editor-doc-slash-hint';
  hintEl.textContent = 'Tap \'/\' to insert';
  hintEl.setAttribute('aria-hidden', 'true');
  hintEl.hidden = true;
  return hintEl;
}

class SlashMenuView {
  constructor(view) {
    this.view = view;
    this.menu = document.createElement('nx-slash-popover');
    setSlashMenuGrouped(this.menu);

    this.hintEl = createSlashHintEl();

    this.menu.addEventListener('item-selected', (e) => {
      this.selectItem(e.detail);
    });
  }

  syncSlashHint(view, state) {
    const mount = view.dom.parentElement;
    if (!mount || !this.hintEl) return;

    const show = shouldShowEmptyLineSlashHint(state, this.menu.visible);
    if (!show) {
      this.hintEl.hidden = true;
      return;
    }

    const { $cursor } = state.selection;
    const coords = view.coordsAtPos($cursor.pos);
    const mr = mount.getBoundingClientRect();
    this.hintEl.style.left = `${coords.left - mr.left + mount.scrollLeft + 3}px`;
    this.hintEl.style.top = `${coords.top - mr.top + mount.scrollTop}px`;
    this.hintEl.hidden = false;
  }

  updateSlashMenuItems(pluginState, state) {
    const { $cursor } = state.selection;

    if (hasCellAreaSelected(state)) {
      setSlashMenuFlat(this.menu, getTableCellItems(state));
      return;
    }

    if (!$cursor) {
      setSlashMenuGrouped(this.menu);
      return;
    }

    const tableInfo = getTableInfo(state, $cursor.pos);
    if (!tableInfo) {
      setSlashMenuGrouped(this.menu);
      return;
    }

    const { tableName, keyValue, isFirstColumn, columnsInRow } = tableInfo;
    const keyData = pluginState.autocompleteData?.get(tableName);

    if (!keyData) {
      setSlashMenuFlat(this.menu, getTableItems(state));
      return;
    }

    if (isFirstColumn && columnsInRow === 2) {
      setSlashMenuFlat(this.menu, createKeyMenuItems(keyData));
      return;
    }

    const normalizedKey = normalizeForSlashMenu(keyValue);
    setSlashMenuFlat(this.menu, keyData.get(normalizedKey) || getTableItems(state));
  }

  cellHasMenuItems(pluginState, state, $cursor) {
    const tableInfo = getTableInfo(state, $cursor.pos);
    if (!tableInfo) return false;

    const { tableName, keyValue, isFirstColumn } = tableInfo;
    const keyData = pluginState.autocompleteData?.get(tableName);
    if (!keyData) return false;

    if (isFirstColumn) return true;

    const normalizedKey = normalizeForSlashMenu(keyValue);
    return keyData.has(normalizedKey);
  }

  showMenu(command) {
    const { state } = this.view;
    const { $anchor } = state.selection;

    this.updateSlashMenuItems(slashMenuKey.getState(state), state);
    this.menu.command = command || '';
    const coords = this.view.coordsAtPos($anchor.pos);
    this.menu.show({ x: coords.left, y: coords.bottom + 6 });
  }

  update(view) {
    if (!view) return;

    this.view = view;

    const { state } = view;
    try {
      const { $cursor } = state.selection;

      if (!$cursor) {
        if (!hasCellAreaSelected(state) || !this.menu.visible) {
          this.hide();
        }
        return;
      }

      const textBefore = $cursor.parent.textContent.slice(0, $cursor.parentOffset);
      if (!this.cellHasMenuItems(slashMenuKey.getState(state), state, $cursor) && !textBefore?.startsWith('/')) {
        if (this.menu.visible) this.hide();
        return;
      }

      const match = textBefore.match(SLASH_COMMAND_REGEX);
      if (match) {
        this.showMenu(match[1]);
      } else if (this.menu.visible) {
        this.menu.command = '';
        this.hide();
      }
    } finally {
      this.syncSlashHint(view, view.state);
    }
  }

  selectItem(detail) {
    const { item } = detail;
    const { state, dispatch } = this.view;
    const { $anchor } = state.selection;
    if (!$anchor) return;

    const deleteFrom = $anchor.pos - (this.menu.command.length + 1);
    const deleteTo = $anchor.pos;
    const tr = state.tr.delete(deleteFrom, deleteTo);
    const newState = state.apply(tr);

    const argument = extractArgument(item.title, this.menu.command);

    dispatch(tr);
    item.command(newState, dispatch, argument, this.view);

    this.hide();
  }

  handleKeyDown(event) {
    this.menu.handleKeyDown(event);
  }

  hide() {
    this.menu.hide();
  }

  destroy() {
    if (this.hintScrollRoot && this.hintScrollListener) {
      this.hintScrollRoot.removeEventListener('scroll', this.hintScrollListener);
      this.hintScrollRoot = undefined;
      this.hintScrollListener = undefined;
    }
    this.hintEl.remove();
    this.menu.remove();
  }
}

export default function slashMenu() {
  let pluginView = null;

  getKeyAutocomplete().then((data) => {
    if (pluginView?.view) {
      const tr = pluginView.view.state.tr
        .setMeta(slashMenuKey, { autocompleteData: data })
        .setMeta('addToHistory', false);
      pluginView.view.dispatch(tr);
    }
  });

  return new Plugin({
    key: slashMenuKey,
    state: {
      init() {
        return {
          showSlashMenu: false,
          autocompleteData: null,
        };
      },
      apply(tr, value) {
        const meta = tr.getMeta(slashMenuKey);
        if (meta !== undefined) {
          return { ...value, ...meta };
        }
        return value;
      },
    },
    props: {
      handleKeyDown(editorView, event) {
        if (event.key === '/' && hasCellAreaSelected(editorView.state)) {
          event.preventDefault();
          pluginView.showMenu();
          return true;
        }

        if (pluginView?.menu.visible) {
          if (['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(event.key)) {
            event.preventDefault();
            event.stopPropagation();
            pluginView.menu.handleKeyDown(event);
            return true;
          }
        }
        return false;
      },
    },
    view(editorView) {
      pluginView = new SlashMenuView(editorView);
      const mount = editorView.dom.parentNode;
      mount.appendChild(pluginView.menu);
      mount.appendChild(pluginView.hintEl);

      const scrollRoot = mount?.closest?.('.nx-editor-doc');
      if (scrollRoot) {
        pluginView.hintScrollRoot = scrollRoot;
        pluginView.hintScrollListener = () => {
          if (!pluginView.view || pluginView.hintEl.hidden) return;
          pluginView.syncSlashHint(pluginView.view, pluginView.view.state);
        };
        scrollRoot.addEventListener('scroll', pluginView.hintScrollListener, { passive: true });
      }

      editorView.dispatch(
        editorView.state.tr
          .setMeta(slashMenuKey, { autocompleteData: getAutocompleteData() })
          .setMeta('addToHistory', false),
      );

      return pluginView;
    },
  });
}
