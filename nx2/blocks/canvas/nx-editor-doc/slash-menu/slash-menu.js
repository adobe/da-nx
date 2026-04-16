/* eslint-disable import/no-unresolved -- importmap */
import { Plugin } from 'da-y-wrapper';
import '../../../shared/menu/menu.js';
import { slashMenuItemsForQuery } from './slash-menu-items.js';
import { SLASH_MENU_HANDLERS } from './slash-menu-handlers.js';

function inTopLevelParagraph($from) {
  if ($from.parent.type.name !== 'paragraph') return false;
  if ($from.depth < 1) return false;
  return $from.node($from.depth - 1).type.name === 'doc';
}

function getSlashContext(state) {
  const { $from } = state.selection;
  if (!inTopLevelParagraph($from)) return null;

  const paraStart = $from.start();
  const head = state.selection.from;
  if (head <= paraStart) return null;

  const prefix = state.doc.textBetween(paraStart, head, '\ufffc', '\ufffc');
  if (!prefix.startsWith('/')) return null;

  const query = prefix.slice(1);
  if (/\s/.test(query)) return null;

  // Anchor at paragraph start (the `/`) so the menu does not jump with the cursor while filtering
  return { query, anchorPos: paraStart };
}

function shouldShowSlashHint(state) {
  const { $from } = state.selection;
  if (!inTopLevelParagraph($from)) return false;
  if ($from.parentOffset !== 0) return false;
  if ($from.parent.content.size > 0) return false;
  if (getSlashContext(state)) return false;
  return true;
}

function setup(container, view) {
  const anchor = document.createElement('span');
  anchor.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none';
  container.append(anchor);

  const menu = document.createElement('nx-menu');
  menu.items = slashMenuItemsForQuery('');
  container.append(menu);

  menu.addEventListener('select', (e) => {
    const run = SLASH_MENU_HANDLERS[e.detail.id];
    const { state } = view;
    const slash = getSlashContext(state);
    if (slash && run) {
      const { anchorPos } = slash;
      const head = state.selection.from;
      const tr = state.tr.delete(anchorPos, head);
      view.dispatch(tr);
      run(view.state, view.dispatch.bind(view));
    }
    view.focus();
  });

  const scrollEl = container.closest('.nx-editor-doc');
  const onScroll = () => { if (menu.open) menu.reposition(); };
  scrollEl?.addEventListener('scroll', onScroll, { passive: true });

  return { menu, anchor, scrollEl, onScroll };
}

function positionAnchor(view, anchor, pos) {
  const coords = view.coordsAtPos(pos);
  const rect = anchor.offsetParent.getBoundingClientRect();
  anchor.style.left = `${coords.left - rect.left}px`;
  anchor.style.top = `${coords.bottom - rect.top}px`;
}

function syncSlashHint(view, ctxRef) {
  const container = view.dom.parentElement;
  if (!container) return;

  if (!shouldShowSlashHint(view.state)) {
    if (ctxRef.hintEl) ctxRef.hintEl.style.display = 'none';
    return;
  }

  if (!ctxRef.hintEl) {
    const hint = document.createElement('span');
    hint.textContent = 'Tap \'/\' to insert';
    hint.setAttribute('aria-hidden', 'true');
    hint.className = 'da-slash-hint';
    container.append(hint);
    ctxRef.hintEl = hint;
  }

  const { hintEl } = ctxRef;
  const pos = view.state.selection.$from.start();
  const coords = view.coordsAtPos(pos);
  const containerRect = container.getBoundingClientRect();
  hintEl.style.left = `${coords.left - containerRect.left + 3}px`;
  hintEl.style.top = `${coords.top - containerRect.top}px`;
  hintEl.style.display = '';
}

function syncSlashUi(view, ctxRef) {
  syncSlashHint(view, ctxRef);

  const container = view.dom.parentElement;
  if (!container) return;

  const slash = getSlashContext(view.state);

  if (!slash) {
    ctxRef.ctx?.menu.close();
    return;
  }

  const items = slashMenuItemsForQuery(slash.query);
  if (!items.length) {
    ctxRef.ctx?.menu.close();
    return;
  }

  if (!ctxRef.ctx) ctxRef.ctx = setup(container, view);
  const { menu, anchor } = ctxRef.ctx;
  positionAnchor(view, anchor, slash.anchorPos);
  menu.items = items;
  if (!menu.open) {
    menu.show({ anchor, placement: 'auto' });
  }
}

function destroySlashUi(ctxRef) {
  ctxRef.hintEl?.remove();
  const { ctx } = ctxRef;
  if (!ctx) return;
  ctx.menu.close();
  ctx.scrollEl?.removeEventListener('scroll', ctx.onScroll);
  ctx.anchor.remove();
  ctx.menu.remove();
  // eslint-disable-next-line no-param-reassign
  ctxRef = {};
}

export function createSlashMenuPlugin() {
  const ctxRef = {};

  return new Plugin({
    view(editorView) {
      const onKeyDown = () => {
        syncSlashUi(editorView, ctxRef);
      };
      editorView.dom.addEventListener('keydown', onKeyDown);

      return {
        update(editorView_) {
          // Paste, collab, pointer, and any transaction not preceded by this DOM keydown path
          syncSlashUi(editorView_, ctxRef);
        },
        destroy() {
          editorView.dom.removeEventListener('keydown', onKeyDown);
          destroySlashUi(ctxRef);
        },
      };
    },
    props: {
      handleKeyDown(view, event) {
        const { ctx } = ctxRef;
        if (!ctx?.menu.open) return false;
        const keys = ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'];
        if (!keys.includes(event.key)) return false;
        ctx.menu.handleKey(event.key);
        return true;
      },
    },
  });
}
