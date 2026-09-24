import { MESSAGE_TYPES } from '../../../../utils/message-types.js';
import { blockName } from './selection.js';

// Clicks inside the WYSIWYG preview iframe never bubble to the host document, so the
// host's RUM enhancer can't see them (unlike `ew-editor-doc`, whose shadow-DOM clicks
// retarget to the host). We forward each click to the host over the quick-edit port so
// it can record an `ew-wysiwyg-doc` RUM click checkpoint. See docs/quick-edit-events.md.
const RUM_SOURCE = 'ew-wysiwyg-doc';

// Best-effort descriptor of what was clicked: link destination, else the enclosing
// block name, else the element's tag. `source` mirrors how the enhancer names
// `ew-editor-doc` (the host element), keeping the two editors symmetrical.
export function rumClickPayload(el) {
  if (!el?.closest) return { source: RUM_SOURCE, target: undefined };
  const link = el.closest('a[href]');
  if (link) return { source: RUM_SOURCE, target: link.getAttribute('href') };
  const block = el.closest('.block');
  if (block) return { source: RUM_SOURCE, target: blockName(block) || block.tagName.toLowerCase() };
  return { source: RUM_SOURCE, target: el.tagName?.toLowerCase() };
}

// Capture-phase so in-iframe dialogs/toolbars that `stopPropagation()` are still seen;
// `click` events are composed, so a document listener also catches shadow-DOM clicks.
export function installRumClickForwarding({ target = document, getPort } = {}) {
  const onClick = (e) => {
    const port = getPort?.();
    if (!port) return;
    port.postMessage({ type: MESSAGE_TYPES.RUM_CLICK, payload: rumClickPayload(e.target) });
  };
  target.addEventListener('click', onClick, { capture: true });
  return () => target.removeEventListener('click', onClick, { capture: true });
}
