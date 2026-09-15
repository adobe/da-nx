// Public API for project code to answer host-initiated content-validation runs.
// Imported by identical URL from quick-edit.js (page-side handshake owner) and by
// arbitrary project JS — the shared ES module cache gives both the same instance.
export const VALIDATION_SEVERITY = Object.freeze({
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
});

const MESSAGE_TYPES = Object.freeze({
  RUN: 'run',
  RESULT: 'result',
});

const runners = new Map();

function isValidItem(item) {
  if (!item || typeof item !== 'object') return false;
  const hasBlockIndex = Number.isInteger(item.blockIndex);
  const hasProseIndex = Number.isInteger(item.proseIndex);
  return hasBlockIndex !== hasProseIndex;
}

async function collectItems() {
  const entries = [...runners.entries()];
  const settled = await Promise.allSettled(entries.map(([, runner]) => runner()));
  const items = [];
  settled.forEach((outcome, i) => {
    const [id] = entries[i];
    if (outcome.status === 'rejected') {
      // eslint-disable-next-line no-console
      console.warn(`[validation] runner "${id}" failed`, outcome.reason);
      return;
    }
    const runnerItems = Array.isArray(outcome.value) ? outcome.value : [];
    runnerItems.forEach((item) => {
      if (isValidItem(item)) {
        items.push(item);
      } else {
        // eslint-disable-next-line no-console
        console.warn(`[validation] runner "${id}" produced a malformed item`, item);
      }
    });
  });
  return items;
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

// Registering again with an `id` already in use replaces just that runner.
export function onValidationRequest(id, runner) {
  runners.set(id, runner);
}
