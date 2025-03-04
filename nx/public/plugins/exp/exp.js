import { loadStyle } from '../../../scripts/nexter.js';
import { makeDraggable, calcOrigin, calcUrl, getExpDetails } from './utils.js';

// Automatic developer mode.
const { searchParams, origin, pathname, hash } = new URL(window.location.href);
const branch = searchParams.get('nx') || 'main';

export const EXP_SRC = branch === 'local' || origin.includes('localhost')
  ? 'https://main--da-live--adobe.aem.live/plugins/exp?nx=local'
  : 'https://da.live/plugins/exp';

const MAIN_SELECTOR = 'aem-sidekick-exp';

let initialized;

async function init(port1) {
  initialized = true;
  const projOrigin = calcOrigin();
  const url = calcUrl();
  const experiment = getExpDetails();

  port1.postMessage({ page: { origin: projOrigin, url }, experiment });
}

function reloadPage(params) {
  if (params?.length) {
    params.forEach((param) => {
      searchParams.set(param.key, param.value);
    });
  }
  // Cache bust the page
  searchParams.set('daexperiment', Date.now().toString().slice(-4));
  window.location = `${origin}${pathname}?${searchParams.toString()}${hash}`;
}

function previewExp(data) {
  const params = [{ key: 'experiment', value: data.preview }];
  reloadPage(params);
}

function pollConnection(action) {
  initialized = false;
  let count = 0;
  const interval = setInterval(() => {
    count += 1;
    if (initialized || count > 20) {
      clearInterval(interval);
      return;
    }
    action?.();
  }, 500);
}

function handleLoad({ target }) {
  const CHANNEL = new MessageChannel();
  const { port1, port2 } = CHANNEL;

  target.contentWindow.postMessage({ ready: true }, '*', [port2]);

  // We keep port 1 to receive messages
  port1.onmessage = (e) => {
    if (e.data.ready) init(port1);
    if (e.data.reload) reloadPage();
    if (e.data.preview) previewExp(e.data);
    if (e.data.reset) {
      port1.close(); port2.close();
      pollConnection(() => {
        handleLoad({ target });
      });
    }
  };
}

export default async function runExp() {
  await loadStyle(`${import.meta.url.replace('js', 'css')}`);

  // If the palette exists, hide it.
  let palette = document.querySelector(`#${MAIN_SELECTOR}`);
  if (palette) {
    palette.classList.toggle('is-visible');
    return;
  }

  // Create new palette
  palette = document.createElement('div');
  palette.classList.add('is-visible');
  palette.id = MAIN_SELECTOR;

  // Handle
  const handle = document.createElement('div');
  handle.id = `${MAIN_SELECTOR}-handle`;

  // Iframe
  const iframe = document.createElement('iframe');
  iframe.src = EXP_SRC;
  iframe.allow = 'clipboard-write *';

  // Append
  palette.append(handle, iframe);

  pollConnection(() => {
    handleLoad({ target: iframe });
  });

  makeDraggable(palette);
  document.body.append(palette);
}

// Side-effect to run on first import
runExp();
