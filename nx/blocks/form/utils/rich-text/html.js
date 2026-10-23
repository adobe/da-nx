import { LIST_NAMES, safeHref } from './schema.js';

// The form the SDK keeps after a save and reload (src/html/rich-text.js), guarded by parity tests.
const WHITESPACE = /[ \t\n\r\f]+/g;
const ENTITIES = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
};

const escapeText = (value) => value.replace(/[&<>]/g, (c) => ENTITIES[c]);
const escapeAttr = (value) => value.replace(/[&"<>]/g, (c) => ENTITIES[c]);
const hasText = (html) => html.replace(/<[^>]*>/g, '').trim() !== '';
const trimEdges = (html) => html.replace(/^(?:\s|<br>)+|(?:\s|<br>)+$/g, '');
const isMarkup = (value) => /<[a-z/!]/i.test(value);

function childrenOf(node) {
  const children = [];
  node.forEach((child) => children.push(child));
  return children;
}

function plainTextToHtml(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${block.split('\n').map((line) => escapeText(line.trim())).join('<br>')}</p>`)
    .join('');
}

export function parseRichText({ pm, schema, value }) {
  const text = typeof value === 'string' ? value : '';
  const markup = isMarkup(text) ? text : plainTextToHtml(text);
  // DOMParser builds an inert document, so no scripts run and no resources load.
  const { body } = new globalThis.DOMParser().parseFromString(markup, 'text/html');
  return pm.DOMParser.fromSchema(schema).parse(body);
}

function wrapMark(mark, inner) {
  if (!hasText(inner)) {
    return inner;
  }

  const { name } = mark.type;
  if (name !== 'link') {
    return `<${name}>${inner}</${name}>`;
  }

  const href = safeHref(mark.attrs.href);
  if (!href) {
    return inner;
  }

  const title = mark.attrs.title?.replace(WHITESPACE, ' ').trim();
  const titleAttr = title ? ` title="${escapeAttr(title)}"` : '';
  return `<a href="${escapeAttr(href)}"${titleAttr}>${inner}</a>`;
}

// Drops trailing breaks and the trailing space of the last text.
function trimEnd(leaves) {
  const last = leaves.at(-1);
  if (last?.text === null) {
    return trimEnd(leaves.slice(0, -1));
  }
  if (!last?.text.endsWith(' ')) {
    return leaves;
  }

  const text = last.text.slice(0, -1);
  return text ? [...leaves.slice(0, -1), { ...last, text }] : trimEnd(leaves.slice(0, -1));
}

// HTML parsing drops a space at the block edges, after a break and after another space.
function normalizeLeaves(nodes) {
  const leaves = nodes.reduce((acc, { isText, text, marks }) => {
    const prev = acc.at(-1);
    if (!isText) {
      return prev ? [...acc, { marks, text: null }] : acc;
    }

    const dropsSpace = !prev || prev.text === null || prev.text.endsWith(' ');
    const collapsed = text.replace(WHITESPACE, ' ');
    const kept = dropsSpace ? collapsed.replace(/^ /, '') : collapsed;
    return kept ? [...acc, { marks, text: kept }] : acc;
  }, []);
  return trimEnd(leaves);
}

const serializeLeaf = (leaf) => (leaf.text === null ? '<br>' : escapeText(leaf.text));

// Neighbours sharing the mark at `depth` form one run, so the mark opens once around them.
function serializeInline(leaves, depth = 0) {
  const runs = leaves.reduce((acc, leaf) => {
    const mark = leaf.marks[depth];
    const last = acc.at(-1);
    if (mark && last?.mark?.eq(mark)) {
      return [...acc.slice(0, -1), { mark, leaves: [...last.leaves, leaf] }];
    }
    return [...acc, { mark, leaves: [leaf] }];
  }, []);
  return runs
    .map(({ mark, leaves: run }) => (mark ? wrapMark(mark, serializeInline(run, depth + 1)) : run.map(serializeLeaf).join('')))
    .join('');
}

function serializeText(node) {
  const inner = trimEdges(serializeInline(normalizeLeaves(childrenOf(node))));
  return hasText(inner) ? inner : '';
}

function serializeList(list) {
  const tag = list.type.name === 'ordered_list' ? 'ol' : 'ul';
  const items = childrenOf(list).map((item) => {
    const [paragraph, ...lists] = childrenOf(item);
    const inner = serializeText(paragraph) + lists.map(serializeList).join('');
    return inner ? `<li>${inner}</li>` : '';
  }).join('');
  return items ? `<${tag}>${items}</${tag}>` : '';
}

function serializeBlock(node) {
  const { name } = node.type;
  if (LIST_NAMES.has(name)) {
    return serializeList(node);
  }

  if (name === 'blockquote') {
    // eslint-disable-next-line no-use-before-define
    const inner = serializeBlocks(node);
    return inner ? `<blockquote>${inner}</blockquote>` : '';
  }

  const tag = name === 'heading' ? `h${node.attrs.level}` : 'p';
  const inner = serializeText(node);
  return inner ? `<${tag}>${inner}</${tag}>` : '';
}

const serializeBlocks = (parent) => childrenOf(parent).map(serializeBlock).join('');

export function serializeRichText({ doc }) {
  return serializeBlocks(doc);
}

// The smallest replacement that turns `doc` into what the SDK stores, or null when they match.
export function getCanonicalChange({ pm, doc }) {
  const value = serializeRichText({ doc });
  const canonical = parseRichText({ pm, schema: doc.type.schema, value });
  const from = doc.content.findDiffStart(canonical.content);
  if (from === null) {
    return null;
  }

  const { a: docEnd, b: canonicalEnd } = doc.content.findDiffEnd(canonical.content);
  const overlap = Math.max(0, from - Math.min(docEnd, canonicalEnd));
  return { from, to: docEnd + overlap, slice: canonical.slice(from, canonicalEnd + overlap) };
}
