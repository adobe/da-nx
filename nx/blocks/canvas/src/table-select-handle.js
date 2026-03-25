/* eslint-disable import/no-unresolved */
import { Plugin, NodeSelection } from 'da-y-wrapper';
/* eslint-enable import/no-unresolved */

const HANDLE_OFFSET = 6;

const HANDLE_STYLES = `
.table-select-handle {
  position: absolute;
  width: 20px;
  height: 20px;
  background-color: #fff;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 18 18' width='12' height='12'%3E%3Ccircle cx='5' cy='3' r='1.5' fill='%23666'/%3E%3Ccircle cx='13' cy='3' r='1.5' fill='%23666'/%3E%3Ccircle cx='5' cy='9' r='1.5' fill='%23666'/%3E%3Ccircle cx='13' cy='9' r='1.5' fill='%23666'/%3E%3Ccircle cx='5' cy='15' r='1.5' fill='%23666'/%3E%3Ccircle cx='13' cy='15' r='1.5' fill='%23666'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: center;
  border: 1px solid #ccc;
  border-radius: 4px;
  z-index: 100;
  cursor: pointer;
  display: none;
  align-items: center;
  justify-content: center;
}

.table-select-handle.is-visible {
  display: flex;
}

.table-select-handle:hover {
  background-color: #f0f7ff;
  border-color: #1473e6;
}

.da-inline-editor-mount {
  position: relative;
}
`;

function injectStyles(container) {
  const root = container.getRootNode();
  if (root instanceof ShadowRoot && !root.querySelector('#da-table-handle-style')) {
    const style = document.createElement('style');
    style.id = 'da-table-handle-style';
    style.textContent = HANDLE_STYLES;
    root.appendChild(style);
  }
}

function getTablePos(view, tableEl) {
  const pos = view.posAtDOM(tableEl, 0);
  if (pos === null) return null;

  const $pos = view.state.doc.resolve(pos);
  for (let d = $pos.depth; d >= 0; d -= 1) {
    if ($pos.node(d).type.name === 'table') return $pos.before(d);
  }
  return null;
}

/**
 * Allows selecting an entire table by clicking an icon in the top-left corner.
 * Mirrors da-live's tableSelectHandle plugin, adapted for da-nx:
 * - Lazily mounts the handle after proseEl is attached to the shadow DOM
 * - Targets <table> directly (no .tableWrapper — columnResizing() is omitted in da-nx)
 */
export default function tableSelectHandle() {
  let handle = null;
  let currentTable = null;

  function showHandle(tableEl, editorRect) {
    if (!handle || !tableEl) return;
    const rect = tableEl.getBoundingClientRect();
    handle.style.left = `${rect.left - editorRect.left + HANDLE_OFFSET}px`;
    handle.style.top = `${rect.top - editorRect.top + HANDLE_OFFSET}px`;
    handle.classList.add('is-visible');
  }

  function hideHandle() {
    handle?.classList.remove('is-visible');
    currentTable = null;
  }

  function createHandle(view) {
    const el = document.createElement('div');
    el.className = 'table-select-handle';
    el.contentEditable = 'false';

    el.addEventListener('mousedown', (e) => {
      if (!currentTable) return;
      e.preventDefault();
      e.stopPropagation();
      const tablePos = getTablePos(view, currentTable);
      if (tablePos !== null) {
        const sel = NodeSelection.create(view.state.doc, tablePos);
        view.dispatch(view.state.tr.setSelection(sel));
        view.focus();
      }
    });

    el.addEventListener('mouseleave', (e) => {
      if (e.relatedTarget && currentTable?.contains(e.relatedTarget)) return;
      hideHandle();
    });

    return el;
  }

  return new Plugin({
    view(editorView) {
      handle = createHandle(editorView);

      // proseEl is created detached and appended to the shadow DOM later by
      // da-inline-editor.updated(). Mount the handle lazily on first update.
      function ensureMounted() {
        if (handle.parentElement) return;
        const container = editorView.dom.parentElement;
        if (!container) return;
        injectStyles(container);
        container.appendChild(handle);
      }

      const onMouseOver = (e) => {
        const tableEl = e.target.closest('table');
        if (!tableEl || tableEl === currentTable) return;
        if (!editorView.dom.contains(tableEl)) return;
        currentTable = tableEl;
        const editorRect = editorView.dom.getBoundingClientRect();
        showHandle(tableEl, editorRect);
      };

      const onMouseOut = (e) => {
        const tableEl = e.target.closest('table');
        if (!tableEl) return;
        const related = e.relatedTarget;
        if (related === handle || tableEl.contains(related)) return;
        hideHandle();
      };

      editorView.dom.addEventListener('mouseover', onMouseOver);
      editorView.dom.addEventListener('mouseout', onMouseOut);

      return {
        update() {
          ensureMounted();
          if (currentTable && !currentTable.isConnected) hideHandle();
        },
        destroy() {
          editorView.dom.removeEventListener('mouseover', onMouseOver);
          editorView.dom.removeEventListener('mouseout', onMouseOut);
          handle?.remove();
          handle = null;
        },
      };
    },
  });
}
