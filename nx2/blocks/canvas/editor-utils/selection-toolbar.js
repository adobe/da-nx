/* eslint-disable import/no-unresolved -- importmap */
import {
  Plugin,
  liftListItem,
  setBlockType,
  wrapIn,
  wrapInList,
} from 'da-y-wrapper';
import '../../shared/popover/popover.js';
import '../../shared/picker/picker.js';
import { loadHrefSvg } from '../../../utils/svg.js';

const ICONS_BASE = new URL('../../img/icons/', import.meta.url).href;

const BLOCK_TYPE_PICKER_VALUES = new Set(['paragraph', 'heading-1', 'heading-2', 'heading-3']);

const BLOCK_TYPE_PICKER_ITEMS = [
  { section: 'Change into' },
  { value: 'paragraph', label: 'Paragraph' },
  { value: 'heading-1', label: 'Heading 1' },
  { value: 'heading-2', label: 'Heading 2' },
  { value: 'heading-3', label: 'Heading 3' },
];

/** @type {import('prosemirror-view').EditorView | null} */
let activeToolbarView = null;

const STRUCTURE_ACTIONS = [
  { id: 'blockquote', label: 'Blockquote', icon: 'BlockQuote' },
  { id: 'code-block', label: 'Code block', icon: 'BlockCode' },
  { id: 'bullet-list', label: 'Bullet list', icon: 'ListBulleted' },
  { id: 'numbered-list', label: 'Numbered list', icon: 'ListNumbered' },
];

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

