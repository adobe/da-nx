/* eslint-disable import/no-unresolved -- importmap */
import {
  DOMParser,
  Fragment,
} from 'da-y-wrapper';
import {
  applyHeadingLevel,
  applyCodeBlock,
  applyBlockquote,
  applyBulletList,
  applyOrderedList,
} from '../../editor-utils/commands.js';

function getTableHeading(schema) {
  // eslint-disable-next-line camelcase
  const { paragraph, table_row, table_cell } = schema.nodes;
  const para = paragraph.create(null, schema.text('columns'));
  // eslint-disable-next-line camelcase
  return table_row.create(null, Fragment.from(table_cell.create({ colspan: 2 }, para)));
}

function getTableBody(schema) {
  const cell = schema.nodes.table_cell.createAndFill();
  return schema.nodes.table_row.create(null, Fragment.fromArray([cell, cell]));
}

function getTrailingParagraph(schema) {
  const fragment = document.createDocumentFragment();
  fragment.append(document.createElement('p'));
  return DOMParser.fromSchema(schema).parse(fragment);
}

export function insertEmptyTable(state, dispatch) {
  const heading = getTableHeading(state.schema);
  const content = getTableBody(state.schema);
  const para = getTrailingParagraph(state.schema);
  const node = state.schema.nodes.table.create(null, Fragment.fromArray([heading, content]));

  if (dispatch) {
    const trx = state.tr.insert(state.selection.head, para);
    trx.replaceSelectionWith(node).scrollIntoView();
    dispatch(trx);
  }
  return true;
}

export function insertSectionBreak(state, dispatch) {
  const div = document.createElement('div');
  div.append(document.createElement('hr'), document.createElement('p'));
  const newNodes = DOMParser.fromSchema(state.schema).parse(div);
  dispatch(state.tr.replaceSelectionWith(newNodes));
}

function generateLoremIpsum(lines = 5) {
  const loremSentences = [
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
    'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.',
    'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore.',
    'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia.',
    'Nunc feugiat mi a tellus consequat imperdiet.',
    'Vestibulum sapien proin quam etiam ultrices suscipit gravida bibendum.',
    'Fusce pellentesque enim aliquam varius tincidunt aenean vulputate.',
    'Maecenas volutpat blandit aliquam etiam erat velit scelerisque in dictum.',
  ];

  const result = [];
  for (let i = 0; i < lines; i += 1) {
    result.push(loremSentences[i % loremSentences.length]);
  }
  return result.join('  ');
}

const MAX_LINES = 100;

export function insertLoremIpsum(state, dispatch, lines = 5) {
  const linesInt = Math.min(parseInt(lines, 10) || 5, MAX_LINES);
  const { $cursor } = state.selection;

  if (!$cursor) return;
  const from = $cursor.before();
  const to = $cursor.pos;
  const loremText = generateLoremIpsum(linesInt);
  const tr = state.tr.replaceWith(from, to, state.schema.text(loremText));
  dispatch(tr);
}

function openLibraryPanel() {
  document.querySelector('nx-canvas-header')?.dispatchEvent(
    new CustomEvent('nx-canvas-open-panel', {
      bubbles: true,
      composed: true,
      detail: { position: 'after' },
    }),
  );
}

export const SLASH_MENU_HANDLERS = {
  'open-library': openLibraryPanel,
  'insert-block': insertEmptyTable,
  'heading-1': (s, d) => applyHeadingLevel(s, d, 1),
  'heading-2': (s, d) => applyHeadingLevel(s, d, 2),
  'heading-3': (s, d) => applyHeadingLevel(s, d, 3),
  blockquote: applyBlockquote,
  'code-block': applyCodeBlock,
  'bullet-list': applyBulletList,
  'numbered-list': applyOrderedList,
  'section-break': insertSectionBreak,
  'lorem-ipsum': insertLoremIpsum,
};
