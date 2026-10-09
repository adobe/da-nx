const REQUEST_TIMEOUT = 30000;

export function createEditorActions(port, capabilities = {}) {
  let sequence = 0;
  let disposed = false;
  const pending = new Map();
  const subscribers = new Map();
  const error = (code, message) => Object.assign(new Error(message), { code });
  let receive;

  function dispose() {
    if (disposed) return;
    disposed = true;
    port.removeEventListener('message', receive);
    pending.forEach(({ reject, timer }) => {
      clearTimeout(timer);
      reject(error('UNAVAILABLE', 'The editor connection is closed.'));
    });
    pending.clear();
    subscribers.clear();
    window.removeEventListener('pagehide', dispose);
  }

  const request = (action, details = {}) => {
    if (disposed) return Promise.reject(error('UNAVAILABLE', 'The editor connection is closed.'));
    if (!capabilities.editor) return Promise.reject(error('UNSUPPORTED', 'This host does not support editor extensions.'));
    sequence += 1;
    const requestId = `editor-${sequence}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(error('TIMEOUT', `The editor did not respond to ${action}.`));
      }, ['uploadImage', 'pickAsset', 'openBlockLibrary'].includes(action) ? 300000 : REQUEST_TIMEOUT);
      pending.set(requestId, { resolve, reject, timer });
      try {
        port.postMessage({ action, requestId, details });
      } catch (err) {
        pending.delete(requestId);
        clearTimeout(timer);
        reject(error('INVALID_CHANGE', err.message));
      }
    });
  };

  receive = ({ data }) => {
    if (data?.action === 'editorSnapshot') {
      subscribers.get(data.subscriptionId)?.(data.details);
      return;
    }
    if (data?.action === 'editorClosed') {
      dispose();
      return;
    }
    const entry = pending.get(data?.requestId);
    if (!entry || data.action !== 'editorResponse') return;
    pending.delete(data.requestId);
    clearTimeout(entry.timer);
    if (data.error) entry.reject(error(data.error.code, data.error.message));
    else entry.resolve(data.details);
  };

  port.addEventListener('message', receive);
  port.start();
  window.addEventListener('pagehide', dispose, { once: true });

  return {
    subscribeDocument: async (callback) => {
      if (typeof callback !== 'function') throw new TypeError('A snapshot callback is required.');
      sequence += 1;
      const subscriptionId = `subscription-${sequence}`;
      subscribers.set(subscriptionId, callback);
      try {
        await request('subscribeDocument', { subscriptionId });
      } catch (err) {
        subscribers.delete(subscriptionId);
        throw err;
      }
      return async () => {
        subscribers.delete(subscriptionId);
        if (!disposed) await request('unsubscribeDocument', { subscriptionId });
      };
    },
    applyChanges: (details) => request('applyChanges', details),
    describeBlock: (details) => request('describeBlock', details),
    selectTarget: (details) => request('selectTarget', details),
    uploadImage: (details) => request('uploadImage', details),
    pickAsset: (details) => request('pickAsset', details),
    openBlockLibrary: (details) => request('openBlockLibrary', details),
    getEditorConfig: () => request('getEditorConfig'),
  };
}
