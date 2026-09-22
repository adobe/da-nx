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
  ACK: 'ack',
  RESULT: 'result',
});

let customValidation = null;

// Shared by this module's pre-send filter and da-live's independent host-side
// re-validation, which must not trust that the sender already ran this.
export function isValidCustomValidationItem(item) {
  if (!item || typeof item !== 'object') return false;
  if (!VALIDATION_SEVERITIES.has(item.severity)) return false;
  if (typeof item.message !== 'string' || item.message.length > VALIDATION_MESSAGE_MAX_LENGTH) return false;
  if (typeof item.title !== 'string' || !item.title || item.title.length > VALIDATION_TITLE_MAX_LENGTH) return false;
  const { blockIndex, proseIndex } = item.item ?? {};
  const hasBlockIndex = Number.isInteger(blockIndex) && blockIndex >= 0;
  const hasProseIndex = Number.isInteger(proseIndex) && proseIndex >= 0;
  return hasBlockIndex !== hasProseIndex;
}

export function sanitizeCustomValidationItems(items) {
  if (!Array.isArray(items)) return [];
  return items.filter(isValidCustomValidationItem);
}

async function collectItems() {
  if (!customValidation) return [];
  let customValidationItems;
  try {
    customValidationItems = await customValidation();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[custom-validation] check failed', e);
    return [];
  }
  const items = Array.isArray(customValidationItems) ? customValidationItems : [];
  const validItems = sanitizeCustomValidationItems(items);
  if (validItems.length !== items.length) {
    // eslint-disable-next-line no-console
    console.warn('[custom-validation] check produced a malformed item');
  }
  return validItems;
}

// Called by quick-edit.js once it has the transferred validation port. No-ops cleanly
// on `undefined` so an old da-live host (which doesn't send this port yet) is harmless.
export function registerCustomValidationPort(port) {
  if (!port) return;
  port.onmessage = async (e) => {
    if (e.data?.type !== MESSAGE_TYPES.RUN) return;
    const { requestId } = e.data;
    // Sent before collectItems() so the host can tell "no responder at all" (old
    // host/no quick-edit here) apart from "responder alive, but the check is slow".
    port.postMessage({
      type: MESSAGE_TYPES.ACK, requestId, hasCustomValidation: customValidation !== null,
    });
    const items = await collectItems();
    port.postMessage({
      type: MESSAGE_TYPES.RESULT, requestId, items, hasCustomValidation: customValidation !== null,
    });
  };
}

export function onCustomValidationRequest(fn) {
  customValidation = fn;
}
