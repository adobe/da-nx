import { createFormCore } from '../core/form-core.js';
import { saveJsonDocument } from './boundary/json-api.js';
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
    saveDocument: ({ path: targetPath, document: nextDocument }) => saveJsonDocument({
      path: targetPath,
      json: nextDocument,
    }),
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
