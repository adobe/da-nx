import { createFormCore } from '../core/form-core.js';
import { createStateBinding } from '../ui-lit/bindings/index.js';
import { createFormV3Controller } from '../ui-lit/controllers/form-v3-controller.js';

export function createFormV3App({
  path,
  schema,
  document,
  permissions,
  saveDocument,
  onState,
} = {}) {
  const core = createFormCore({
    path,
    saveDocument,
  });
  const controller = createFormV3Controller({ core });
  const state = createStateBinding({
    controller,
    onState,
  });

  async function load() {
    await core.load({
      schema,
      document,
      permissions,
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
