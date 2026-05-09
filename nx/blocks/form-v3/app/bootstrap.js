import { createFormCore } from '../core/form-core.js';
import { saveSourceHtml } from './boundary/da-source-api.js';
import { serialize } from './boundary/serialize.js';
import { createStateBinding } from '../ui-lit/bindings/state-binding.js';
import { createFormController } from '../ui-lit/controllers/form-controller.js';

export function createFormApp({
  path,
  schema,
  document,
  onState,
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
  const state = createStateBinding({
    controller,
    onState,
  });

  async function load() {
    await core.load({
      schema,
      document,
    });
    return state.getSnapshot();
  }

  function destroy() {
    state.dispose();
    controller.dispose();
  }

  return {
    core,
    controller,
    state,
    load,
    destroy,
  };
}
