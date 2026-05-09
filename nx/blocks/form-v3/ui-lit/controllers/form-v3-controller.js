import { toCoreCommand } from './intent-command-map.js';

export function createFormV3Controller({ core }) {
  if (!core) {
    throw new Error('createFormV3Controller requires a core instance.');
  }

  async function dispatch(commandOrIntent) {
    return core.dispatch(toCoreCommand(commandOrIntent));
  }

  return {
    getSnapshot() {
      return core.getState();
    },

    dispatch,

    async handleIntent(intent) {
      return dispatch(intent);
    },

    subscribe(listener, options = {}) {
      return core.subscribe(listener, {
        emitCurrent: true,
        ...options,
      });
    },

    dispose() {
      core.dispose?.();
    },
  };
}