function getBlockTypePickerValue(state) {
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

function blockTypeLabelForRaw(raw) {
  if (raw === 'mixed') return 'Mixed';
  if (raw === 'paragraph') return 'Paragraph';
  const hm = /^heading-(\d)$/.exec(raw);
  if (hm) return `Heading ${hm[1]}`;
  if (raw === 'code_block') return 'Code block';
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** @param {Element | null | undefined} picker */
function syncBlockTypePicker(picker, state) {
  if (!picker) return;
  const raw = getBlockTypePickerValue(state);
  if (BLOCK_TYPE_PICKER_VALUES.has(raw)) {
    picker.value = raw;
    picker.labelOverride = '';
  } else {
    picker.value = '';
    picker.labelOverride = blockTypeLabelForRaw(raw);
  }
}

/**
 * @param {import('prosemirror-view').EditorView} view
 * @param {string} value
 */
function applyBlockTypePick(view, value) {
  const { state, dispatch } = view;
  const { schema } = state;
  const d = dispatch.bind(view);
  if (value === 'paragraph') {
    return setBlockType(schema.nodes.paragraph)(state, d);
  }
  const m = /^heading-(\d)$/.exec(value);
  if (m) {
    const level = Number(m[1]);
    return setBlockType(schema.nodes.heading, { level })(state, d);
  }
  return false;
}

/**
 * @param {import('prosemirror-view').EditorView} view
 * @param {string} handler
 */
function runToolbarStructureAction(view, handler) {
  const { state, dispatch } = view;
  const { schema } = state;
  const d = dispatch.bind(view);

  if (handler === 'code-block') {
    if (allTextblocksAreCodeBlock(state)) {
      return setBlockType(schema.nodes.paragraph)(state, d);
    }
    return setBlockType(schema.nodes.code_block)(state, d);
  }

  if (handler === 'blockquote') {
    if (selectionFullyInBlockquote(state)) {
      return unwrapInnerBlockquote(state, d);
    }
    return wrapIn(schema.nodes.blockquote)(state, d);
  }

  if (handler === 'bullet-list') {
    if (selectionFullyInListType(state, 'bullet_list')) {
      liftUntilNotInList(view, schema.nodes.list_item, 'bullet_list');
      return true;
    }
    return wrapInList(schema.nodes.bullet_list)(state, d);
  }

  if (handler === 'numbered-list') {
    if (selectionFullyInListType(state, 'ordered_list')) {
      liftUntilNotInList(view, schema.nodes.list_item, 'ordered_list');
      return true;
    }
    return wrapInList(schema.nodes.ordered_list)(state, d);
  }

  return false;
}

function structureHandlerActive(state, handler) {
  if (handler === 'code-block') return allTextblocksAreCodeBlock(state);
  if (handler === 'blockquote') return selectionFullyInBlockquote(state);
  if (handler === 'bullet-list') return selectionFullyInListType(state, 'bullet_list');
  if (handler === 'numbered-list') return selectionFullyInListType(state, 'ordered_list');
  return false;
}

function toggleMarkOnSelection(view, markName) {
  const { state } = view;
  const { schema, selection, tr, storedMarks } = state;
  const mark = schema.marks[markName];
  if (!mark) return;

  const { dispatch } = view;
  if (selection.empty) {
    const activeMarks = storedMarks || selection.$from.marks();
    const hasMark = activeMarks.some((m) => m.type === mark);
    if (hasMark) dispatch(tr.removeStoredMark(mark));
    else dispatch(tr.addStoredMark(mark.create()));
  } else {
    const hasMark = state.doc.rangeHasMark(selection.from, selection.to, mark);
    if (hasMark) dispatch(tr.removeMark(selection.from, selection.to, mark));
    else dispatch(tr.addMark(selection.from, selection.to, mark.create()));
  }
}

function syncPressedStates() {
  const popover = document.querySelector('nx-popover.nx-selection-toolbar');
  const wrap = popover?.querySelector('.nx-selection-toolbar-actions');
  if (!wrap) return;
  if (!activeToolbarView) {
    wrap.querySelectorAll('[data-mark], [data-handler]').forEach((el) => {
      el.setAttribute('aria-pressed', 'false');
    });
    const picker = wrap.querySelector('.nx-selection-toolbar-block-type');
    if (picker) {
      picker.value = 'paragraph';
      picker.labelOverride = '';
    }
    return;
  }

  const { state } = activeToolbarView;
  const { schema, selection, storedMarks } = state;

  wrap.querySelectorAll('[data-mark]').forEach((el) => {
    const name = el.getAttribute('data-mark');
    const mark = name && schema.marks[name];
    if (!mark) return;
    let active = false;
    if (selection.empty) {
      const marks = storedMarks || selection.$from.marks();
      active = marks.some((m) => m.type === mark);
    } else {
      active = state.doc.rangeHasMark(selection.from, selection.to, mark);
    }
    el.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  wrap.querySelectorAll('[data-handler]').forEach((el) => {
    const { handler } = el.dataset;
    if (!handler) return;
    el.setAttribute(
      'aria-pressed',
      structureHandlerActive(state, handler) ? 'true' : 'false',
    );
  });

  syncBlockTypePicker(wrap.querySelector('.nx-selection-toolbar-block-type'), state);
}

function setToolbarInteractivity(wrap, enabled) {
  wrap.toggleAttribute('data-disabled', !enabled);
  wrap.style.pointerEvents = enabled ? '' : 'none';
  wrap.style.opacity = enabled ? '' : '0.45';
}

function wireToolbar(popover) {
  const wrap = document.createElement('div');
  wrap.className = 'nx-selection-toolbar-actions';
  wrap.style.cssText = [
    'display:flex',
    'flex-wrap:wrap',
    'align-items:center',
    'gap:4px',
    'max-width:min(92vw,380px)',
  ].join(';');

  const mkBtn = (label, extra = {}) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', label);
    btn.title = label;
    btn.style.cssText = [
      'box-sizing:border-box',
      'min-width:32px',
      'height:32px',
      'padding:0 6px',
      'display:inline-flex',
      'align-items:center',
      'justify-content:center',
      'border:1px solid var(--s2-gray-300)',
      'border-radius:var(--s2-corner-radius-100)',
      'background:var(--s2-gray-75)',
      'color:var(--s2-gray-800)',
      'font:inherit',
      'cursor:pointer',
    ].join(';');
    Object.entries(extra).forEach(([k, v]) => {
      if (v !== undefined) btn.setAttribute(k, v);
    });
    return btn;
  };

  const bold = mkBtn('Bold');
  bold.textContent = 'B';
  bold.style.fontWeight = '700';
  bold.dataset.mark = 'strong';

  const italic = mkBtn('Italic');
  italic.textContent = 'I';
  italic.style.fontStyle = 'italic';
  italic.dataset.mark = 'em';

  const sep = document.createElement('span');
  sep.setAttribute('aria-hidden', 'true');
  sep.style.cssText = 'width:1px;height:20px;background:var(--s2-gray-300);margin:0 2px';

  const blockTypePicker = document.createElement('nx-picker');
  blockTypePicker.className = 'nx-selection-toolbar-block-type';
  blockTypePicker.setAttribute('placement', 'below');
  blockTypePicker.items = BLOCK_TYPE_PICKER_ITEMS;
  blockTypePicker.value = 'paragraph';
  blockTypePicker.addEventListener('change', (e) => {
    const view = activeToolbarView;
    if (!view || wrap.hasAttribute('data-disabled')) return;
    const { value } = e.detail;
    if (typeof value === 'string') {
      applyBlockTypePick(view, value);
      syncPressedStates();
      view.focus();
    }
  });

  const blockPickWrap = document.createElement('span');
  blockPickWrap.className = 'nx-selection-toolbar-block-type-wrap';
  blockPickWrap.style.cssText = 'display:inline-flex;min-width:9.5rem;align-items:center';
  blockPickWrap.append(blockTypePicker);

  wrap.append(bold, italic, sep, blockPickWrap);

  STRUCTURE_ACTIONS.forEach(({ id, label, icon }) => {
    const btn = mkBtn(label, { 'data-handler': id });
    const href = `${ICONS_BASE}S2_Icon_${icon}_20_N.svg`;
    loadHrefSvg(href).then((svg) => {
      if (!svg || !btn.isConnected) return;
      const node = svg.cloneNode(true);
      node.style.width = '18px';
      node.style.height = '18px';
      node.style.display = 'block';
      btn.append(node);
    });
    wrap.append(btn);
  });

  wrap.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  wrap.addEventListener('click', (e) => {
    const view = activeToolbarView;
    if (!view) return;
    const t = e.target instanceof Element ? e.target.closest('button') : null;
    if (!t || t.disabled) return;

    const { mark, handler } = t.dataset;
    if (mark) {
      toggleMarkOnSelection(view, mark);
    } else if (handler) {
      runToolbarStructureAction(view, handler);
    }
    syncPressedStates();
    view.focus();
  });

  popover.replaceChildren(wrap);
}

function ensurePopover() {
  let popover = document.querySelector('nx-popover.nx-selection-toolbar');
  if (popover) return popover;

  popover = document.createElement('nx-popover');
  popover.classList.add('nx-selection-toolbar');
  popover.setAttribute('placement', 'above');
  document.body.append(popover);
  wireToolbar(popover);
  return popover;
}

/**
 * @param {{ x: number, y: number, view?: import('prosemirror-view').EditorView | null }} opts
 */
export function showSelectionToolbar({ x, y, view = null }) {
  activeToolbarView = view ?? null;
  const popover = ensurePopover();
  const wrap = popover.querySelector('.nx-selection-toolbar-actions');
  if (wrap) setToolbarInteractivity(wrap, Boolean(activeToolbarView));
  popover.show({ x, y, placement: 'above' });
  syncPressedStates();
}

export function hideSelectionToolbar() {
  const popover = document.querySelector('nx-popover.nx-selection-toolbar');
  popover?.close();
}

function hasTextSelection(state) {
  const { empty } = state.selection;
  return !empty;
}

function syncToolbar(view) {
  if (!hasTextSelection(view.state)) {
    hideSelectionToolbar();
    return;
  }

  const { from } = view.state.selection;
  const start = view.coordsAtPos(from);

  const x = start.left;
  const y = start.top - 64;
  showSelectionToolbar({ x, y, view });
}

export function createSelectionToolbarPlugin() {
  return new Plugin({
    view() {
      return {
        update(view) {
          syncToolbar(view);
        },
        destroy() {
          hideSelectionToolbar();
        },
      };
    },
  });
}
