import { setImsDetails, daFetch } from './daFetch.js';

let port2;

function handleSdkResponse({ port, action, details }) {
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
      port.postMessage({ action, requestId, ...(details === undefined ? {} : { details }) });
    } catch {
      finish({ ok: false, error: 'disconnected' });
    }
  });
}

export function createHostActions({ port, capabilities = {} }) {
  const subscribers = new Set();
  let lastHtml;
  let lastBlockIndex;
  let lastEditable;

  const onLiveMessage = ({ data }) => {
    if (data?.action !== 'liveDocument' && data?.action !== 'liveSelection') return;
    const { selection } = data;
    if (!selection || (selection.blockIndex !== null
      && (!Number.isInteger(selection.blockIndex) || selection.blockIndex < 0))) return;
    if (data.action === 'liveDocument') {
      if (typeof data.html !== 'string') return;
      lastHtml = data.html;
      lastEditable = typeof data.editable === 'boolean' ? data.editable : undefined;
    } else if (lastHtml === undefined) return;
    lastBlockIndex = selection.blockIndex;
    subscribers.forEach(({ callback }) => callback({
      html: lastHtml,
      selection: { blockIndex: lastBlockIndex },
      ...(lastEditable === undefined ? {} : { editable: lastEditable }),
    }));
  };

  return {
    sendHTML: (html, options = {}) => {
      if (typeof html !== 'string' || (options.replace !== undefined && typeof options.replace !== 'boolean')) {
        throw new TypeError('invalid-html');
      }
      if (!options.replace) {
        port.postMessage({ action: 'sendHTML', details: html });
        return undefined;
      }
      if (capabilities.sendHTMLReplace !== 1) {
        return Promise.resolve({ ok: false, error: 'unsupported' });
      }
      return handleSdkResponse({
        port,
        action: 'sendHTML',
        details: {
          html,
          replace: true,
          ...(options.expected === undefined ? {} : { expected: options.expected }),
        },
      }).then((result) => {
        if (result.ok && (typeof result.html !== 'string' || !result.selection
          || (result.selection.blockIndex !== null
            && (!Number.isSafeInteger(result.selection.blockIndex)
              || result.selection.blockIndex < 0)))) {
          return { ok: false, error: 'invalid-response' };
        }
        return result;
      });
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
    subscribeLiveDocument: (callback) => {
      if (typeof callback !== 'function') throw new TypeError('callback must be a function');
      const subscriber = { callback };
      if (!subscribers.size) {
        port.addEventListener('message', onLiveMessage);
        try {
          port.start();
          port.postMessage({ action: 'subscribeLiveDocument' });
        } catch (error) {
          port.removeEventListener('message', onLiveMessage);
          throw error;
        }
      }
      subscribers.add(subscriber);
      if (lastHtml !== undefined) {
        callback({
          html: lastHtml,
          selection: { blockIndex: lastBlockIndex },
          ...(lastEditable === undefined ? {} : { editable: lastEditable }),
        });
      }
      return () => {
        if (!subscribers.delete(subscriber) || subscribers.size) return;
        port.removeEventListener('message', onLiveMessage);
        lastHtml = undefined;
        lastBlockIndex = undefined;
        lastEditable = undefined;
        try {
          port.postMessage({ action: 'unsubscribeLiveDocument' });
        } catch {
          // The host may have closed the port; local subscription state is already cleared.
        }
      };
    },
  };
}

function sendText(text) {
  port2.postMessage({ action: 'sendText', details: text });
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
        setHref,
        setHash,
        closeLibrary,
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
