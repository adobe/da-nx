function cloneSnapshot(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

export function createStateBinding({ controller, onState } = {}) {
  if (!controller) {
    throw new Error('createStateBinding requires a controller instance.');
  }

  let latestSnapshot = cloneSnapshot(controller.getSnapshot?.() ?? {});
  const listeners = new Set();

  function getSnapshot() {
    return cloneSnapshot(latestSnapshot);
  }

  function notify(nextSnapshot) {
    latestSnapshot = cloneSnapshot(nextSnapshot ?? {});
    const safeSnapshot = getSnapshot();

    onState?.(safeSnapshot);

    for (const listener of listeners) {
      listener(getSnapshot());
    }

    return safeSnapshot;
  }

  const unsubscribe = controller.subscribe((snapshot) => {
    notify(snapshot);
  }, { emitCurrent: true });

  function subscribe(listener, { emitCurrent = true } = {}) {
    listeners.add(listener);

    if (emitCurrent) {
      listener(getSnapshot());
    }

    return () => {
      listeners.delete(listener);
    };
  }

  function dispose() {
    unsubscribe?.();
    listeners.clear();
  }

  return {
    getSnapshot,
    subscribe,
    dispose,
  };
}
