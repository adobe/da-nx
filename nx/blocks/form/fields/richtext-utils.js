// ProseMirror is injected as `pm` (the da-y-wrapper namespace); the serializer
// mirrors the SDK's canonical rich-text HTML, see ../docs/rich-text.md.

const SAFE_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);
const LIST_NAMES = new Set(['bullet_list', 'ordered_list']);
const MARK_TAGS = {
  strong: 'strong', em: 'em', u: 'u', s: 's', sup: 'sup', sub: 'sub', code: 'code',
};
const HEADING_LEVELS = [1, 2, 3, 4, 5, 6];

export function safeHref(href) {
  if (typeof href !== 'string') return null;
  const trimmed = href.trim();
  if (!trimmed) return null;
  // eslint-disable-next-line no-control-regex
  const compact = trimmed.replace(/[\u0000-\u0020]/g, '');
  const scheme = compact.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (scheme && !SAFE_SCHEMES.has(scheme)) return null;
  return trimmed;
}

const linkTitle = (title) => (typeof title === 'string' ? title.replace(/[ \t\n\r\f]+/g, ' ').trim() : '');

const escapeText = (value) => value.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const escapeAttr = (value) => value.replace(/[&"<>]/g, (c) => ({
  '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;',
}[c]));

const trimEdges = (html) => html.replace(/^(?:\s|<br>)+|(?:\s|<br>)+$/g, '');

const hasText = (html) => html.replace(/<[^>]*>/g, '').trim() !== '';

const isMarkup = (value) => /<[a-z/!]/i.test(value);

const styleMark = (test) => (value) => (test(value) ? null : false);

export const SCHEMA_SPEC = {
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM: () => ['p', 0],
    },
    heading: {
      attrs: { level: { default: 1 } },
      content: 'inline*',
      group: 'block',
      defining: true,
      parseDOM: HEADING_LEVELS.map((level) => ({ tag: `h${level}`, attrs: { level } })),
      toDOM: (node) => [`h${node.attrs.level}`, 0],
    },
    blockquote: {
      content: 'block+',
      group: 'block',
      defining: true,
      parseDOM: [{ tag: 'blockquote' }],
      toDOM: () => ['blockquote', 0],
    },
    bullet_list: {
      content: 'list_item+',
      group: 'block',
      parseDOM: [{ tag: 'ul' }],
      toDOM: () => ['ul', 0],
    },
    ordered_list: {
      content: 'list_item+',
      group: 'block',
      parseDOM: [{ tag: 'ol' }],
      toDOM: () => ['ol', 0],
    },
    list_item: {
      content: 'paragraph (bullet_list | ordered_list)*',
      defining: true,
      parseDOM: [{ tag: 'li' }],
      toDOM: () => ['li', 0],
    },
    text: { group: 'inline' },
    hard_break: {
      inline: true,
      group: 'inline',
      selectable: false,
      parseDOM: [{ tag: 'br' }],
      toDOM: () => ['br'],
    },
  },
  // Order sets the serialized nesting: link outermost, code innermost.
  marks: {
    link: {
      attrs: { href: {}, title: { default: null } },
      inclusive: false,
      parseDOM: [{
        tag: 'a[href]',
        getAttrs: (dom) => {
          const href = safeHref(dom.getAttribute('href'));
          return href ? { href, title: linkTitle(dom.getAttribute('title')) || null } : false;
        },
      }],
      toDOM: ({ attrs: { href, title } }) => ['a', title ? { href, title } : { href }, 0],
    },
    strong: {
      parseDOM: [
        { tag: 'strong' },
        { tag: 'b' },
        { style: 'font-weight', getAttrs: styleMark((v) => /^(bold(er)?|[6-9]00)$/.test(v)) },
      ],
      toDOM: () => ['strong', 0],
    },
    em: {
      parseDOM: [{ tag: 'em' }, { tag: 'i' }, { style: 'font-style=italic' }],
      toDOM: () => ['em', 0],
    },
    u: {
      parseDOM: [{ tag: 'u' }, { style: 'text-decoration=underline' }],
      toDOM: () => ['u', 0],
    },
    s: {
      parseDOM: [
        { tag: 's' },
        { tag: 'strike' },
        { tag: 'del' },
        { style: 'text-decoration=line-through' },
      ],
      toDOM: () => ['s', 0],
    },
    sup: {
      excludes: 'sup sub',
      parseDOM: [{ tag: 'sup' }, { style: 'vertical-align=super' }],
      toDOM: () => ['sup', 0],
    },
    sub: {
      excludes: 'sup sub',
      parseDOM: [{ tag: 'sub' }, { style: 'vertical-align=sub' }],
      toDOM: () => ['sub', 0],
    },
    code: {
      parseDOM: [{ tag: 'code' }],
      toDOM: () => ['code', 0],
    },
  },
};

