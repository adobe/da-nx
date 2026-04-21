/* eslint-disable import/no-unresolved -- importmap */
import { Plugin } from 'da-y-wrapper';
import '../../shared/popover/popover.js';
import '../../shared/picker/picker.js';
import { loadHrefSvg } from '../../../utils/svg.js';
import {
  EDITOR_TEXT_FORMAT_ITEMS,
  applyHeadingLevel,
  applyCodeBlock,
  applyParagraph,
  getBlockTypePickerValue,
  isStructureActive,
  toggleStructure,
  markIsActiveInSelection,
  toggleMarkOnSelection,
} from './commands.js';

export { EDITOR_TEXT_FORMAT_ITEMS };

const ICONS_BASE = new URL('../../img/icons/', import.meta.url).href;

const STRUCTURE_IDS = new Set(['blockquote', 'bullet-list', 'numbered-list']);

const STRUCTURE_ITEMS = EDITOR_TEXT_FORMAT_ITEMS.filter(
  (item) => STRUCTURE_IDS.has(item.id),
);

const BLOCK_TYPE_LABELS = new Map([
  ['paragraph', 'Paragraph'],
  ['heading-1', 'Heading 1'],
  ['heading-2', 'Heading 2'],
  ['heading-3', 'Heading 3'],
  ['code_block', 'Code block'],
]);

const BLOCK_TYPE_PICKER_ITEMS = [
  { section: 'Change into' },
  ...Array.from(BLOCK_TYPE_LABELS, ([value, label]) => ({ value, label })),
];

const BLOCK_TYPE_COMMANDS = {
  paragraph: applyParagraph,
  'heading-1': (s, d) => applyHeadingLevel(s, d, 1),
  'heading-2': (s, d) => applyHeadingLevel(s, d, 2),
  'heading-3': (s, d) => applyHeadingLevel(s, d, 3),
  code_block: applyCodeBlock,
};

const MARK_ACTIONS = [
  { mark: 'strong', label: 'Bold', text: 'B' },
  { mark: 'em', label: 'Italic', text: 'I' },
  { mark: 'code', label: 'Inline code', text: '</>' },
];

let activeToolbarView = null;

/* ---- Block-type picker sync ---- */

