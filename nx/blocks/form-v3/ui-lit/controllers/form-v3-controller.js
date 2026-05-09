export function createFormV3Controller({ core }) {
  if (!core) {
    throw new Error('createFormV3Controller requires a core instance.');
  }

  return {
    getSnapshot() {
      return core.getState();
    },

    async dispatch(command) {
      return core.dispatch(command);
    },

    subscribe(listener) {
      return core.subscribe(listener);
    },

    dispose() {
      core.dispose?.();
    },

    async handleFieldChange({ pointer, value }) {
      return core.dispatch({
        type: 'field.change',
        pointer,
        value,
      });
    },

    async handleArrayAdd({ pointer }) {
      return core.dispatch({
        type: 'array.add',
        pointer,
      });
    },

    async handleArrayInsert({ pointer }) {
      return core.dispatch({
        type: 'array.insert',
        pointer,
      });
    },

    async handleArrayRemove({ pointer }) {
      return core.dispatch({
        type: 'array.remove',
        pointer,
      });
    },

    async handleArrayMove({ pointer, beforePointer }) {
      return core.dispatch({
        type: 'array.move',
        pointer,
        beforePointer,
      });
    },

    async handleSelectionChange({ pointer, origin }) {
      return core.dispatch({
        type: 'selection.change',
        pointer,
        origin,
      });
    },
  };
}
