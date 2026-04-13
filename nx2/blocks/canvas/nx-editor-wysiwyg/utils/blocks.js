import { NodeSelection, Fragment } from 'da-y-wrapper';

/**
 * Block name from a ProseMirror table (first row, first cell text). Matches prose2aem block naming.
 * @param {import('prosemirror-model').Node} tableNode
 * @returns {string}
 */
function getTableBlockName(tableNode) {
  const firstRow = tableNode.firstChild;
  if (!firstRow) return '';
  const firstCell = firstRow.firstChild;
  if (!firstCell) return '';
  const raw = firstCell.textContent?.trim() ?? '';
  const match = raw.match(/^([a-zA-Z0-9_\s-]+)(?:\s*\([^)]*\))?$/);
  return match ? match[1].trim().toLowerCase() : raw.toLowerCase();
}

/**
 * Collect start positions of all block nodes (tables) in document order, excluding the root
 * "metadata" block (it is stripped by prose2aem in live preview so it has no corresponding
 * block in the outline HTML).
 * @param {import('prosemirror-view').EditorView} view
 * @returns {number[]}
 */
export function getBlockPositions(view) {
  if (!view?.state?.doc) return [];
  const positions = [];
  const { doc } = view.state;
  doc.descendants((node, pos) => {
    if (node.type.name === 'table') {
      const blockName = getTableBlockName(node);
      if (blockName === 'metadata') return;
      positions.push(pos);
    }
  });
  return positions;
}

/**
 * Return the flat block index (matching getBlockPositions order) that the cursor is currently
 * inside, or -1 if the cursor is not within any block.
 * @param {import('prosemirror-view').EditorView} view
 * @returns {number}
 */
export function getActiveBlockFlatIndex(view) {
  if (!view?.state) return -1;
  const { state } = view;
  const cursorPos = state.selection.from;
  const positions = getBlockPositions(view);
  for (let i = 0; i < positions.length; i += 1) {
    const start = positions[i];
    const node = state.doc.resolve(start).nodeAfter;
    if (!node) continue; // eslint-disable-line no-continue
    if (cursorPos >= start && cursorPos < start + node.nodeSize) return i;
  }
  return -1;
}

/**
 * Apply a NodeSelection to the table block at the given flat index.
 * Used to restore selection when the editor is recreated (e.g. on view-mode switch).
 * @param {import('prosemirror-view').EditorView} view
 * @param {number} blockIndex
 */
export function applyBlockSelection(view, blockIndex) {
  if (!view || blockIndex < 0) return;
  const positions = getBlockPositions(view);
  if (blockIndex >= positions.length) return;
  try {
    const sel = NodeSelection.create(view.state.doc, positions[blockIndex]);
    view.dispatch(view.state.tr.setSelection(sel).scrollIntoView());
  } catch (e) {
    // Block may not be selectable (e.g. position out of range); ignore silently.
  }
}

export function sendScrollToBlock(ctx, blockIndex) {
  // eslint-disable-next-line no-console
  console.log('[sendScrollToBlock]', { hasPort: !!ctx?.port, blockIndex });
  if (!ctx?.port || blockIndex < 0) return;
  const positions = getBlockPositions(ctx.view);
  // eslint-disable-next-line no-console
  console.log('[sendScrollToBlock] positions', positions, 'prosePos', positions[blockIndex]);
  if (blockIndex >= positions.length) return;
  ctx.port.postMessage({ type: 'scroll-to-block', prosePos: positions[blockIndex] });
}

/**
 * Insert a new section (horizontal_rule + empty paragraph) after the section at sectionIndex.
 * Sections are 0-indexed and map to the div children of main/body in the AEM HTML.
 * Section N is followed by the N-th horizontal_rule in the ProseMirror document.
 * @param {{ sectionIndex: number }} data
 * @param {{ view: import('prosemirror-view').EditorView }} ctx
 */
