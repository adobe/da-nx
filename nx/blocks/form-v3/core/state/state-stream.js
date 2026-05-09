function cloneSnapshot(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

export function createStateStream({ initialState } = {}) {
  let snapshot = cloneSnapshot(initialState ?? {});
  const listeners = new Set();

  function getSnapshot() {
    return cloneSnapshot(snapshot);
  }

  function publish(nextState) {
    snapshot = cloneSnapshot(nextState ?? {});

    for (const listener of listeners) {
      listener(getSnapshot());
    }

    return getSnapshot();
  }

  function subscribe(listener, { emitCurrent = true } = {}) {
    listeners.add(listener);

    if (emitCurrent) {
      listener(getSnapshot());
    }

    return () => {
      listeners.delete(listener);
    };
  }

  function clear() {
    listeners.clear();
  }

  return {
    getSnapshot,
    publish,
    subscribe,
    clear,
  };
}
