export const VALIDATION_SEVERITY = Object.freeze({
  SUCCESS: 'success',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
});

const VALIDATION_SEVERITIES = new Set(Object.values(VALIDATION_SEVERITY));
export const VALIDATION_MESSAGE_MAX_LENGTH = 500;
export const VALIDATION_TITLE_MAX_LENGTH = 100;

export const MESSAGE_TYPES = Object.freeze({
  RUN: 'run',
  RESULT: 'result',
});

let runner = null;

// Shared by this module's pre-send filter and da-live's independent host-side
// re-validation, which must not trust that the sender already ran this.
export function isValidValidationItem(item) {
  if (!item || typeof item !== 'object') return false;
  if (!VALIDATION_SEVERITIES.has(item.severity)) return false;
  if (typeof item.message !== 'string' || item.message.length > VALIDATION_MESSAGE_MAX_LENGTH) return false;
  if (typeof item.title !== 'string' || !item.title || item.title.length > VALIDATION_TITLE_MAX_LENGTH) return false;
  const { blockIndex, proseIndex } = item.item ?? {};
  const hasBlockIndex = Number.isInteger(blockIndex) && blockIndex >= 0;
  const hasProseIndex = Number.isInteger(proseIndex) && proseIndex >= 0;
  return hasBlockIndex !== hasProseIndex;
}

export function sanitizeValidationItems(items) {
  if (!Array.isArray(items)) return [];
  return items.filter(isValidValidationItem);
}

async function collectItems() {
  if (!runner) return [];
  let runnerItems;
  try {
    runnerItems = await runner();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[validation] runner failed', e);
    return [];
  }
  const items = Array.isArray(runnerItems) ? runnerItems : [];
  const validItems = sanitizeValidationItems(items);
  if (validItems.length !== items.length) {
    // eslint-disable-next-line no-console
    console.warn('[validation] runner produced a malformed item');
  }
  return validItems;
}

// Called by quick-edit.js once it has the transferred validation port. No-ops cleanly
// on `undefined` so an old da-live host (which doesn't send this port yet) is harmless.
export function registerValidationPort(port) {
  if (!port) return;
  port.onmessage = async (e) => {
    if (e.data?.type !== MESSAGE_TYPES.RUN) return;
    const { requestId } = e.data;
    const items = await collectItems();
    port.postMessage({
      type: MESSAGE_TYPES.RESULT, requestId, items, hasRunner: runner !== null,
    });
  };
}

export function onValidationRequest(fn) {
  runner = fn;
}
