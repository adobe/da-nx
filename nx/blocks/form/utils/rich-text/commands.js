import { HEADING_LEVELS, LIST_NAMES, safeHref } from './schema.js';

// ProseMirror is injected as `pm`, the da-y-wrapper namespace. Commands take (state, dispatch).

function ancestors($pos) {
  return Array.from({ length: $pos.depth }, (_, i) => {
    const depth = $pos.depth - i;
    return { node: $pos.node(depth), depth };
  });
}

function childrenAt(parent, start) {
  const children = [];
  parent.forEach((node, offset) => children.push({ node, pos: start + offset }));
  return children;
}

function dryRun(command, state) {
  const transactions = [];
  command(state, (tr) => transactions.push(tr));
  return transactions[0];
}

export function getActiveMarks(state) {
  const { doc, schema, selection, storedMarks } = state;
  const { from, to, empty, $from } = selection;
  const current = empty ? (storedMarks ?? $from.marks()) : null;
  return new Set(Object.values(schema.marks)
    .filter((type) => (empty ? !!type.isInSet(current) : doc.rangeHasMark(from, to, type)))
    .map((type) => type.name));
}

export const BLOCK_TYPES = [
  { value: 'paragraph', label: 'Paragraph', node: 'paragraph' },
  ...HEADING_LEVELS.map((level) => ({
    value: `heading-${level}`, label: `Heading ${level}`, node: 'heading', attrs: { level },
  })),
];

export function getBlockType(state) {
  const { parent } = state.selection.$from;
  const { nodes } = state.schema;
  return BLOCK_TYPES.find(({ node, attrs }) => parent.hasMarkup(nodes[node], attrs))?.value ?? null;
}

export function setBlock({ pm, value }) {
  return (state, dispatch) => {
    const block = BLOCK_TYPES.find((type) => type.value === value);
    if (!block) {
      return false;
    }
    return pm.setBlockType(state.schema.nodes[block.node], block.attrs)(state, dispatch);
  };
}

export function isInBlockquote(state) {
  return ancestors(state.selection.$from).some(({ node }) => node.type.name === 'blockquote');
}

export function toggleBlockquote({ pm }) {
  return (state, dispatch) => {
    const type = state.schema.nodes.blockquote;
    if (!isInBlockquote(state)) {
      return pm.wrapIn(type)(state, dispatch);
    }

    const { $from, $to } = state.selection;
    const range = $from.blockRange($to, (node) => node.type === type);
    if (!range) {
      return false;
    }

    dispatch?.(state.tr.lift(range, range.depth - 1).scrollIntoView());
    return true;
  };
}

function markRuns({ parent, start, mark }) {
  return childrenAt(parent, start)
    .filter(({ node }) => mark.isInSet(node.marks))
    .reduce((runs, { node, pos }) => {
      const last = runs.at(-1);
      const to = pos + node.nodeSize;
      if (last?.to === pos) {
        return [...runs.slice(0, -1), { from: last.from, to }];
      }
      return [...runs, { from: pos, to }];
    }, []);
}

export function getLinkAt(state) {
  const { $from, from, empty } = state.selection;
  const marks = empty ? $from.marks() : (state.doc.nodeAt(from)?.marks ?? []);
  const mark = state.schema.marks.link.isInSet(marks);
  if (!mark) {
    return null;
  }

  const range = markRuns({ parent: $from.parent, start: $from.start(), mark })
    .find((run) => run.from <= from && from <= run.to);
  if (!range) {
    return null;
  }

  const { href, title } = mark.attrs;
  return { href, title: title ?? '', ...range };
}

function linkRange(state, link = getLinkAt(state)) {
  const { from, to } = state.selection;
  if (!link) {
    return { from, to };
  }
  return { from: Math.min(from, link.from), to: Math.max(to, link.to) };
}

export function getLinkDraft(state) {
  const link = getLinkAt(state);
  const { from, to } = linkRange(state, link);
  return {
    href: link?.href ?? '', title: link?.title ?? '', text: state.doc.textBetween(from, to, ' '),
  };
}

function marksAt({ state, from, to }) {
  if (from === to) {
    return state.storedMarks ?? state.selection.$from.marks();
  }
  return state.doc.nodeAt(from)?.marks ?? [];
}

export function applyLink({
  pm, href, text, title,
}) {
  return (state, dispatch) => {
    const safe = safeHref(href);
    if (!safe) {
      return false;
    }
    if (!dispatch) {
      return true;
    }

    const type = state.schema.marks.link;
    const { from, to } = linkRange(state);
    const display = text?.trim() || safe;
    const keepsText = from !== to && display === state.doc.textBetween(from, to, ' ');
    const end = keepsText ? to : from + display.length;
    const tr = state.tr.removeMark(from, to, type);
    if (!keepsText) {
      const marks = type.removeFromSet(marksAt({ state, from, to }));
      tr.replaceWith(from, to, state.schema.text(display, marks));
    }

    tr.addMark(from, end, type.create({ href: safe, title: title?.trim() || null }));
    tr.setSelection(pm.TextSelection.create(tr.doc, end));
    dispatch(tr.scrollIntoView());
    return true;
  };
}

export function removeLink(state, dispatch) {
  const type = state.schema.marks.link;
  const { from, to, empty } = state.selection;
  const range = empty ? getLinkAt(state) : { from, to };
  if (!range || !state.doc.rangeHasMark(range.from, range.to, type)) {
    return false;
  }

  dispatch?.(state.tr.removeMark(range.from, range.to, type).scrollIntoView());
  return true;
}