function plainTextToHtml(text) {
  return text
    .split(/\r?\n\s*\r?\n/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p>${escapeText(para).replace(/\r?\n/g, '<br>')}</p>`)
    .join('');
}

export function parseRichText({ pm, schema, value }) {
  const text = typeof value === 'string' ? value : '';
  const markup = isMarkup(text) ? text : plainTextToHtml(text);
  // Parsed into an inert document: no scripts run and no resources load.
  const { body } = new globalThis.DOMParser().parseFromString(markup, 'text/html');
  return pm.DOMParser.fromSchema(schema).parse(body);
}

function openTag(mark) {
  if (mark.type.name !== 'link') return `<${MARK_TAGS[mark.type.name]}>`;
  const { href, title } = mark.attrs;
  return `<a href="${escapeAttr(href)}"${title ? ` title="${escapeAttr(title)}"` : ''}>`;
}

const closeTag = (mark) => (mark.type.name === 'link' ? '</a>' : `</${MARK_TAGS[mark.type.name]}>`);

function serializeInline(node) {
  const children = [];
  node.forEach((child) => children.push(child));
  const { parts, open } = children.reduce((acc, child) => {
    const { marks } = child;
    const keep = acc.open.findIndex((mark, i) => !marks[i]?.eq(mark));
    const shared = keep === -1 ? acc.open.length : keep;
    const content = child.isText ? escapeText(child.text.replace(/[ \t\n\r\f]+/g, ' ')) : '<br>';
    return {
      parts: [
        ...acc.parts,
        ...acc.open.slice(shared).reverse().map(closeTag),
        ...marks.slice(shared).map(openTag),
        content,
      ],
      open: marks,
    };
  }, { parts: [], open: [] });
  const html = [...parts, ...[...open].reverse().map(closeTag)].join('');
  return trimEdges(html);
}

function serializeList(node) {
  const tag = node.type.name === 'ordered_list' ? 'ol' : 'ul';
  const items = [];
  node.forEach((item) => {
    const blocks = [];
    item.forEach((child) => {
      const html = child.type.name === 'paragraph' ? serializeInline(child) : serializeList(child);
      if (html) blocks.push(html);
    });
    if (blocks.length) items.push(`<li>${blocks.join('')}</li>`);
  });
  return items.length ? `<${tag}>${items.join('')}</${tag}>` : '';
}

function serializeBlocks(parent) {
  const blocks = [];
  parent.forEach((node) => {
    const { name } = node.type;
    if (LIST_NAMES.has(name)) {
      blocks.push(serializeList(node));
      return;
    }
    if (name === 'blockquote') {
      const inner = serializeBlocks(node);
      if (inner) blocks.push(`<blockquote>${inner}</blockquote>`);
      return;
    }
    const tag = name === 'heading' ? `h${node.attrs.level}` : 'p';
    const inline = serializeInline(node);
    if (hasText(inline)) blocks.push(`<${tag}>${inline}</${tag}>`);
  });
  return blocks.join('');
}

export function serializeRichText(doc) {
  const html = serializeBlocks(doc);
  return hasText(html) ? html : '';
}

export function getActiveMarks(state) {
  const { doc, schema, selection, storedMarks } = state;
  const { from, to, empty, $from } = selection;
  const current = empty ? (storedMarks ?? $from.marks()) : null;
  return new Set(Object.values(schema.marks)
    .filter((type) => (empty ? !!type.isInSet(current) : doc.rangeHasMark(from, to, type)))
    .map((type) => type.name));
}

export function getListType(state) {
  const { $from } = state.selection;
  const depths = Array.from({ length: $from.depth + 1 }, (_, i) => $from.depth - i);
  const depth = depths.find((d) => LIST_NAMES.has($from.node(d).type.name));
  return depth === undefined ? null : { name: $from.node(depth).type.name, depth };
}

export const BLOCK_TYPES = [
  { value: 'paragraph', label: 'Paragraph' },
  ...HEADING_LEVELS.map((level) => ({ value: `heading-${level}`, label: `Heading ${level}` })),
];

export function getBlockType(state) {
  const { parent } = state.selection.$from;
  if (parent.type.name === 'heading') return `heading-${parent.attrs.level}`;
  return parent.type.name === 'paragraph' ? 'paragraph' : null;
}

export function setBlock({ pm, value }) {
  return (state, dispatch) => {
    const { nodes } = state.schema;
    const level = Number(value.match(/^heading-([1-6])$/)?.[1]);
    if (level) return pm.setBlockType(nodes.heading, { level })(state, dispatch);
    return value === 'paragraph' ? pm.setBlockType(nodes.paragraph)(state, dispatch) : false;
  };
}

export function isInBlockquote(state) {
  const { $from } = state.selection;
  return Array.from({ length: $from.depth }, (_, i) => $from.node(i + 1))
    .some((node) => node.type.name === 'blockquote');
}

export function toggleBlockquote({ pm }) {
  return (state, dispatch) => {
    const type = state.schema.nodes.blockquote;
    if (!isInBlockquote(state)) return pm.wrapIn(type)(state, dispatch);
    const { $from, $to } = state.selection;
    const range = $from.blockRange($to, (node) => node.type === type);
    if (!range) return false;
    dispatch?.(state.tr.lift(range, range.depth - 1).scrollIntoView());
    return true;
  };
}

export function getLinkAt(state) {
  const type = state.schema.marks.link;
  const { $from, from, empty } = state.selection;
  const marks = empty ? $from.marks() : (state.doc.nodeAt(from)?.marks ?? []);
  const mark = type.isInSet(marks);
  if (!mark) return null;

  const start = $from.start();
  const spans = [];
  $from.parent.forEach((child, offset) => {
    spans.push({ from: start + offset, to: start + offset + child.nodeSize, child });
  });
  const linked = (span) => !!mark.isInSet(span.child.marks);
  const index = spans.findIndex((span) => linked(span) && span.from <= from && from <= span.to);
  if (index === -1) return null;
  const before = spans.slice(0, index).reverse().findIndex((span) => !linked(span));
  const after = spans.slice(index + 1).findIndex((span) => !linked(span));
  const first = before === -1 ? 0 : index - before;
  const last = after === -1 ? spans.length - 1 : index + after;
  const { href, title } = mark.attrs;
  return {
    href, title: title ?? '', from: spans[first].from, to: spans[last].to,
  };
}

function linkRange(state) {
  const { from, to } = state.selection;
  const link = getLinkAt(state);
  if (!link) return { from, to };
  return { from: Math.min(from, link.from), to: Math.max(to, link.to) };
}

export function getLinkDraft(state) {
  const { from, to } = linkRange(state);
  const link = getLinkAt(state);
  return {
    href: link?.href ?? '', title: link?.title ?? '', text: state.doc.textBetween(from, to, ' '),
  };
}

export function applyLink({
  pm, href, text, title,
}) {
  return (state, dispatch) => {
    const safe = safeHref(href);
    if (!safe) return false;
    if (!dispatch) return true;
    const type = state.schema.marks.link;
    const { from, to } = linkRange(state);
    const display = text?.trim() || safe;
    const mark = type.create({ href: safe, title: linkTitle(title) || null });
    let tr = state.tr.removeMark(from, to, type);
    let end = to;
    if (from === to || display !== state.doc.textBetween(from, to, ' ')) {
      const marks = from === to
        ? (state.storedMarks ?? state.selection.$from.marks())
        : (state.doc.nodeAt(from)?.marks ?? []);
      tr = tr.replaceWith(from, to, state.schema.text(display, type.removeFromSet(marks)));
      end = from + display.length;
    }
    tr = tr.addMark(from, end, mark).setSelection(pm.TextSelection.create(tr.doc, end));
    dispatch(tr.scrollIntoView());
    return true;
  };
}

export function removeLink(state, dispatch) {
  const type = state.schema.marks.link;
  const { from, to, empty } = state.selection;
  const range = empty ? getLinkAt(state) : { from, to };
  if (!range || !state.doc.rangeHasMark(range.from, range.to, type)) return false;
  dispatch?.(state.tr.removeMark(range.from, range.to, type).scrollIntoView());
  return true;
}

function liftOutOfLists({ pm, state, tr, pos }) {
  const itemType = state.schema.nodes.list_item;
  const $pos = state.doc.resolve(pos);
  if ($pos.depth < 2 || $pos.node(-1).type !== itemType) return state;
  const selected = state.apply(state.tr.setSelection(pm.TextSelection.create(state.doc, pos)));
  let lifted;
  pm.liftListItem(itemType)(selected, (next) => { lifted = next; });
  if (!lifted) return state;
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
      if (node.type.name === 'paragraph' && parent?.type === itemType) starts.push(pos + 1);
    });
    if (!starts.length) return false;
    if (!dispatch) return true;
    const tr = state.tr.scrollIntoView();
    const lifted = starts.reverse().reduce((current, start) => liftOutOfLists({
      pm, state: current, tr, pos: tr.mapping.map(start),
    }), state);
    if (!tr.docChanged) return false;
    if (state.selection.empty) {
      tr.setSelection(pm.TextSelection.create(tr.doc, lifted.selection.from));
    }
    dispatch(tr);
    return true;
  };
}

function childPositions(parent, start) {
  return Array.from({ length: parent.childCount }).reduce((list, _, index) => (
    [...list, index ? list[index - 1] + parent.child(index - 1).nodeSize : start]
  ), []);
}

// List items hold a single paragraph, so each block is wrapped on its own and the lists joined.
function wrapBlocksInList(listType) {
  return (state, dispatch) => {
    const { nodes } = state.schema;
    const { $from, $to } = state.selection;
    const range = $from.blockRange($to);
    if (!range) return false;
    if (!range.parent.canReplaceWith(range.startIndex, range.endIndex, listType)) return false;
    const positions = childPositions(range.parent, range.$from.start(range.depth))
      .slice(range.startIndex, range.endIndex);
    const blocks = positions.map((pos) => ({ pos, node: state.doc.nodeAt(pos) }));
    const wrappable = ({ node }) => node.isTextblock || LIST_NAMES.has(node.type.name);
    if (!blocks.every(wrappable)) return false;
    if (!dispatch) return true;
    const tr = state.tr.scrollIntoView();
    [...blocks].reverse().forEach(({ pos, node }) => {
      if (LIST_NAMES.has(node.type.name)) {
        if (node.type !== listType) tr.setNodeMarkup(pos, listType);
        return;
      }
      if (node.type !== nodes.paragraph) tr.setNodeMarkup(pos, nodes.paragraph);
      const wrappers = [{ type: listType }, { type: nodes.list_item }];
      tr.wrap(tr.doc.resolve(pos + 1).blockRange(), wrappers);
    });
    const $start = tr.doc.resolve(range.start);
    childPositions($start.parent, $start.start())
      .slice(range.startIndex + 1, range.endIndex)
      .reverse()
      .forEach((pos) => tr.join(pos));
    dispatch(tr);
    return true;
  };
}

export function toggleList({ pm, name }) {
  return (state, dispatch) => {
    const { nodes } = state.schema;
    const current = getListType(state);
    if (current?.name === name) return unwrapListItems({ pm })(state, dispatch);
    if (current) {
      const pos = state.selection.$from.before(current.depth);
      dispatch?.(state.tr.setNodeMarkup(pos, nodes[name]));
      return true;
    }
    return pm.wrapInList(nodes[name])(state, dispatch)
      || wrapBlocksInList(nodes[name])(state, dispatch);
  };
}

export function indentList({ pm }) {
  return (state, dispatch) => pm.sinkListItem(state.schema.nodes.list_item)(state, dispatch);
}

export function outdentList({ pm }) {
  return (state, dispatch) => pm.liftListItem(state.schema.nodes.list_item)(state, dispatch);
}

export function insertHardBreak(state, dispatch) {
  const br = state.schema.nodes.hard_break.create();
  dispatch?.(state.tr.replaceSelectionWith(br).scrollIntoView());
  return true;
}

export function buildKeymap({ pm, schema, onLink }) {
  const { marks, nodes } = schema;
  const historyKeys = pm.undo && pm.redo
    ? { 'Mod-z': pm.undo, 'Shift-Mod-z': pm.redo, 'Mod-y': pm.redo }
    : {};
  return {
    ...historyKeys,
    'Mod-b': pm.toggleMark(marks.strong),
    'Mod-i': pm.toggleMark(marks.em),
    'Mod-u': pm.toggleMark(marks.u),
    'Shift-Mod-x': pm.toggleMark(marks.s),
    'Mod-e': pm.toggleMark(marks.code),
    'Mod-.': pm.toggleMark(marks.sup),
    'Mod-,': pm.toggleMark(marks.sub),
    'Mod-Alt-0': setBlock({ pm, value: 'paragraph' }),
    ...Object.fromEntries(HEADING_LEVELS.map((level) => [
      `Mod-Alt-${level}`, setBlock({ pm, value: `heading-${level}` }),
    ])),
    'Shift-Mod-9': toggleBlockquote({ pm }),
    'Mod-k': () => { onLink?.(); return true; },
    'Shift-Mod-k': removeLink,
    'Shift-Mod-8': toggleList({ pm, name: 'bullet_list' }),
    'Shift-Mod-7': toggleList({ pm, name: 'ordered_list' }),
    Enter: pm.splitListItem(nodes.list_item),
    'Shift-Enter': insertHardBreak,
    'Mod-Enter': insertHardBreak,
    Tab: indentList({ pm }),
    'Shift-Tab': outdentList({ pm }),
  };
}

// Rects are viewport based. The result is relative to `area`, the bubble's offset parent.
export function placeBubble({
  start, end, area, width, height, edge = 8, gap = 10,
}) {
  const lineEnd = Math.abs(end.top - start.top) < 1 ? end.left : area.right;
  const center = (start.left + lineEnd) / 2 - area.left;
  const left = Math.max(edge, Math.min(center - width / 2, area.width - width - edge));
  const above = start.top - height - gap;
  const top = (above < area.top ? end.bottom + gap : above) - area.top;
  const hidden = start.top < area.top || start.top > area.bottom;
  return { left, top, hidden };
}