function blockTypeLabelForRaw(raw) {
  if (raw === 'mixed') return 'Mixed';
  return BLOCK_TYPE_LABELS.get(raw)
    ?? raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function syncBlockTypePicker(picker, state) {
  const raw = getBlockTypePickerValue(state);
  if (BLOCK_TYPE_LABELS.has(raw)) {
    picker.value = raw;
    picker.labelOverride = '';
  } else {
    picker.value = '';
    picker.labelOverride = blockTypeLabelForRaw(raw);
  }
}

/* ---- Pressed-state sync ---- */

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
  const { schema } = state;

  wrap.querySelectorAll('[data-mark]').forEach((el) => {
    const mark = schema.marks[el.dataset.mark];
    el.setAttribute('aria-pressed', markIsActiveInSelection(state, mark) ? 'true' : 'false');
  });

  wrap.querySelectorAll('[data-handler]').forEach((el) => {
    const active = isStructureActive(el.dataset.handler, state);
    el.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  syncBlockTypePicker(wrap.querySelector('.nx-selection-toolbar-block-type'), state);
}

/* ---- Event handlers ---- */

function onBlockTypePickerChange(wrap, e) {
  const view = activeToolbarView;
  if (!view || wrap.hasAttribute('data-disabled')) return;
  const { value } = e.detail;
  const cmd = BLOCK_TYPE_COMMANDS[value];
  if (cmd) {
    cmd(view.state, view.dispatch.bind(view));
    syncPressedStates();
    view.focus();
  }
}

function onToolbarClick(wrap, e) {
  e.preventDefault();
  const view = activeToolbarView;
  if (!view) return;
  const btn = e.target instanceof Element ? e.target.closest('button') : null;
  if (!btn || btn.disabled) return;

  const { mark, handler } = btn.dataset;
  if (mark) toggleMarkOnSelection(view, mark);
  else if (handler) toggleStructure(handler, view);

  syncPressedStates();
  view.focus();
}

/* ---- DOM setup ---- */

function createToolbarButton(label, attrs = {}) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'nx-selection-toolbar-btn';
  btn.setAttribute('aria-label', label);
  btn.title = label;
  Object.entries(attrs).forEach(([k, v]) => btn.setAttribute(k, v));
  return btn;
}

function addSeparator(wrap) {
  const sep = document.createElement('span');
  sep.className = 'nx-selection-toolbar-sep';
  sep.setAttribute('aria-hidden', 'true');
  wrap.append(sep);
}

function buildToolbarActionsWrap() {
  const wrap = document.createElement('div');
  wrap.className = 'nx-selection-toolbar-actions';

  const picker = document.createElement('nx-picker');
  picker.className = 'nx-selection-toolbar-block-type';
  picker.setAttribute('placement', 'below');
  picker.setAttribute('ignoreFocus', 'true');
  picker.items = BLOCK_TYPE_PICKER_ITEMS;
  picker.value = 'paragraph';

  const pickerWrap = document.createElement('span');
  pickerWrap.className = 'nx-selection-toolbar-block-type-wrap';
  pickerWrap.append(picker);
  wrap.append(pickerWrap);

  addSeparator(wrap);

  MARK_ACTIONS.forEach(({ mark, label, text }) => {
    const btn = createToolbarButton(label);
    btn.textContent = text;
    btn.dataset.mark = mark;
    wrap.append(btn);
  });

  addSeparator(wrap);

  STRUCTURE_ITEMS.forEach(({ id, label, icon }) => {
    const btn = createToolbarButton(label, { 'data-handler': id });
    loadHrefSvg(`${ICONS_BASE}S2_Icon_${icon}_20_N.svg`).then((svg) => {
      if (svg && btn.isConnected) btn.append(svg.cloneNode(true));
    });
    wrap.append(btn);
  });

  picker.addEventListener('change', (e) => onBlockTypePickerChange(wrap, e));
  wrap.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  wrap.addEventListener('click', (e) => onToolbarClick(wrap, e));

  return wrap;
}

function ensurePopover() {
  let popover = document.querySelector('nx-popover.nx-selection-toolbar');
  if (popover) return popover;

  popover = document.createElement('nx-popover');
  popover.classList.add('nx-selection-toolbar');
  popover.setAttribute('placement', 'above');
  document.body.append(popover);
  popover.replaceChildren(buildToolbarActionsWrap());
  return popover;
}

/* ---- Public API & ProseMirror plugin ---- */

export function showSelectionToolbar({ x, y, view = null }) {
  activeToolbarView = view ?? null;
  const popover = ensurePopover();
  const wrap = popover.querySelector('.nx-selection-toolbar-actions');
  wrap.toggleAttribute('data-disabled', !activeToolbarView);
  popover.show({ x, y, placement: 'above' });
  syncPressedStates();
}

export function hideSelectionToolbar() {
  document.querySelector('nx-popover.nx-selection-toolbar')?.close();
}

function syncToolbar(view) {
  if (view.state.selection.empty) {
    hideSelectionToolbar();
    return;
  }
  const start = view.coordsAtPos(view.state.selection.from);
  showSelectionToolbar({ x: start.left, y: start.top - 64, view });
}

export function createSelectionToolbarPlugin() {
  return new Plugin({
    view() {
      let scrollEl;
      const onScroll = () => syncToolbar(activeToolbarView);

      return {
        update(view) {
          if (!scrollEl) {
            scrollEl = view.dom.closest('.nx-editor-doc');
            scrollEl?.addEventListener('scroll', onScroll, { passive: true });
          }
          const header = document.querySelector('nx-canvas-header');
          if (header?.editorView !== 'content') return;
          syncToolbar(view);
        },
        destroy() {
          scrollEl?.removeEventListener('scroll', onScroll);
          hideSelectionToolbar();
        },
      };
    },
  });
}
