import { loadStyle } from '../../../scripts/nexter.js';
import { makeDraggable, calcOrigin, calcUrl, getExpDetails } from './utils.js';

const EXP_SRC = 'https://main--da-live--adobe.aem.live/plugins/exp?nx=local';
const MAIN_SELECTOR = 'aem-sidekick-exp';
const CHANNEL = new MessageChannel();

const { port1, port2 } = CHANNEL;

async function init() {
  const origin = calcOrigin();
  const url = calcUrl();
  const experiment = getExpDetails();

  port1.postMessage({ page: { origin, url }, experiment });
}

function reloadPage() {
  const { origin, pathname, searchParams, hash } = new URL(window.location.href);
  // Cache bust the page
  searchParams.set('daexperiment', Date.now());
  window.location = `${origin}${pathname}?${searchParams.toString()}${hash}`;
}

function handleLoad({ target }) {
  port1.onmessage = (e) => {
    if (e.data.ready) init(target);
    if (e.data.reload) reloadPage();
  };

  setTimeout(() => {
    target.contentWindow.postMessage({ ready: true }, '*', [port2]);
  }, 500);
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

  // Title
  const handle = document.createElement('div');
  handle.id = `${MAIN_SELECTOR}-handle`;

  // Iframe
  const iframe = document.createElement('iframe');
  iframe.src = EXP_SRC;
  iframe.allow = 'clipboard-write *';
  iframe.addEventListener('load', handleLoad);

  // Append
  palette.append(handle, iframe);

  makeDraggable(palette);
  document.body.append(palette);
}

// Side-effect to run on first import
runExp();
