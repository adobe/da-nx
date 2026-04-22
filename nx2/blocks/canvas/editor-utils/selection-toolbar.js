/* eslint-disable import/no-unresolved -- importmap */
import { Plugin, NodeSelection } from 'da-y-wrapper';
import { EDITOR_TEXT_FORMAT_ITEMS } from './commands.js';

export { EDITOR_TEXT_FORMAT_ITEMS };

const NON_TEXT_NODES = new Set(['table', 'image']);

let toolbar;
let componentLoaded;

function ensureToolbar() {
  if (toolbar) return toolbar;
  componentLoaded ??= import('./nx-selection-toolbar.js');
  toolbar = document.createElement('nx-selection-toolbar');
  document.body.append(toolbar);
  return toolbar;
}

export function getSelectionToolbar() {
  return ensureToolbar();
}

export function hideSelectionToolbar() {
  toolbar?.hide?.();
}

function isNonTextSelection({ selection }) {
  return selection instanceof NodeSelection
    && NON_TEXT_NODES.has(selection.node.type.name);
}

function syncToolbar(view) {
  const tb = ensureToolbar();
  if (tb.linkDialogOpen) return;
  if (view.state.selection.empty || isNonTextSelection(view.state)) {
    hideSelectionToolbar();
    return;
  }
  const start = view.coordsAtPos(view.state.selection.from);
  tb.view = view;
  tb.show({ x: start.left, y: start.top - 64 });
}

export function createSelectionToolbarPlugin() {
  return new Plugin({
    view() {
      let scrollEl;
      const tb = ensureToolbar();
      const onScroll = () => syncToolbar(tb.view);

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
