let port2;

function sendText(text) {
  port2.postMessage({ action: 'sendText', details: text });
}

function closeLibrary() {
  port2.postMessage({ action: 'closeLibrary' });
}

const DA_SDK = (() => new Promise((resolve) => {
  window.addEventListener('message', (e) => {
    if (e.data) {
      if (e.data.ready) [port2] = e.ports;
      resolve({ ...e.data, actions: { sendText, closeLibrary } });
    }
  });
}))();

export default DA_SDK;
