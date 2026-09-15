// Public API for project code to answer host-initiated content-validation runs.
// Imported internally by quick-edit.js (page-side handshake owner); project code never
// imports this file directly — it reads window.qe.validation instead (set below), which
// also means onValidationRequest/registerValidationPort just share state as one module
// instance without needing project code to import this exact URL itself.
export const VALIDATION_SEVERITY = Object.freeze({
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
});

const VALIDATION_SEVERITIES = new Set(Object.values(VALIDATION_SEVERITY));
export const VALIDATION_MESSAGE_MAX_LENGTH = 500;

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
export function isValidValidationItem(item) {
  if (!item || typeof item !== 'object') return false;
  if (!VALIDATION_SEVERITIES.has(item.severity)) return false;
  if (typeof item.message !== 'string' || item.message.length > VALIDATION_MESSAGE_MAX_LENGTH) return false;
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
    port.postMessage({ type: MESSAGE_TYPES.RESULT, requestId, items });
  };
}

// Registering again replaces the previous runner.
export function onValidationRequest(fn) {
  runner = fn;
}

// Set synchronously at module-evaluation time (not gated on the port handshake, which
// onValidationRequest doesn't need) so project code only has to race quick-edit.js's own
// script load, not the full INIT round trip.
window.qe = window.qe || {};
window.qe.validation = { onValidationRequest, VALIDATION_SEVERITY };
