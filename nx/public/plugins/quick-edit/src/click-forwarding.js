import { MESSAGE_TYPES } from '../../../../utils/message-types.js';
import { blockName } from './selection.js';

// Clicks inside the WYSIWYG preview iframe never bubble to the host document, so the
// host can't observe them (e.g. its RUM enhancer, unlike `ew-editor-doc`, whose
// shadow-DOM clicks retarget to the host). We forward each click to the host over the
// quick-edit port and let the host decide what to do with it — da-live records an
// `ew-wysiwyg-doc` RUM click checkpoint. See docs/quick-edit-events.md.

// Best-effort descriptor of what was clicked: link destination, else the enclosing
// block name, else the element's tag.
export function clickPayload(el) {
  if (!el?.closest) return { target: undefined };
  const link = el.closest('a[href]');
  if (link) return { target: link.getAttribute('href') };
  const block = el.closest('.block');
  if (block) return { target: blockName(block) || block.tagName.toLowerCase() };
  return { target: el.tagName?.toLowerCase() };
}

// Capture-phase so in-iframe dialogs/toolbars that `stopPropagation()` are still seen;
// `click` events are composed, so a document listener also catches shadow-DOM clicks.
export function installClickForwarding({ target = document, getPort } = {}) {
  const onClick = (e) => {
    const port = getPort?.();
    if (!port) return;
    port.postMessage({ type: MESSAGE_TYPES.IFRAME_CLICK, payload: clickPayload(e.target) });
  };
  target.addEventListener('click', onClick, { capture: true });
  return () => target.removeEventListener('click', onClick, { capture: true });
}
