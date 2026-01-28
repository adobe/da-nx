import {
  DOMParser,
  Plugin,
  addColumnAfter,
  addColumnBefore,
  deleteColumn,
  addRowAfter,
  addRowBefore,
  deleteRow,
  mergeCells,
  splitCell,
  deleteTable,
  MenuItem,
  Dropdown,
  renderGrouped,
  blockTypeItem,
  wrapItem,
  setBlockType,
  toggleMark,
  yUndoPluginKey,
  wrapInList,
  liftListItem,
  sinkListItem,
} from 'da-y-wrapper';

import { linkItem, removeLinkItem } from './linkItem.js';
import { markActive } from './menuUtils.js';

function canInsert(state, nodeType) {
  const { $from } = state.selection;
  // eslint-disable-next-line no-plusplus
  for (let d = $from.depth; d >= 0; d--) {
    const index = $from.index(d);
    if ($from.node(d).canReplaceWith(index, index, nodeType)) { return true; }
  }
  return false;
}

function cmdItem(cmd, options) {
  const passedOptions = {
    label: options.title,
    run: cmd,
  };
  // eslint-disable-next-line guard-for-in, no-restricted-syntax
  for (const prop in options) {
    passedOptions[prop] = options[prop];
  }
  if (!options.enable && !options.select) {
    passedOptions.enable = (state) => cmd(state);
  }
  return new MenuItem(passedOptions);
}

function markItem(markType, options) {
  const passedOptions = { active(state) { return markActive(state, markType); } };
  // eslint-disable-next-line no-restricted-syntax, guard-for-in
  for (const prop in options) { passedOptions[prop] = options[prop]; }
  return cmdItem(toggleMark(markType), passedOptions);
}

function codeBlockItem(codeBlockNode) {
  const cmd = setBlockType(codeBlockNode);

  return new MenuItem({
    title: 'Change to code block',
    label: 'Code',
    column: 2,
    class: 'menu-item-codeblock',
    enable(state) {
      return cmd(state);
    },
    active(state) {
      const { $from } = state.selection;
      return $from.parent.type.name === 'code_block';
    },
    run: cmd,
  });
}

function blockquoteItem(blockquoteNode) {
  return wrapItem(blockquoteNode, {
    title: 'Change to blockquote',
    label: 'Blockquote',
    column: 2,
    class: 'menu-item-blockquote',
  });
}

function headingItem(headingNode, options) {
  options.active = (state) => {
    const { $from } = state.selection;
    return $from.parent.type.name === 'heading'
      && $from.parent.attrs.level === options.attrs.level;
  };
  return blockTypeItem(headingNode, options);
}

function createBlockMenuItem(node, options) {
  const {
    type,
    level,
    title,
    label,
    column,
    class: className,
  } = options;
  const attrs = type === 'heading' ? { level } : {};
  const menuItem = type === 'heading' ? headingItem : blockTypeItem;

  const menuOptions = {
    title,
    label,
    attrs,
    ...(column && { column }),
    ...(className && { class: className }),
  };

  return menuItem(node, menuOptions);
}

export function getHeadingKeymap(schema) {
  const headingNode = schema.nodes.heading;
  const paragraphNode = schema.nodes.paragraph;

  const keymap = {
    'Mod-Alt-0': (state, dispatch) => {
      const menuItem = createBlockMenuItem(paragraphNode, {
        type: 'paragraph',
        title: 'Change to paragraph',
        label: 'P',
      });
      return menuItem.spec.run(state, dispatch);
    },
  };

  // Add heading shortcuts H1-H6
  [1, 2, 3, 4, 5, 6].forEach((level) => {
    keymap[`Mod-Alt-${level}`] = (state, dispatch) => {
      const menuItem = createBlockMenuItem(headingNode, {
        type: 'heading',
        level,
        title: `Change to heading ${level}`,
        label: `H${level}`,
      });
      return menuItem.spec.run(state, dispatch);
    };
  });

  return keymap;
}

function tableItem(label, cmd, css) {
  return new MenuItem({
    label,
    title: label,
    select: cmd,
    run: cmd,
    class: css,
  });
}

function getTableMenu() {
  return [
    tableItem('Insert column before', addColumnBefore, 'addColBefore'),
    tableItem('Insert column after', addColumnAfter, 'addColumnAfter'),
    tableItem('Delete column', deleteColumn, 'deleteColumn'),
    tableItem('Insert row before', addRowBefore, 'addRowBefore'),
    tableItem('Insert row after', addRowAfter, 'addRowAfter'),
    tableItem('Delete row', deleteRow, 'deleteRow'),
    tableItem('Merge cells', mergeCells, 'mergeCells'),
    tableItem('Split cell', splitCell, 'splitCell'),
    tableItem('Delete table', deleteTable, 'deleteTable'),
  ];
}

function getTextBlocks(marks, nodes) {
  const headingItems = [1, 2, 3, 4, 5, 6].map((i) => createBlockMenuItem(nodes.heading, {
    type: 'heading',
    level: i,
    title: `Change to H${i}`,
    label: `H${i}`,
    column: 2,
    class: `menu-item-h${i}`,
  }));

  return [
    createBlockMenuItem(nodes.paragraph, {
      type: 'paragraph',
      title: 'Change to paragraph',
      label: 'P',
      column: 2,
      class: 'menu-item-para',
    }),
    markItem(marks.strong, {
      title: 'Toggle bold',
      label: 'B',
      class: 'edit-bold',
    }),
    markItem(marks.em, {
      title: 'Toggle italic',
      label: 'I',
      class: 'edit-italic',
    }),
    markItem(marks.u, {
      title: 'Toggle underline',
      label: 'U',
      class: 'edit-underline',
    }),
    markItem(marks.s, {
      title: 'Toggle strikethrough',
      label: 'S',
      class: 'edit-strikethrough',
    }),
    markItem(marks.sup, {
      title: 'Toggle superscript',
      label: 'SUP',
      class: 'edit-sup',
    }),
    markItem(marks.sub, {
      title: 'Toggle subscript',
      label: 'SUB',
      class: 'edit-sub',
    }),
    markItem(marks.code, {
      title: 'Toggle inline code',
      label: 'Code',
      class: 'edit-code',
    }),
    ...headingItems,
    blockquoteItem(nodes.blockquote),
    codeBlockItem(nodes.code_block),
  ];
}

