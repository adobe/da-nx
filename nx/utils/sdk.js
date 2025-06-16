import { setImsDetails, daFetch } from './daFetch.js';

let port2;

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

const DA_SDK = (() => new Promise((resolve) => {
  window.addEventListener('message', (e) => {
    if (e.data) {
      if (e.data.ready) {
        [port2] = e.ports;
        setTitle(document.title);
      }

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
      };

      resolve({ ...e.data, actions });
    }
  });
}))();

export default DA_SDK;
