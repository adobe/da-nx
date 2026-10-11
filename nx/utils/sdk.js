import { setImsDetails, daFetch } from './daFetch.js';

let port2;
let lastSelection;
const selectionListeners = new Set();

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

function onSelectionChange(callback) {
  selectionListeners.add(callback);
  if (lastSelection) callback(lastSelection);
  return () => selectionListeners.delete(callback);
}

function replaceLink(html, { href } = {}) {
  return new Promise((resolve, reject) => {
    const listener = (e) => {
      if (e.source !== window.parent || e.data?.action !== 'replaceLinkResult') return;
      window.removeEventListener('message', listener);
      if (e.data.details?.ok) {
        resolve();
      } else {
        reject(new Error(e.data.details?.error || 'The link was not replaced'));
      }
    };
    window.addEventListener('message', listener);
    port2.postMessage({ action: 'replaceLink', details: { html, href } });
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
        daFetch,
        sendText,
        sendHTML,
        setHref,
        setHash,
        closeLibrary,
        getSelection,
        setPrompt,
        showPanel,
        onSelectionChange,
        replaceLink,
      };

      resolve({ ...e.data, actions });
      return;
    }

    if (initialized && e.data.action === 'selectionChange' && e.source === window.parent) {
      lastSelection = e.data.details;
      selectionListeners.forEach((callback) => callback(lastSelection));
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
