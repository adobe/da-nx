/**
 * "Add to context" overlay: shows a button above the top-left of instrumented elements
 * ([data-prose-index], [data-block-index]) on hover. Uses an overlay so the button
 * stays visible when the user moves the mouse to click it.
 */

const OVERLAY_ID = 'quick-edit-add-to-context-overlay';
const HIDE_DELAY_MS = 150;
const ABOVE_GAP_PX = 6;
/** When the position leaves the control above the viewport, clamp to inset from viewport top. */
const VIEWPORT_TOP_MIN_PX = ABOVE_GAP_PX;

const ADD_TO_CHAT_ICON_URL = new URL('../../../../img/icons/addtochat.svg', import.meta.url).href;

let hideTimeout = null;
let currentElement = null;
let positionListener = null;

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
  let proseIndex = null;
  if (proseIndexAttr != null) {
    proseIndex = parseInt(proseIndexAttr, 10);
  } else if (blockIndexAttr != null) {
    proseIndex = parseInt(blockIndexAttr, 10);
  }
  if (proseIndex == null || Number.isNaN(proseIndex)) return null;

  const innerText = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ') || '';
  let blockName;
  if (el.hasAttribute('data-block-index')) {
    const table = el.querySelector('table');
    const firstCell = table?.querySelector('tr:first-child td:first-child, tr:first-child th:first-child');
    blockName = firstCell?.textContent?.trim() || undefined;
  }

  return { proseIndex, blockName, innerText };
}

function documentOffsets() {
  const sx = window.scrollX ?? document.documentElement.scrollLeft ?? 0;
  const sy = window.scrollY ?? document.documentElement.scrollTop ?? 0;
  return { sx, sy };
}

function positionOverlay(overlay, el) {
  const rect = el.getBoundingClientRect();
  const { sx, sy } = documentOffsets();

  const prevDisplay = overlay.style.display;
  const prevVisibility = overlay.style.visibility;
  if (prevDisplay === 'none') {
    overlay.style.visibility = 'hidden';
    overlay.style.display = 'block';
  }
  const btn = overlay.querySelector('.quick-edit-add-to-context-btn');
  const controlHeight = btn?.offsetHeight || 28;
  overlay.style.visibility = prevVisibility;
  overlay.style.display = prevDisplay;

  overlay.style.left = `${rect.left + sx}px`;
  overlay.style.top = `${rect.top + sy - controlHeight - ABOVE_GAP_PX}px`;
  overlay.style.display = '';

  const { top: overlayViewportTop } = overlay.getBoundingClientRect();
  if (overlayViewportTop < VIEWPORT_TOP_MIN_PX) {
    const shift = VIEWPORT_TOP_MIN_PX - overlayViewportTop;
    const docTop = parseFloat(overlay.style.top);
    if (!Number.isNaN(docTop)) {
      overlay.style.top = `${docTop + shift}px`;
    }
  }
}

function attachPositionListeners(overlay) {
  if (positionListener) return;
  positionListener = () => {
    if (currentElement && overlay.style.display !== 'none') {
      positionOverlay(overlay, currentElement);
    }
  };
  window.addEventListener('scroll', positionListener, true);
  window.addEventListener('resize', positionListener);
}

function detachPositionListeners() {
  if (!positionListener) return;
  window.removeEventListener('scroll', positionListener, true);
  window.removeEventListener('resize', positionListener);
  positionListener = null;
}

function showOverlay(overlay, el) {
  currentElement = el;
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }
  positionOverlay(overlay, el);
  attachPositionListeners(overlay);
}

function hideOverlay(overlay) {
  overlay.style.display = 'none';
  currentElement = null;
  detachPositionListeners();
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
    btn.setAttribute('aria-label', 'Add to chat');
    const icon = document.createElement('img');
    icon.src = ADD_TO_CHAT_ICON_URL;
    icon.alt = '';
    icon.className = 'quick-edit-add-to-context-btn-icon';
    icon.width = 20;
    icon.height = 20;
    btn.appendChild(icon);
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

  /* eslint-disable no-underscore-dangle -- listener refs on root for teardown before re-attach */
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
  /* eslint-enable no-underscore-dangle */
  root.addEventListener('mouseover', onMouseover, true);
  root.addEventListener('mouseout', onMouseout, true);
}
