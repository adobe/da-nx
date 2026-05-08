export function createSelectionStore(initialPointer = '/data') {
  let state = {
    activePointer: initialPointer,
  };

  return {
    getState() {
      return state;
    },

    setActivePointer(pointer) {
      if (!pointer || pointer === state.activePointer) {
        return state;
      }

      state = {
        ...state,
        activePointer: pointer,
      };
      return state;
    },
  };
}
