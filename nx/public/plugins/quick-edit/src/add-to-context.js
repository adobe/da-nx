/**
 * "Add to context" overlay: shows a button at the top-left of instrumented elements
 * ([data-prose-index], [data-block-index]) on hover. Uses an overlay so the button
 * stays visible when the user moves the mouse to click it.
 */

const OVERLAY_ID = 'quick-edit-add-to-context-overlay';
const HIDE_DELAY_MS = 150;

let hideTimeout = null;
let currentElement = null;

function getInstrumentedElement(target) {
  return target?.closest?.('[data-prose-index], [data-block-index]') ?? null;
}

/**
 * Build payload for "add to chat": proseIndex, blockName (if block), innerText.
 * @param {Element} el - Element with data-prose-index or data-block-index
 * @returns {{ proseIndex: number, blockName?: string, innerText: string } | null}
 */
function getAddToChatPayload(el) {
  if (!el) return null;
  const proseIndexAttr = el.getAttribute('data-prose-index');
  const blockIndexAttr = el.getAttribute('data-block-index');
  const proseIndex = proseIndexAttr != null ? parseInt(proseIndexAttr, 10) : (blockIndexAttr != null ? parseInt(blockIndexAttr, 10) : null);
  if (proseIndex == null || Number.isNaN(proseIndex)) return null;

  const innerText = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ') || '';
  let blockName = undefined;
  if (el.hasAttribute('data-block-index')) {
    const table = el.querySelector('table');
    const firstCell = table?.querySelector('tr:first-child td:first-child, tr:first-child th:first-child');
    blockName = firstCell?.textContent?.trim() || undefined;
  }

  return { proseIndex, blockName, innerText };
}

function positionOverlay(overlay, el) {
  const rect = el.getBoundingClientRect();
  overlay.style.left = `${rect.left}px`;
  overlay.style.top = `${rect.top}px`;
  overlay.style.display = '';
}

function showOverlay(overlay, el) {
  currentElement = el;
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }
  positionOverlay(overlay, el);
}

function hideOverlay(overlay) {
  overlay.style.display = 'none';
  currentElement = null;
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }
}

function scheduleHide(overlay) {
  if (hideTimeout) clearTimeout(hideTimeout);
  hideTimeout = setTimeout(() => {
    hideOverlay(overlay);
    hideTimeout = null;
  }, HIDE_DELAY_MS);
}

/**
 * Set up the "Add to context" overlay and event listeners. Call after setBody.
 * @param {HTMLElement} [root=document.body] - Root to attach overlay to and delegate from.
 * @param {object} [ctx] - Quick-edit context with port for postMessage to parent controller.
 */
export function setupAddToContext(root = document.body, ctx = null) {
  let overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'quick-edit-add-to-context-overlay';
    overlay.style.display = 'none';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'quick-edit-add-to-context-btn';
    btn.textContent = 'Add to chat';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const payload = getAddToChatPayload(currentElement);
      if (payload && ctx?.port) {
        ctx.port.postMessage({ type: 'quick-edit-add-to-chat', payload });
      }
      hideOverlay(overlay);
    });

    overlay.appendChild(btn);
    root.appendChild(overlay);

    overlay.addEventListener('mouseenter', () => {
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }
    });
    overlay.addEventListener('mouseleave', () => hideOverlay(overlay));
  }

  root.removeEventListener('mouseover', root._addToContextMouseover);
  root.removeEventListener('mouseout', root._addToContextMouseout);

  function onMouseover(e) {
    const el = getInstrumentedElement(e.target);
    if (el) showOverlay(overlay, el);
  }

  function onMouseout(e) {
    const fromEl = getInstrumentedElement(e.target);
    if (!fromEl) return;
    if (e.relatedTarget && overlay.contains(e.relatedTarget)) return;
    scheduleHide(overlay);
  }

  root._addToContextMouseover = onMouseover;
  root._addToContextMouseout = onMouseout;
  root.addEventListener('mouseover', onMouseover, true);
  root.addEventListener('mouseout', onMouseout, true);
}
