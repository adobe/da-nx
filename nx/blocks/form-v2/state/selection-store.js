export function createSelectionStore(initialPointer = '/data') {
  let state = {
    activePointer: initialPointer,
    origin: null,
  };

  return {
    getState() {
      return state;
    },

    setActivePointer(pointer, { origin = null } = {}) {
      if (!pointer || (pointer === state.activePointer && origin === state.origin)) {
        return state;
      }

      state = {
        ...state,
        activePointer: pointer,
        origin,
      };
      return state;
    },
  };
}
