/**
 * "Add to chat" handle: shows a button next to the table-select-handle
 * when hovering a table in the doc editor. Mirrors the WYSIWYG
 * add-to-context overlay (add-to-context.js) but as a ProseMirror plugin.
 */
/* eslint-disable import/no-unresolved */
import { Plugin } from 'da-y-wrapper';
/* eslint-enable import/no-unresolved */

const HANDLE_OFFSET = 6;
const HANDLE_SIZE = 20;
const HANDLE_GAP = 4;
/** Position to the right of the table-select-handle */
const BTN_LEFT_OFFSET = HANDLE_OFFSET + HANDLE_SIZE + HANDLE_GAP;

const ICON_URL = new URL('../../../img/icons/addtochat.svg', import.meta.url).href;

const BTN_STYLES = `
.da-add-to-chat-handle {
  position: absolute;
  width: 20px;
  height: 20px;
  background-color: #fff;
  background-image: url("${ICON_URL}");
  background-repeat: no-repeat;
  background-position: center;
  background-size: 14px;
  border: 1px solid #ccc;
  border-radius: 4px;
  z-index: 100;
  cursor: pointer;
  display: none;
  align-items: center;
  justify-content: center;
}

.da-add-to-chat-handle.is-visible {
  display: flex;
}

.da-add-to-chat-handle:hover {
  background-color: #f0f7ff;
  border-color: #1473e6;
}
`;

function injectStyles(container) {
  const root = container.getRootNode();
  if (root instanceof ShadowRoot && !root.querySelector('#da-add-to-chat-handle-style')) {
    const style = document.createElement('style');
    style.id = 'da-add-to-chat-handle-style';
    style.textContent = BTN_STYLES;
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

function getBlockName(tableEl) {
  const firstCell = tableEl.querySelector('tr:first-child td:first-child, tr:first-child th:first-child');
  return firstCell?.textContent?.trim() || undefined;
}

export default function addToChatHandle(onAddToChat) {
  let btn = null;
  let currentTable = null;

  function showBtn(tableEl, editorRect) {
    if (!btn || !tableEl) return;
    const rect = tableEl.getBoundingClientRect();
    btn.style.left = `${rect.left - editorRect.left + BTN_LEFT_OFFSET}px`;
    btn.style.top = `${rect.top - editorRect.top + HANDLE_OFFSET}px`;
    btn.classList.add('is-visible');
  }

  function hideBtn() {
    btn?.classList.remove('is-visible');
    currentTable = null;
  }

  function createBtn(view) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'da-add-to-chat-handle';
    el.contentEditable = 'false';
    el.setAttribute('aria-label', 'Add to chat');

    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!currentTable) return;
      const proseIndex = getTablePos(view, currentTable);
      if (proseIndex === null) return;
      const blockName = getBlockName(currentTable);
      // Skip the header row (block name) so innerText matches WYSIWYG behaviour:
      // WYSIWYG renders the block without a header row, so its innerText is content-only.
      const contentRows = Array.from(currentTable.querySelectorAll('tr')).slice(1);
      const rawText = contentRows.map((r) => r.innerText || r.textContent || '').join(' ');
      const innerText = rawText.trim().replace(/\s+/g, ' ');
      onAddToChat?.({ proseIndex, blockName, innerText });
      hideBtn();
    });

    el.addEventListener('mouseleave', (e) => {
      if (e.relatedTarget && currentTable?.contains(e.relatedTarget)) return;
      hideBtn();
    });

    return el;
  }

  return new Plugin({
    view(editorView) {
      btn = createBtn(editorView);

      function ensureMounted() {
        if (btn.parentElement) return;
        const container = editorView.dom.parentElement;
        if (!container) return;
        injectStyles(container);
        container.appendChild(btn);
      }

      const onMouseOver = (e) => {
        const tableEl = e.target.closest('table');
        if (!tableEl || tableEl === currentTable) return;
        if (!editorView.dom.contains(tableEl)) return;
        currentTable = tableEl;
        showBtn(tableEl, editorView.dom.getBoundingClientRect());
      };

      const onMouseOut = (e) => {
        const tableEl = e.target.closest('table');
        if (!tableEl) return;
        const related = e.relatedTarget;
        if (related === btn || tableEl.contains(related)) return;
        hideBtn();
      };

      editorView.dom.addEventListener('mouseover', onMouseOver);
      editorView.dom.addEventListener('mouseout', onMouseOut);

      return {
        update() {
          ensureMounted();
          if (currentTable && !currentTable.isConnected) hideBtn();
        },
        destroy() {
          editorView.dom.removeEventListener('mouseover', onMouseOver);
          editorView.dom.removeEventListener('mouseout', onMouseOut);
          btn?.remove();
          btn = null;
        },
      };
    },
  });
}
