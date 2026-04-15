/* eslint-disable import/no-unresolved -- importmap */
import {
  setBlockType,
  wrapIn,
  wrapInList,
  addColumnBefore,
  addColumnAfter,
  addRowAfter,
  addRowBefore,
  deleteColumn,
  deleteRow,
  mergeCells,
  splitCell,
  DOMParser,
} from 'da-y-wrapper';
import insertTable from './insertTable.js';
import loremIpsum from './loremIpsum.js';

function insertSectionBreak(state, dispatch) {
  const div = document.createElement('div');
  div.append(document.createElement('hr'), document.createElement('p'));
  const newNodes = DOMParser.fromSchema(state.schema).parse(div);
  dispatch(state.tr.replaceSelectionWith(newNodes));
}

const setHeading = (state, dispatch, level) => {
  const type = state.schema.nodes.heading;
  return setBlockType(type, { level })(state, dispatch);
};

const wrapInBlockquote = (state, dispatch) => {
  const { blockquote } = state.schema.nodes;
  return wrapIn(blockquote)(state, dispatch);
};

const wrapInCodeBlock = (state, dispatch) => {
  /* eslint-disable-next-line camelcase -- schema node name */
  const { code_block } = state.schema.nodes;
  return setBlockType(code_block)(state, dispatch);
};

/** Opens the canvas after (right) panel — event bubbles to `canvas` block listener. */
function openLibraryPanel(state, dispatch, _argument, view) {
  const dom = view?.dom;
  if (!dom) return false;
  dom.dispatchEvent(new CustomEvent('nx-canvas-open-panel', {
    bubbles: true,
    composed: true,
    detail: { position: 'after' },
  }));
  return true;
}

const insertBlockItem = {
  title: 'Insert block',
  command: insertTable,
  class: 'insert-table',
  excludeFromTable: true,
};

const openLibraryItem = {
  title: 'Open library',
  command: openLibraryPanel,
  class: 'menu-item-open-library',
};

const blockGroupItems = [insertBlockItem, openLibraryItem];

const textItems = [
  {
    title: 'Heading 1',
    command: (state, dispatch) => setHeading(state, dispatch, 1),
    class: 'menu-item-h1',
  },
  {
    title: 'Heading 2',
    command: (state, dispatch) => setHeading(state, dispatch, 2),
    class: 'menu-item-h2',
  },
  {
    title: 'Heading 3',
    command: (state, dispatch) => setHeading(state, dispatch, 3),
    class: 'menu-item-h3',
  },
  {
    title: 'Blockquote',
    command: wrapInBlockquote,
    class: 'menu-item-blockquote',
  },
  {
    title: 'Code block',
    command: wrapInCodeBlock,
    class: 'menu-item-codeblock',
  },
  {
    title: 'Bullet list',
    command: (state, dispatch) => wrapInList(state.schema.nodes.bullet_list)(state, dispatch),
    class: 'bullet-list',
  },
  {
    title: 'Numbered list',
    command: (state, dispatch) => wrapInList(state.schema.nodes.ordered_list)(state, dispatch),
    class: 'ordered-list',
  },
  {
    title: 'Section break',
    command: insertSectionBreak,
    class: 'edit-hr',
    excludeFromTable: true,
  },
  {
    title: 'Lorem ipsum',
    command: loremIpsum,
    class: 'lorem-ipsum',
    argument: true,
  },
];

const tableItems = [
  {
    title: 'Add Column After',
    command: addColumnAfter,
    class: 'insert-column-right',
  },
  {
    title: 'Add Column Before',
    command: addColumnBefore,
    class: 'insert-column-left',
  },
  {
    title: 'Add Row After',
    command: addRowAfter,
    class: 'insert-row-after',
  },
  {
    title: 'Add Row Before',
    command: addRowBefore,
    class: 'insert-row-before',
  },
  {
    title: 'Delete Row',
    command: deleteRow,
    class: 'delete-row',
  },
  {
    title: 'Delete Column',
    command: deleteColumn,
    class: 'delete-column',
  },
  {
    title: 'Split Cell',
    command: splitCell,
    class: 'split-cell',
  },
];

export function getDefaultSlashGroups() {
  return [
    { label: 'Block', items: blockGroupItems },
    { label: 'Text', items: textItems },
  ];
}

/** Flat list (e.g. search, tests) — block items first, then text. */
export const getDefaultItems = () => [...blockGroupItems, ...textItems];

export const getTableItems = (state) => {
  const availableTable = tableItems.filter((item) => item.command(state));
  const rest = textItems.filter((item) => !item.excludeFromTable);
  const inTableBlockRow = blockGroupItems.filter((item) => !item.excludeFromTable);
  return [...availableTable, ...inTableBlockRow, ...rest];
};

export const getTableCellItems = (state) => ([
  {
    title: 'Merge Cells',
    command: mergeCells,
    class: 'merge-cells',
    enabled: mergeCells(state),
  },
].filter((x) => x.enabled !== false));
