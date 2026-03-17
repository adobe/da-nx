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

function getDataItem(el) {
  if (!el) return null;
  const proseIndex = el.getAttribute('data-prose-index');
  const blockIndex = el.getAttribute('data-block-index');
  return {
    proseIndex: proseIndex != null ? parseInt(proseIndex, 10) : null,
    blockIndex: blockIndex != null ? parseInt(blockIndex, 10) : null,
    element: el,
  };
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
 */
export function setupAddToContext(root = document.body) {
  let overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'quick-edit-add-to-context-overlay';
    overlay.style.display = 'none';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'quick-edit-add-to-context-btn';
    btn.textContent = 'Add to context';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const data = getDataItem(currentElement);
      if (data) {
        // eslint-disable-next-line no-console
        console.log('Add to context:', data);
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
