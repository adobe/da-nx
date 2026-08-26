import init, { inspect_fig as inspectFig } from './fig-inspector/fig_inspector.js';

let initPromise;

async function ensureReady() {
  if (!initPromise) {
    initPromise = init();
  }
  await initPromise;
}

self.addEventListener('message', async ({ data }) => {
  const { id, bytes } = data || {};
  try {
    await ensureReady();
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
