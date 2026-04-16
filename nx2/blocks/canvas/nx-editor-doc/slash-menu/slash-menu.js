/* eslint-disable import/no-unresolved -- importmap */
import { Plugin } from 'da-y-wrapper';

const ITEMS = [
  { id: 'heading', label: 'Heading' },
  { id: 'list', label: 'Bulleted List' },
  { id: 'ordered-list', label: 'Numbered List' },
  { id: 'table', label: 'Table' },
];

let menuImport;

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

function filterItems(query) {
  const q = query.toLowerCase();
  return ITEMS.filter((item) => {
    if (!item.label) return false;
    if (!query) return true;
    return item.label.toLowerCase().startsWith(q);
  });
}

function setup(container, view) {
  const anchor = document.createElement('span');
  anchor.style.cssText = 'position:fixed;width:0;height:0;pointer-events:none';
  container.append(anchor);

  const menu = document.createElement('nx-menu');
  menu.items = ITEMS;
  container.append(menu);

  menu.addEventListener('select', (e) => {
    // TODO: wire up block insertion per item id
    // eslint-disable-next-line no-console
    console.log('slash-menu:', e.detail.id);
    view.focus();
  });

  return { menu, anchor };
}

function positionAnchor(view, anchor, pos) {
  const coords = view.coordsAtPos(pos);
  anchor.style.left = `${coords.left}px`;
  anchor.style.top = `${coords.bottom}px`;
}

function syncSlashUi(view, ctxRef) {
  const container = view.dom.parentElement;
  if (!container) return;

  const slash = getSlashContext(view.state);

  if (!slash) {
    ctxRef.ctx?.menu.close();
    return;
  }

  const items = filterItems(slash.query);
  if (!items.length) {
    ctxRef.ctx?.menu.close();
    return;
  }

  if (!menuImport) {
    menuImport = import('../../../shared/menu/menu.js');
  }

  menuImport
    .then(() => {
      if (!ctxRef.ctx) ctxRef.ctx = setup(container, view);
      const { menu, anchor } = ctxRef.ctx;
      positionAnchor(view, anchor, slash.anchorPos);
      menu.items = items;
      if (!menu.open) {
        menu.show({ anchor });
      }
    })
    .catch(() => {});
}

function destroySlashUi(ctxRef) {
  const { ctx } = ctxRef;
  if (!ctx) return;
  ctx.menu.close();
  ctx.anchor.remove();
  ctx.menu.remove();
  ctxRef.ctx = undefined;
}

export function createSlashMenuPlugin() {
  const ctxRef = { ctx: undefined };

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