export function getListType(state) {
  const list = ancestors(state.selection.$from).find(({ node }) => LIST_NAMES.has(node.type.name));
  return list ? { name: list.node.type.name, depth: list.depth } : null;
}

function liftOutOfLists({
  pm, state, tr, pos,
}) {
  const itemType = state.schema.nodes.list_item;
  const $pos = state.doc.resolve(pos);
  if ($pos.depth < 2 || $pos.node(-1).type !== itemType) {
    return state;
  }

  const selected = state.apply(state.tr.setSelection(pm.TextSelection.create(state.doc, pos)));
  const lifted = dryRun(pm.liftListItem(itemType), selected);
  if (!lifted) {
    return state;
  }

  lifted.steps.forEach((step) => tr.step(step));
  const next = selected.apply(lifted);
  return liftOutOfLists({
    pm, state: next, tr, pos: next.selection.from,
  });
}

// List items may only hold a paragraph and nested lists, so items are lifted one at a time.
export function unwrapListItems({ pm }) {
  return (state, dispatch) => {
    const { from, to } = state.selection;
    const itemType = state.schema.nodes.list_item;
    const starts = [];
    state.doc.nodesBetween(from, to, (node, pos, parent) => {
      if (node.type.name === 'paragraph' && parent?.type === itemType) {
        starts.push(pos + 1);
      }
    });
    if (!starts.length) {
      return false;
    }
    if (!dispatch) {
      return true;
    }

    const tr = state.tr.scrollIntoView();
    const lifted = [...starts].reverse().reduce((current, start) => liftOutOfLists({
      pm, state: current, tr, pos: tr.mapping.map(start),
    }), state);
    if (!tr.docChanged) {
      return false;
    }

    if (state.selection.empty) {
      tr.setSelection(pm.TextSelection.create(tr.doc, lifted.selection.from));
    }
    dispatch(tr);
    return true;
  };
}

function wrapBlock({ tr, listType, block: { node, pos } }) {
  const { nodes } = listType.schema;
  if (node.type === listType) {
    return;
  }
  if (LIST_NAMES.has(node.type.name)) {
    tr.setNodeMarkup(pos, listType);
    return;
  }

  if (node.type !== nodes.paragraph) {
    tr.setNodeMarkup(pos, nodes.paragraph);
  }
  tr.wrap(tr.doc.resolve(pos + 1).blockRange(), [{ type: listType }, { type: nodes.list_item }]);
}

// List items hold a single paragraph, so each block is wrapped on its own and the lists joined.
function wrapBlocksInList(listType) {
  return (state, dispatch) => {
    const { $from, $to } = state.selection;
    const range = $from.blockRange($to);
    if (!range?.parent.canReplaceWith(range.startIndex, range.endIndex, listType)) {
      return false;
    }

    const blocks = childrenAt(range.parent, range.$from.start(range.depth))
      .slice(range.startIndex, range.endIndex);
    if (!blocks.every(({ node }) => node.isTextblock || LIST_NAMES.has(node.type.name))) {
      return false;
    }
    if (!dispatch) {
      return true;
    }

    const tr = state.tr.scrollIntoView();
    [...blocks].reverse().forEach((block) => wrapBlock({ tr, listType, block }));
    const $start = tr.doc.resolve(range.start);
    childrenAt($start.parent, $start.start())
      .slice(range.startIndex + 1, range.endIndex)
      .reverse()
      .forEach(({ pos }) => tr.join(pos));
    dispatch(tr);
    return true;
  };
}

export function toggleList({ pm, name }) {
  return (state, dispatch) => {
    const listType = state.schema.nodes[name];
    const current = getListType(state);
    if (current?.name === name) {
      return unwrapListItems({ pm })(state, dispatch);
    }
    if (current) {
      dispatch?.(state.tr.setNodeMarkup(state.selection.$from.before(current.depth), listType));
      return true;
    }
    return pm.wrapInList(listType)(state, dispatch) || wrapBlocksInList(listType)(state, dispatch);
  };
}

function insertHardBreak(state, dispatch) {
  const br = state.schema.nodes.hard_break.create();
  dispatch?.(state.tr.replaceSelectionWith(br).scrollIntoView());
  return true;
}

export function buildKeymap({ pm, schema, onLink }) {
  const { marks, nodes } = schema;
  const historyKeys = pm.undo && pm.redo
    ? { 'Mod-z': pm.undo, 'Shift-Mod-z': pm.redo, 'Mod-y': pm.redo }
    : {};
  const blockKeys = BLOCK_TYPES.map(({ value, attrs }) => [
    `Shift-Ctrl-${attrs?.level ?? 0}`, setBlock({ pm, value }),
  ]);
  const openLink = () => {
    onLink?.();
    return true;
  };
  return {
    ...historyKeys,
    'Mod-b': pm.toggleMark(marks.strong),
    'Mod-i': pm.toggleMark(marks.em),
    'Mod-`': pm.toggleMark(marks.code),
    ...Object.fromEntries(blockKeys),
    'Ctrl->': toggleBlockquote({ pm }),
    'Mod-k': openLink,
    'Shift-Ctrl-8': toggleList({ pm, name: 'bullet_list' }),
    'Shift-Ctrl-9': toggleList({ pm, name: 'ordered_list' }),
    Enter: pm.splitListItem(nodes.list_item),
    'Shift-Enter': insertHardBreak,
    'Mod-Enter': insertHardBreak,
    Tab: pm.sinkListItem(nodes.list_item),
    'Shift-Tab': pm.liftListItem(nodes.list_item),
  };
}
