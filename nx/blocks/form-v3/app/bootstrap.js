import { createFormCore } from '../core/form-core.js';
import { saveSourceHtml } from './boundary/da-source-api.js';
import { serialize } from './boundary/serialize.js';
import { createFormController } from '../ui-lit/controllers/form-controller.js';

export function createFormApp({
  path,
  schema,
  document,
} = {}) {
  const core = createFormCore({
    path,
    saveDocument: async ({ path: targetPath, document: nextDocument }) => {
      const result = serialize({ json: nextDocument });
      if (result.error) return result;
      return saveSourceHtml({
        path: targetPath,
        html: result.html,
      });
    },
  });
  const controller = createFormController({ core });

  async function load() {
    return controller.load({
      schema,
      document,
    });
  }

  function destroy() {
    controller.dispose();
  }

  return {
    core,
    controller,
    load,
    destroy,
  };
}
