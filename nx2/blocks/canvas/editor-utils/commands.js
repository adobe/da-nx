/* eslint-disable import/no-unresolved -- importmap */
import {
  liftListItem,
  setBlockType,
  TextSelection,
  wrapIn,
  wrapInList,
} from 'da-y-wrapper';

export const EDITOR_TEXT_FORMAT_ITEMS = [
  { id: 'heading-1', label: 'Heading 1', icon: 'Heading1' },
  { id: 'heading-2', label: 'Heading 2', icon: 'Heading2' },
  { id: 'heading-3', label: 'Heading 3', icon: 'Heading3' },
  { id: 'blockquote', label: 'Blockquote', icon: 'BlockQuote' },
  { id: 'code-block', label: 'Code block', icon: 'BlockCode' },
  { id: 'bullet-list', label: 'Bullet list', icon: 'ListBulleted' },
  { id: 'numbered-list', label: 'Numbered list', icon: 'ListNumbered' },
];

/* ---- Formatting commands (ProseMirror-standard positional signatures) ---- */

export const applyHeadingLevel = (state, dispatch, level) => (
  setBlockType(state.schema.nodes.heading, { level })(state, dispatch)
);

export const applyCodeBlock = (state, dispatch) => (
  setBlockType(state.schema.nodes.code_block)(state, dispatch)
);

export const applyParagraph = (state, dispatch) => (
  setBlockType(state.schema.nodes.paragraph)(state, dispatch)
);

export const applyBlockquote = (state, dispatch) => (
  wrapIn(state.schema.nodes.blockquote)(state, dispatch)
);

export const applyBulletList = (state, dispatch) => (
  wrapInList(state.schema.nodes.bullet_list)(state, dispatch)
);

export const applyOrderedList = (state, dispatch) => (
  wrapInList(state.schema.nodes.ordered_list)(state, dispatch)
);

/* ---- Selection / document queries ---- */

function forEachTextblockInSelection({ doc, selection }, visit) {
  doc.nodesBetween(selection.from, selection.to, (node, pos) => {
    if (node.isTextblock) {
      visit(node, pos);
      return false;
    }
    return true;
  });
}

function everyTextblockInSelection(state, pred) {
  let seen = false;
  let ok = true;
  forEachTextblockInSelection(state, (node, pos) => {
    seen = true;
    if (!pred(node, pos)) ok = false;
  });
  return seen && ok;
}

function allTextblocksAreCodeBlock(state) {
  return everyTextblockInSelection(state, (node) => node.type.name === 'code_block');
}

function blockquoteDepthInnermost($pos) {
  for (let d = $pos.depth; d > 0; d -= 1) {
    if ($pos.node(d).type.name === 'blockquote') return d;
  }
  return 0;
}

function selectionFullyInBlockquote(state) {
  const { $from, $to } = state.selection;
  return blockquoteDepthInnermost($from) > 0 && blockquoteDepthInnermost($to) > 0;
}

function nearestListParentType($pos) {
  for (let d = $pos.depth; d > 0; d -= 1) {
    const { name } = $pos.node(d).type;
    if (name === 'bullet_list' || name === 'ordered_list') return name;
  }
  return null;
}

function selectionFullyInListType(state, listTypeName) {
  const { $from, $to } = state.selection;
  return nearestListParentType($from) === listTypeName
    && nearestListParentType($to) === listTypeName;
}

function unwrapInnerBlockquote(state, dispatch) {
  const d = blockquoteDepthInnermost(state.selection.$from);
  if (!d) return false;
  const { $from } = state.selection;
  const start = $from.before(d);
  const end = $from.after(d);
  const quote = $from.node(d);
  dispatch(state.tr.replaceWith(start, end, quote.content).scrollIntoView());
  return true;
}

function liftUntilNotInList(view, listItemType, listTypeName) {
  const maxSteps = 64;
  for (let i = 0; i < maxSteps; i += 1) {
    const { state } = view;
    const { $from, $to } = state.selection;
    if (nearestListParentType($from) !== listTypeName
      || nearestListParentType($to) !== listTypeName) break;
    const lifted = liftListItem(listItemType)(state, (tr) => {
      view.dispatch(tr.scrollIntoView());
    });
    if (!lifted) break;
  }
}

/* ---- Structure toggle map ---- */

