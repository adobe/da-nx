let worker;
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

function ensureWorker() {
  if (worker) return worker;

  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
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

export function runGeneratedToolInWorker(def, args, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 3000;
  const activeWorker = ensureWorker();
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
