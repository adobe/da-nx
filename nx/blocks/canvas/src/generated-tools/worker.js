import { executeGeneratedTool } from './poc-tools.js';

self.addEventListener('message', (event) => {
  const {
    id,
    toolId,
    implementation,
    args,
  } = event.data || {};

  try {
    const result = executeGeneratedTool({
      toolId,
      implementation,
      args,
    });
    self.postMessage({ id, result });
  } catch (e) {
    self.postMessage({
      id,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});
