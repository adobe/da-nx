import { MESSAGE_TYPES } from '../../../../utils/message-types.js';

// Alt+F10 is the WAI-ARIA convention for moving focus from an editor to its toolbar.
export function isToolbarShortcut(event) {
  return event.altKey && event.key === 'F10'
    && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}

// Keys pressed in the preview never reach the host page, so relay the shortcut that
// moves focus to the host's floating toolbar.
export function setupToolbarShortcut(ctx) {
  if (ctx.toolbarShortcutListener) return;
  ctx.toolbarShortcutListener = (event) => {
    if (!isToolbarShortcut(event)) return;
    event.preventDefault();
    ctx.port?.postMessage({ type: MESSAGE_TYPES.FOCUS_TOOLBAR });
  };
  document.addEventListener('keydown', ctx.toolbarShortcutListener);
}
