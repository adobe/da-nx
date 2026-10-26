import { MESSAGE_TYPES } from '../../../../utils/message-types.js';
import { parseIndex } from './utils.js';

export const SUGGESTION_LOCK_SELECTOR = '[data-suggestion-lock]';

export function setupSuggestionClicks(ctx) {
  if (ctx.suggestionClickListener) return;
  ctx.suggestionClickListener = (event) => {
    const locked = event.target.closest?.(SUGGESTION_LOCK_SELECTOR);
    const proseIndex = parseIndex(locked?.getAttribute('data-suggestion-pos'));
    if (proseIndex == null) return;
    event.preventDefault();
    event.stopPropagation();
    ctx.port?.postMessage({ type: MESSAGE_TYPES.SUGGESTION_CLICK, payload: { proseIndex } });
  };
  // Capture, so a locked image's picture click never reaches image selection.
  document.addEventListener('click', ctx.suggestionClickListener, true);
}