function shouldEnableIndentOutdentIcon(state, listType) {
  const { $from } = state.selection;
  if ($from.node($from.depth - 1)?.type === listType) return true;
  return false;
}

function getListMenu(nodes) {
  return [
    new MenuItem({
      title: 'Bullet List',
      label: 'Bullet List',
      class: 'bullet-list',
      run(initialState, dispatch) {
        wrapInList(nodes.bullet_list)(initialState, dispatch);
      },
    }),
    new MenuItem({
      title: 'Ordered List',
      label: 'Ordered List',
      class: 'ordered-list',
      run(state, dispatch) {
        wrapInList(nodes.ordered_list)(state, dispatch);
      },
    }),
    new MenuItem({
      title: 'Indent List',
      label: 'Indent List',
      class: 'indent-list',
      enable(state) { return shouldEnableIndentOutdentIcon(state, nodes.list_item); },
      run(state, dispatch) {
        sinkListItem(nodes.list_item)(state, dispatch);
      },
    }),
    new MenuItem({
      title: 'Outdent List',
      label: 'Outdent List',
      class: 'outdent-list',
      enable(state) { return shouldEnableIndentOutdentIcon(state, nodes.list_item); },
      run: liftListItem(nodes.list_item),
    }),
  ];
}

export function insertSectionBreak(state, dispatch) {
  const div = document.createElement('div');
  div.append(document.createElement('hr'), document.createElement('p'));
  const newNodes = DOMParser.fromSchema(state.schema).parse(div);
  dispatch(state.tr.replaceSelectionWith(newNodes));
}

function insertTable(state, dispatch) {
  // Simple 2x2 table insertion
  const table = document.createElement('table');
  for (let i = 0; i < 2; i++) {
    const row = document.createElement('tr');
    for (let j = 0; j < 2; j++) {
      const cell = document.createElement('td');
      cell.appendChild(document.createElement('p'));
      row.appendChild(cell);
    }
    table.appendChild(row);
  }
  const div = document.createElement('div');
  div.className = 'tableWrapper';
  div.appendChild(table);
  const newNodes = DOMParser.fromSchema(state.schema).parse(div);
  dispatch(state.tr.replaceSelectionWith(newNodes));
}

// Simplified library toggle for portal
function toggleLibrary() {
  // Post message to parent to open library
  if (window.parent) {
    window.parent.postMessage({ type: 'open-library' }, '*');
  }
}

function getMenu(view) {
  const menu = document.createElement('div');
  menu.className = 'ProseMirror-menubar';

  const { marks, nodes } = view.state.schema;
  const editTable = getTableMenu();
  const textBlocks = getTextBlocks(marks, nodes);

  const textMenu = [
    new Dropdown(textBlocks, {
      title: 'Edit text',
      label: 'Edit text',
      class: 'edit-text',
    }),
    linkItem(marks.link),
    removeLinkItem(marks.link),
  ];

  const listMenu = [
    new Dropdown(getListMenu(nodes), {
      title: 'List menu',
      label: 'List',
      class: 'list-menu',
    }),
  ];

  const blockMenu = [
    new MenuItem({
      title: 'Open library',
      label: 'Library',
      enable() { return true; },
      run() {
        toggleLibrary();
      },
      class: 'open-library',
    }),
    new Dropdown(editTable, {
      title: 'Edit block',
      label: 'Edit block',
      class: 'edit-table',
    }),
    new MenuItem({
      title: 'Insert block',
      label: 'Block',
      run: insertTable,
      class: 'insert-table',
    }),
    new MenuItem({
      title: 'Insert section break',
      label: 'Section',
      enable(state) { return canInsert(state, nodes.horizontal_rule); },
      run: insertSectionBreak,
      class: 'edit-hr',
    }),
  ];

  const undoMenu = [
    new MenuItem({
      title: 'Undo last change',
      label: 'Undo',
      run: (state) => {
        const undo = yUndoPluginKey.getState(state);
        if (undo) {
          undo.undo();
          return true;
        }
        return false;
      },
      enable: (state) => yUndoPluginKey.getState(state)?.hasUndoOps,
      class: 'edit-undo',
    }),
    new MenuItem({
      title: 'Redo last undone change',
      label: 'Redo',
      run: (state) => {
        const undo = yUndoPluginKey.getState(state);
        if (undo) {
          undo.redo();
          return true;
        }
        return false;
      },
      enable: (state) => yUndoPluginKey.getState(state)?.hasRedoOps,
      class: 'edit-redo',
    }),
  ];

  const content = [textMenu, listMenu, blockMenu, undoMenu];

  const { dom, update } = renderGrouped(view, content);

  menu.append(dom);

  return { menu, update };
}

export default new Plugin({
  view: (view) => {
    const { menu, update } = getMenu(view);
    const palettes = document.createElement('div');
    palettes.className = 'da-palettes';
    view.dom.insertAdjacentElement('beforebegin', menu);
    view.dom.insertAdjacentElement('afterend', palettes);
    update(view.state);
    // eslint-disable-next-line no-shadow
    return { update: (view) => update(view.state) };
  },
});
