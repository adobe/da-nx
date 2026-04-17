/* eslint-disable import/no-unresolved -- importmap */
import { Plugin } from 'da-y-wrapper';
import '../../shared/popover/popover.js';

function ensurePopover() {
  let popover = document.querySelector('nx-popover.nx-selection-toolbar');
  if (popover) return popover;

  popover = document.createElement('nx-popover');
  popover.classList.add('nx-selection-toolbar');
  popover.setAttribute('placement', 'above');
  popover.innerHTML = '<p style="margin:0;padding:4px 8px;white-space:nowrap">Hello World</p>';
  document.body.append(popover);
  return popover;
}

export function showSelectionToolbar({ x, y }) {
  ensurePopover().show({ x, y, placement: 'above' });
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
  showSelectionToolbar({ x, y });
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
