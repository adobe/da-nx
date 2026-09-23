import { setImsDetails, daFetch } from './daFetch.js';

let port2;

export function createHostActions({ port, capabilities = {} }) {
  const request = (action, capability, details) => {
    if (capabilities[capability] !== 1) return Promise.resolve({ ok: false, error: 'unsupported' });
    return new Promise((resolve) => {
      const requestId = crypto.randomUUID();
      const pending = {};
      const finish = (result) => {
        clearTimeout(pending.timer);
        port.removeEventListener('message', pending.listener);
        resolve(result);
      };
      pending.listener = ({ data }) => {
        if (data?.action !== 'sdkResponse' || data.requestId !== requestId) return;
        finish(typeof data.result?.ok === 'boolean'
          ? data.result : { ok: false, error: 'invalid-response' });
      };
      pending.timer = setTimeout(() => finish({ ok: false, error: 'timeout' }), 15000);
      port.addEventListener('message', pending.listener);
      port.start();
      try {
        port.postMessage({ action, details, requestId });
      } catch {
        finish({ ok: false, error: 'disconnected' });
      }
    });
  };
  return {
    openComparison: ({ candidate, baseline } = {}) => {
      if (!['document', 'preview'].includes(candidate) || baseline !== 'live') {
        return Promise.resolve({ ok: false, error: 'invalid-comparison' });
      }
      return request('openComparison', 'comparison', { candidate, baseline });
    },
    closeComparison: () => request('closeComparison', 'comparison'),
    saveDocument: () => request('saveDocument', 'saveDocument'),
  };
}

function sendText(text) {
  port2.postMessage({ action: 'sendText', details: text });
}

function sendHTML(text) {
  port2.postMessage({ action: 'sendHTML', details: text });
}

function setTitle(text) {
  port2.postMessage({ action: 'setTitle', details: text });
}

function setHref(href) {
  port2.postMessage({ action: 'setHref', details: href });
}

function setHash(hash) {
  port2.postMessage({ action: 'setHash', details: hash });
}

function closeLibrary() {
  port2.postMessage({ action: 'closeLibrary' });
}

function setPrompt(text, { autoSend = false } = {}) {
  port2.postMessage({ action: 'setPrompt', details: { text, autoSend } });
}

function showPanel(name) {
  port2.postMessage({ action: 'showPanel', details: name });
}

function getSelection() {
  return new Promise((resolve, reject) => {
    const listener = (e) => {
      window.removeEventListener('message', listener);

      if (e.data.action === 'sendSelection') {
        resolve(e.data.details);
      }

      if (e.data.action === 'error') {
        reject(e.data.details);
      }
    };
    window.addEventListener('message', listener);
    port2.postMessage({ action: 'getSelection' });
  });
}

const DA_SDK = (() => new Promise((resolve) => {
  let initialized = false;
  window.addEventListener('message', (e) => {
    if (!e.data) return;

    // The parent's init message carries a transferred MessagePort and
    // `ready: true`. Filtering on both lets us ignore stray messages from
    // browser extensions, devtools content scripts, IMS, analytics, etc.,
    // any of which can otherwise win the race in the ~750ms before the
    // parent posts and resolve the SDK with a context-less payload.
    if (!initialized && e.data.ready && e.ports?.length) {
      initialized = true;
      [port2] = e.ports;
      setTitle(document.title);

      if (e.data.token) {
        setImsDetails(e.data.token);
      }

      const actions = {
        ...createHostActions({ port: port2, capabilities: e.data.capabilities }),
        daFetch,
        sendText,
        sendHTML,
        setHref,
        setHash,
        closeLibrary,
        getSelection,
        setPrompt,
        showPanel,
      };

      resolve({ ...e.data, actions });
      return;
    }

    // Subsequent messages (e.g., token refresh) — keep IMS details current
    // but do not re-resolve or rebind port2.
    if (initialized && e.data.token) {
      setImsDetails(e.data.token);
    }
  });
}))();

export default DA_SDK;
