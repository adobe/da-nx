import { setImsDetails, daFetch } from './daFetch.js';

let port2;

function handleSdkResponse({ port, action }) {
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
    try {
      port.addEventListener('message', pending.listener);
      port.start();
      port.postMessage({ action, requestId });
    } catch {
      finish({ ok: false, error: 'disconnected' });
    }
  });
}

export function createHostActions({ port }) {
  return {
    showPanel: (name, options) => {
      port.postMessage({
        action: 'showPanel',
        details: options === undefined ? name : { id: name, options },
      });
    },
    onPanelOptions: (callback) => {
      const listener = ({ data }) => {
        if (data?.action === 'panelOptions') callback(data.details);
      };
      port.addEventListener('message', listener);
      port.start();
      return () => port.removeEventListener('message', listener);
    },
    openComparison: (options = {}) => {
      const { candidate, baseline } = options ?? {};
      if (!['document', 'preview'].includes(candidate) || baseline !== 'live') {
        throw new TypeError('invalid-comparison');
      }
      port.postMessage({ action: 'openComparison', details: { candidate, baseline } });
    },
    closeComparison: () => { port.postMessage({ action: 'closeComparison' }); },
    saveDocument: () => handleSdkResponse({ port, action: 'saveDocument' }),
    getSelection: async () => {
      const result = await handleSdkResponse({ port, action: 'getSelection' });
      if (result.ok && typeof result.html === 'string') return result.html;
      // Rejects with a string, as getSelection always has.
      const reason = !result.ok && typeof result.error === 'string' ? result.error : 'invalid-response';
      throw reason;
    },
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
        ...createHostActions({ port: port2 }),
        daFetch,
        sendText,
        sendHTML,
        setHref,
        setHash,
        closeLibrary,
        setPrompt,
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
