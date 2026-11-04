import { MESSAGE_TYPES } from '../../../../utils/message-types.js';
import { targetSelector } from './rum-target.js';

// Iframe clicks cannot reach host RUM; see docs/quick-edit-events.md.
// All clicks in this iframe belong to the layout editor, including inline text editing.
const SOURCE_LAYOUT = 'ew-wysiwyg-layout';

export function clickSource() {
  return SOURCE_LAYOUT;
}

export function clickPayload(el) {
  return { target: targetSelector(el), source: clickSource() };
}

// Capture clicks before iframe controls can stop propagation.
export function installClickForwarding({ target = document, getPort } = {}) {
  const onClick = (e) => {
    const port = getPort?.();
    if (!port) return;
    port.postMessage({
      type: MESSAGE_TYPES.QUICK_EDIT_IFRAME_CLICK,
      payload: clickPayload(e.target),
    });
  };
  target.addEventListener('click', onClick, { capture: true });
  return () => target.removeEventListener('click', onClick, { capture: true });
}
