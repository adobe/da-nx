/* eslint-disable import/no-unresolved -- importmap */
import { Plugin } from 'da-y-wrapper';

export const TOOLBAR_PADDING_GAP = 64;

let toolbar;
let componentLoaded;

export function getSelectionToolbar() {
  if (toolbar) return toolbar;
  componentLoaded ??= import('./nx-selection-toolbar.js');
  toolbar = document.createElement('nx-selection-toolbar');
  document.body.append(toolbar);
  return toolbar;
}

export function hideSelectionToolbar() {
  toolbar?.hide();
}

function syncToolbar(view) {
  if (!view) return;
  const tb = getSelectionToolbar();
  if (tb.linkDialogOpen) return;
  if (view.state.selection.empty) {
    hideSelectionToolbar();
    return;
  }
  const start = view.coordsAtPos(view.state.selection.from);
  tb.view = view;
  tb.show({ x: start.left, y: start.top - TOOLBAR_PADDING_GAP });
}

export function createSelectionToolbarPlugin() {
  return new Plugin({
    view() {
      let scrollEl;
      const tb = getSelectionToolbar();
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
