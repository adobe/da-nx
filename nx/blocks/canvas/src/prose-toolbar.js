/**
 * Minimal horizontal formatting toolbar for the document view.
 * Covers the "Edit Text" surface from da-live: block type selector
 * (Paragraph / H1–H6 / Code block) plus inline mark toggles
 * (Bold, Italic, Underline, Strikethrough, Superscript, Subscript, Code).
 */
/* eslint-disable import/no-unresolved */
import { Plugin, toggleMark, setBlockType } from 'da-y-wrapper';
/* eslint-enable import/no-unresolved */

function isMarkActive(state, markType) {
  const { from, to, $from, $to, empty } = state.selection;
  if (empty) return !!markType.isInSet(state.storedMarks || $from.marksAcross($to) || []);
  return state.doc.rangeHasMark(from, to, markType);
}

const MARKS = [
  { key: 'strong', title: 'Bold', css: 'da-tb-bold' },
  { key: 'em', title: 'Italic', css: 'da-tb-italic' },
  { key: 'u', title: 'Underline', css: 'da-tb-underline' },
  { key: 's', title: 'Strikethrough', css: 'da-tb-strike' },
  { key: 'sup', title: 'Superscript', css: 'da-tb-sup' },
  { key: 'sub', title: 'Subscript', css: 'da-tb-sub' },
  { key: 'code', title: 'Inline code', css: 'da-tb-code' },
];

const BLOCK_OPTIONS = [
  { label: 'Paragraph', node: 'paragraph', attrs: {} },
  { label: 'Heading 1', node: 'heading', attrs: { level: 1 } },
  { label: 'Heading 2', node: 'heading', attrs: { level: 2 } },
  { label: 'Heading 3', node: 'heading', attrs: { level: 3 } },
  { label: 'Heading 4', node: 'heading', attrs: { level: 4 } },
  { label: 'Heading 5', node: 'heading', attrs: { level: 5 } },
  { label: 'Heading 6', node: 'heading', attrs: { level: 6 } },
  { label: 'Code block', node: 'code_block', attrs: {} },
];

function blockOptionKey({ node, attrs }) {
  return node === 'heading' ? `heading-${attrs.level}` : node;
}

function getActiveBlock(state) {
  const { $from } = state.selection;
  let { depth } = $from;
  while (depth >= 0) {
    const node = $from.node(depth);
    if (node.type.name === 'heading') return `heading-${node.attrs.level}`;
    if (node.type.name === 'code_block') return 'code_block';
    if (node.type.name === 'paragraph') return 'paragraph';
    depth -= 1;
  }
  return 'paragraph';
}

function buildToolbar(view) {
  const bar = document.createElement('div');
  bar.className = 'da-prose-toolbar';

  // Block type <select>
  const select = document.createElement('select');
  select.className = 'da-tb-block-select';
  select.title = 'Block type';
  for (const opt of BLOCK_OPTIONS) {
    const option = document.createElement('option');
    option.value = blockOptionKey(opt);
    option.textContent = opt.label;
    select.appendChild(option);
  }
  // mousedown stop-prop prevents editor blur before change fires
  select.addEventListener('mousedown', (e) => e.stopPropagation());
  select.addEventListener('change', () => {
    const found = BLOCK_OPTIONS.find((o) => blockOptionKey(o) === select.value);
    if (!found) return;
    const nodeType = view.state.schema.nodes[found.node];
    if (!nodeType) return;
    setBlockType(nodeType, found.attrs)(view.state, view.dispatch);
    view.focus();
  });
  bar.appendChild(select);

  // Separator
  const sep = document.createElement('span');
  sep.className = 'da-tb-sep';
  bar.appendChild(sep);

  // Mark toggle buttons
  const markBtns = MARKS.map(({ key, title, css }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `da-tb-btn ${css}`;
    btn.title = title;
    btn.setAttribute('aria-label', title);
    // mousedown + preventDefault keeps editor focus; the toggleMark runs before blur
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const markType = view.state.schema.marks[key];
      if (!markType) return;
      toggleMark(markType)(view.state, view.dispatch);
    });
    bar.appendChild(btn);
    return { btn, key };
  });

  function update(state) {
    select.value = getActiveBlock(state);
    for (const { btn, key } of markBtns) {
      const markType = state.schema.marks[key];
      if (markType) {
        btn.classList.toggle('da-tb-active', isMarkActive(state, markType));
      }
    }
  }

  return { bar, update };
}

export default function proseToolbar(onToolbar) {
  return new Plugin({
    view(editorView) {
      const { bar, update } = buildToolbar(editorView);
      onToolbar?.(bar);
      update(editorView.state);
      return {
        update(view) { update(view.state); },
        destroy() { bar.remove(); onToolbar?.(null); },
      };
    },
  });
}