export function insertSectionAfter(data, ctx) {
  const { sectionIndex } = data;
  const { view } = ctx || {};
  if (!view?.state) return;

  const { tr, schema, doc } = view.state;
  const hrType = schema.nodes.horizontal_rule;
  const pType = schema.nodes.paragraph;
  if (!hrType || !pType) return;

  // Collect positions of all horizontal_rule nodes (section separators), in document order
  const hrPositions = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'horizontal_rule') {
      hrPositions.push(pos);
    }
  });

  // Section N is followed by hr[N]. Insert [hr][p] just before hr[N],
  // or at the end of the doc when sectionIndex is the last section.
  const insertPos = sectionIndex < hrPositions.length
    ? hrPositions[sectionIndex]
    : doc.content.size;

  try {
    tr.insert(insertPos, [hrType.create(), pType.create()]);
    view.dispatch(tr.scrollIntoView());
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[quick-edit-controller] insertSectionAfter failed', e?.message);
  }
}

/**
 * Insert a block from the library into the section at sectionIndex.
 * When parsedNode is provided (a ProseMirror doc from the da-live library) its content
 * Fragment is inserted directly. When only blockName is provided (standalone block with
 * no library page) a minimal skeleton table is created instead.
 * @param {{ sectionIndex: number, parsedNode?: object, blockName?: string }} data
 * @param {{ view: import('prosemirror-view').EditorView }} ctx
 */
export function insertBlockAtSection({ sectionIndex, parsedNode, blockName }, ctx) {
  const { view } = ctx || {};
  if (!view?.state || (!parsedNode && !blockName)) return;

  const { tr, schema, doc } = view.state;

  // Collect positions of section separators (horizontal_rule nodes)
  const hrPositions = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'horizontal_rule') hrPositions.push(pos);
  });

  // Section N ends just before hr[N], or at doc end for the last section
  const insertPos = sectionIndex < hrPositions.length
    ? hrPositions[sectionIndex]
    : doc.content.size;

  try {
    let content;
    if (parsedNode) {
      // parsedNode is a doc — use its content Fragment (strips the doc wrapper)
      content = parsedNode.content;
    } else {
      // Skeleton fallback: header cell with block name + one empty content row
      const { table, paragraph } = schema.nodes;
      const tableRow = schema.nodes.table_row;
      const tableCell = schema.nodes.table_cell;
      const headingCell = tableCell.create(
        { colspan: 2 },
        paragraph.create(null, schema.text(blockName)),
      );
      const headingRow = tableRow.create(null, Fragment.from(headingCell));
      const contentCell = tableCell.createAndFill();
      const contentRow = tableRow.create(null, Fragment.fromArray([contentCell, contentCell]));
      content = Fragment.from(table.create(null, Fragment.fromArray([headingRow, contentRow])));
    }
    tr.insert(insertPos, content);
    view.dispatch(tr.scrollIntoView());
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[quick-edit-controller] insertBlockAtSection failed', e?.message);
  }
}

/**
 * Move the block (table) at fromIndex to before the block at toIndex.
 * Indices are the position before each table (from getBlockPositions), so the table is nodeAfter.
 * @param {{ fromIndex: number, toIndex: number }} data - ProseMirror positions
 * @param {{ view: import('prosemirror-view').EditorView }} ctx
 */
export function moveBlockAt(data, ctx) {
  const { fromIndex, toIndex } = data;
  const { view } = ctx || {};
  if (!view?.state) return;

  const { tr, doc } = view.state;

  try {
    const $fromPos = doc.resolve(fromIndex);
    const tableNode = $fromPos.nodeAfter;
    if (!tableNode?.type || tableNode.type.name !== 'table') return;

    const fromStart = $fromPos.pos;
    const fromEnd = fromStart + tableNode.nodeSize;

    const $toPos = doc.resolve(toIndex);
    if ($toPos.nodeAfter?.type?.name !== 'table') return;
    const toStart = $toPos.pos;

    tr.delete(fromStart, fromEnd);
    const insertPos = toStart > fromStart ? toStart - tableNode.nodeSize : toStart;
    tr.insert(insertPos, tableNode);

    view.dispatch(tr.scrollIntoView());
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[quick-edit-controller] moveBlockAt failed', e?.message);
  }
}
