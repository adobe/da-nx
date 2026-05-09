export function createFormV3Controller({ core }) {
  if (!core) {
    throw new Error('createFormV3Controller requires a core instance.');
  }

  return {
    getSnapshot() {
      return core.getState();
    },

    subscribe(listener) {
      return core.subscribe(listener);
    },

    dispose() {
      core.dispose?.();
    },

    async handleFieldChange({ pointer, value }) {
      return core.changeField({ pointer, value });
    },

    async handleArrayAdd({ pointer }) {
      return core.arrayAdd({ pointer });
    },

    async handleArrayInsert({ pointer }) {
      return core.arrayInsert({ pointer });
    },

    async handleArrayRemove({ pointer }) {
      return core.arrayRemove({ pointer });
    },

    async handleArrayMove({ pointer, beforePointer }) {
      return core.arrayMove({ pointer, beforePointer });
    },

    handleSelectionChange({ pointer, origin }) {
      return core.setSelection({ pointer, origin });
    },
  };
}
