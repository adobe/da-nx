let worker;
/** @type {'unset' | 'worker' | 'main'} */
let runMode = 'unset';
let nextRunId = 0;
const pendingRuns = new Map();

function handleWorkerMessage(event) {
  const { id, result, error } = event.data || {};
  if (!pendingRuns.has(id)) return;

  const { resolve, reject, timer } = pendingRuns.get(id);
  pendingRuns.delete(id);
  clearTimeout(timer);

  if (error) reject(new Error(error));
  else resolve(result);
}

/**
 * Dedicated Workers must be same-origin with the document. Local dev often
 * serves modules from another port (e.g. nx on :6456, app on :3000) — then
 * fall back to main-thread execution (same logic as worker.js).
 */
function getWorker() {
  if (runMode === 'main') return null;
  if (worker) return worker;

  const scriptUrl = new URL('./worker.js', import.meta.url);
  const docOrigin = typeof window !== 'undefined' && window.location?.origin;
  if (docOrigin && scriptUrl.origin !== docOrigin) {
    runMode = 'main';
    return null;
  }

  try {
    worker = new Worker(scriptUrl, { type: 'module' });
    runMode = 'worker';
  } catch {
    runMode = 'main';
    return null;
  }

  worker.addEventListener('message', handleWorkerMessage);
  worker.addEventListener('error', (event) => {
    pendingRuns.forEach(({ reject, timer }) => {
      clearTimeout(timer);
      reject(new Error(event.message || 'Generated tool worker failed.'));
    });
    pendingRuns.clear();
  });

  return worker;
}

function runOnMainThread(def, args) {
  return import('./poc-tools.js').then(({ executeGeneratedTool }) => executeGeneratedTool({
    toolId: def.id,
    implementation: def.implementation || {},
    args,
  }));
}

export function runGeneratedToolInWorker(def, args, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 3000;
  const activeWorker = getWorker();

  if (!activeWorker) {
    return Promise.race([
      runOnMainThread(def, args),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Generated tool timed out.')), timeoutMs);
      }),
    ]);
  }

  const runId = `gt-${Date.now()}-${nextRunId += 1}`;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRuns.delete(runId);
      reject(new Error('Generated tool timed out.'));
    }, timeoutMs);

    pendingRuns.set(runId, { resolve, reject, timer });
    activeWorker.postMessage({
      id: runId,
      toolId: def.id,
      implementation: def.implementation || {},
      args,
    });
  });
}
