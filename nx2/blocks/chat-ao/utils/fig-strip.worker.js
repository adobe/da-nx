// Loaded via a same-origin blob: URL (see getFigParseWorker in fig-strip.js) —
// a cross-origin Worker script is blocked outright, with no CORS opt-in. A
// relative import can't resolve from inside a blob: URL, so the inspector
// module is loaded dynamically against the absolute URL the main thread sends.
let modPromise;
let initPromise;

async function ensureReady(baseUrl) {
  if (!modPromise) {
    modPromise = import(new URL('./fig-inspector/fig_inspector.js', baseUrl).href);
  }
  const mod = await modPromise;
  if (!initPromise) {
    initPromise = mod.default();
  }
  await initPromise;
  return mod;
}

self.addEventListener('message', async ({ data }) => {
  const { id, bytes, baseUrl } = data || {};
  try {
    const { inspect_fig: inspectFig } = await ensureReady(baseUrl);
    const result = JSON.parse(inspectFig(new Uint8Array(bytes)));
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    });
  }
});