const TOGGLES = {
  'code-block': {
    isActive: allTextblocksAreCodeBlock,
    apply: applyCodeBlock,
    unapply: applyParagraph,
  },
  blockquote: {
    isActive: selectionFullyInBlockquote,
    apply: applyBlockquote,
    unapply: unwrapInnerBlockquote,
  },
  'bullet-list': {
    listType: 'bullet_list',
    isActive: (state) => selectionFullyInListType(state, 'bullet_list'),
    apply: applyBulletList,
  },
  'numbered-list': {
    listType: 'ordered_list',
    isActive: (state) => selectionFullyInListType(state, 'ordered_list'),
    apply: applyOrderedList,
  },
};

export function isStructureActive(id, state) {
  return TOGGLES[id]?.isActive(state) ?? false;
}

export function toggleStructure(id, view) {
  const { state } = view;
  const dispatch = view.dispatch.bind(view);
  const t = TOGGLES[id];
  if (t.isActive(state)) {
    if (t.unapply) {
      t.unapply(state, dispatch);
    } else {
      liftUntilNotInList(view, state.schema.nodes.list_item, t.listType);
    }
  } else {
    t.apply(state, dispatch);
  }
}

/* ---- Mark helpers ---- */

export function markIsActiveInSelection(state, mark) {
  const { selection, storedMarks } = state;
  if (selection.empty) {
    const marks = storedMarks || selection.$from.marks();
    return marks.some((m) => m.type === mark);
  }
  return state.doc.rangeHasMark(selection.from, selection.to, mark);
}

export function toggleMarkOnSelection(view, markName) {
  const { state } = view;
  const { schema, selection, tr } = state;
  const mark = schema.marks[markName];
  const hasMark = markIsActiveInSelection(state, mark);
  if (selection.empty) {
    if (hasMark) view.dispatch(tr.removeStoredMark(mark));
    else view.dispatch(tr.addStoredMark(mark.create()));
  } else if (hasMark) {
    view.dispatch(tr.removeMark(selection.from, selection.to, mark));
  } else {
    view.dispatch(tr.addMark(selection.from, selection.to, mark.create()));
  }
}

/* ---- Block-type picker value (used by toolbar to sync the picker) ---- */

export function getBlockTypePickerValue(state) {
  const keys = [];
  forEachTextblockInSelection(state, (node) => {
    if (node.type.name === 'heading') {
      keys.push(`heading-${node.attrs.level}`);
    } else {
      keys.push(node.type.name);
    }
  });
  const uniq = [...new Set(keys)];
  if (uniq.length === 0) return 'paragraph';
  if (uniq.length > 1) return 'mixed';
  return uniq[0];
}

/* ---- Link helpers ---- */

function findLinkInRange(state) {
  const { from, to } = state.selection;
  const linkType = state.schema.marks.link;
  let found;

  state.doc.nodesBetween(from, to, (node, pos) => {
    if (found) return false;
    const mark = linkType.isInSet(node.marks);
    if (mark) {
      found = { node, mark, from: pos, to: pos + node.nodeSize };
    }
    return true;
  });
  return found ?? null;
}

export function selectionHasLink(state) {
  return findLinkInRange(state) !== null;
}

export function getLinkInfoInSelection(state) {
  const result = findLinkInRange(state);
  if (!result) return null;
  return {
    href: result.mark.attrs.href ?? '',
    title: result.mark.attrs.title ?? '',
    text: result.node.textContent,
    from: result.from,
    to: result.to,
  };
}

export function applyLink(view, { href, text }) {
  const { state } = view;
  const { schema, selection } = state;
  const linkType = schema.marks.link;
  let { from, to } = selection;

  let { tr } = state;

  const existingLink = findLinkInRange(state);
  if (existingLink) {
    ({ from, to } = existingLink);
    tr = tr.removeMark(from, to, linkType);
  }

  const displayText = text?.trim() || href;
  const originalText = state.doc.textBetween(from, to);

  if (displayText !== originalText || from === to) {
    const marks = from < state.doc.content.size
      ? state.doc.resolve(from).marks().filter((m) => m.type !== linkType)
      : [];
    const textNode = schema.text(displayText, marks);
    tr = tr.replaceWith(from, to, textNode);
    to = from + displayText.length;
  }

  tr = tr.addMark(from, to, linkType.create({ href: href.trim() }));
  tr = tr.setSelection(TextSelection.create(tr.doc, to));
  view.dispatch(tr);
}

export function removeLink(view) {
  const { state } = view;
  const linkType = state.schema.marks.link;
  const found = findLinkInRange(state);
  if (!found) return;

  const { tr } = state;
  tr.removeMark(found.from, found.to, linkType);
  view.dispatch(tr);
}
