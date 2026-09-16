// Implementation backing the public window.qe.validation API, for project code to answer
// host-initiated content-validation runs. Imported internally by quick-edit.js (page-side
// handshake owner), which is what actually exposes onValidationRequest/VALIDATION_SEVERITY
// as window.qe.validation — this file must not do that itself, since da-live's host code
// also imports it (for sanitizeValidationItems/MESSAGE_TYPES) from its own top window, not
// the customer page.
// SUCCESS: this check passed, nothing to report. INFO: neutral, no pass/fail judgment.
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

// Single runner for now — revisit a multi-runner registry (keyed by caller-chosen id) if
// a real need for independent scripts registering separately comes up.
let runner = null;

// Single source of truth for "is this a well-shaped validation item" — shared by this
// module's own pre-send filter below and by da-live's independent host-side re-validation
// (which must run this itself rather than trust that the sender did; see security notes).
// `title` names the check the item came from (e.g. "Alt text") — da-live groups results
// by it rather than dumping everything into one bucket.
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
