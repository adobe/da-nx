import { MESSAGE_TYPES } from '../../../../utils/message-types.js';
import { targetSelector } from './rum-target.js';

// Clicks inside the WYSIWYG preview iframe never bubble to the host document, so the
// host can't observe them (e.g. its RUM enhancer, unlike `ew-editor-doc`, whose
// shadow-DOM clicks retarget to the host). We forward each click to the host over the
// quick-edit port and let the host decide what to do with it — da-live records a RUM click
// checkpoint using the forwarded `source`. See docs/quick-edit-events.md.

// `source` is the RUM source: the doc editor for clicks in editable text content, the layout
// editor for blocks, images and the layout overlays. `target` uses the RUM enhancer's own
// format (absolute link/media/action URL or `data-rum-target`), so these clicks are
// comparable with standard RUM click data.
const SOURCE_DOC = 'ew-wysiwyg-doc';
const SOURCE_LAYOUT = 'ew-wysiwyg-layout';

export function clickSource(el) {
  const isDoc = el?.closest?.('[data-prose-index]') && !el.closest('picture');
  return isDoc ? SOURCE_DOC : SOURCE_LAYOUT;
}

export function clickPayload(el) {
  return { target: targetSelector(el), source: clickSource(el) };
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
