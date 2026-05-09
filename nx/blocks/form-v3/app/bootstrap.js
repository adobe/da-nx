import { createFormCore } from '../core/index.js';
import { createFormV3Controller } from '../ui-lit/controllers/form-v3-controller.js';

export function createFormV3App({
  path,
  schema,
  document,
  permissions,
  saveDocument,
} = {}) {
  const core = createFormCore({
    path,
    saveDocument,
  });
  const controller = createFormV3Controller({ core });

  async function load() {
    await core.load({
      schema,
      document,
      permissions,
    });
    return controller.getSnapshot();
  }

  return {
    core,
    controller,
    load,
  };
}
