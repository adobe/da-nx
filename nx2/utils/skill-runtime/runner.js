import { isClientEligible } from './capabilities.js';
// eslint-disable-next-line import/no-named-as-default
import WORKER_BOOTSTRAP, { DEPENDENCY_ALLOWLIST } from './worker-host.js';

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
      // Resolve allowlist URLs to absolute against THIS module's location (the nx2
      // base where deps are served), not the page origin. The consuming page may be
      // served from a different origin (e.g. da-live on :3000) than nx2 (da-nx on
      // :6456 locally, or the nx CDN in prod); resolving against import.meta.url
      // points dependency imports at wherever nx2 actually lives. The worker receives
      // absolute URLs so it can import() them regardless of its own (blob:) origin.
      const resolvedAllowlist = Object.fromEntries(
        Object.entries(DEPENDENCY_ALLOWLIST).map(([name, url]) => [
          name,
          new URL(url, import.meta.url).href,
        ]),
      );

      worker.postMessage({
        moduleUrl,
        entry: manifest.entry,
        input,
        timeoutMs: manifest.timeoutMs ?? 5000,
        dependencies: manifest.dependencies ?? [],
        allowlist: resolvedAllowlist,
      });
    });
    if (result.error) return { error: result.error };
    return { json: result.json.output };
  } finally {
    worker.terminate();
    URL.revokeObjectURL(blobUrl);
  }
}
