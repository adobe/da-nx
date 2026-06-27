import { isClientEligible } from './capabilities.js';
// eslint-disable-next-line import/no-named-as-default
import WORKER_BOOTSTRAP from './worker-host.js';

// RUNNERS strategy seam:
// Currently: CLIENT_WORKER — runs pure skills in a sandboxed web worker blob.
// Future: SANDBOX — POST { moduleUrl, entry, input } to a server endpoint that
//   executes in a server-side sandbox (for skills with capabilities: ['network'], etc.).
//   To add: check manifest.capabilities, if non-empty and server runner available,
//   POST to SANDBOX_ENDPOINT and await JSON response { output } or { error }.
//   The caller shape { json } / { error } is identical — no caller changes needed.

export async function runSkillScript({ manifest, moduleUrl, input }) {
  if (!isClientEligible(manifest.capabilities)) {
    return { error: 'requires server runtime' };
  }

  const blob = new Blob([WORKER_BOOTSTRAP], { type: 'application/javascript' });
  const blobUrl = URL.createObjectURL(blob);
  const worker = new Worker(blobUrl, { type: 'module' });

  try {
    const result = await new Promise((resolve) => {
      worker.onmessage = ({ data }) => resolve(data);
      worker.onerror = (event) => resolve({ error: event.message || 'worker error' });
      worker.postMessage({
        moduleUrl, entry: manifest.entry, input, timeoutMs: manifest.timeoutMs ?? 5000,
      });
    });
    if (result.error) return { error: result.error };
    return { json: result.json.output };
  } finally {
    worker.terminate();
    URL.revokeObjectURL(blobUrl);
  }
}
