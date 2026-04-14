/* eslint-disable max-len */
import { Plugin, PluginKey } from 'da-y-wrapper';
import { getKeyAutocomplete, getAutocompleteData, normalizeForSlashMenu, createKeyMenuItems } from './keyAutocomplete.js';
import { getDefaultItems, getTableCellItems, getTableItems } from './slashMenuItems.js';
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

class SlashMenuView {
  constructor(view) {
    this.view = view;
    this.menu = document.createElement('nx-slash-popover');
    this.menu.items = getDefaultItems() || [];

    this.menu.addEventListener('item-selected', (e) => {
      this.selectItem(e.detail);
    });
  }

  updateSlashMenuItems(pluginState, state) {
    const { $cursor } = state.selection;

    if (hasCellAreaSelected(state)) {
      this.menu.items = getTableCellItems(state);
      return;
    }

    if (!$cursor) {
      this.menu.items = getDefaultItems();
      return;
    }

    const tableInfo = getTableInfo(state, $cursor.pos);
    if (!tableInfo) {
      this.menu.items = getDefaultItems();
      return;
    }

    const { tableName, keyValue, isFirstColumn, columnsInRow } = tableInfo;
    const keyData = pluginState.autocompleteData?.get(tableName);

    if (!keyData) {
      this.menu.items = getTableItems(state);
      return;
    }

    if (isFirstColumn && columnsInRow === 2) {
      this.menu.items = createKeyMenuItems(keyData);
      return;
    }

    const normalizedKey = normalizeForSlashMenu(keyValue);
    this.menu.items = keyData.get(normalizedKey) || getTableItems(state);
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
    item.command(newState, dispatch, argument);

    this.hide();
  }

  handleKeyDown(event) {
    this.menu.handleKeyDown(event);
  }

  hide() {
    this.menu.hide();
  }

  destroy() {
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
      editorView.dom.parentNode.appendChild(pluginView.menu);

      editorView.dispatch(
        editorView.state.tr
          .setMeta(slashMenuKey, { autocompleteData: getAutocompleteData() })
          .setMeta('addToHistory', false),
      );

      return pluginView;
    },
  });
}
