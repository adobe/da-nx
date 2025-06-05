import { loadIms } from '../../utils/ims.js';

const IMS_DETAILS = await loadIms();
const CHANNEL = new MessageChannel();

function getParts() {
  // Get path parts
  const view = 'fullscreen';
  const { pathname, search } = window.location;
  const pathSplit = pathname.split('/');
  pathSplit.splice(0, 2);
  const [org, repo, ...path] = pathSplit;
  const ref = new URLSearchParams(search).get('ref') || 'main';
  return {
    view, org, repo, ref, path: path.join('/'), search,
  };
}

function getUrl() {
  const { org, repo, ref, path, search } = getParts();
  if (ref === 'local') return `http://localhost:3000/${path}.html?${search}`;
  return `https://${ref}--${repo}--${org}.aem.live/${path}.html?${search}`;
}

function handleLoad({ target }) {
  CHANNEL.port1.onmessage = (e) => {
    if (e.data.action === 'setTitle') {
      document.title = e.data.details;
    }
  };

  const message = {
    ready: true,
    token: IMS_DETAILS.accessToken?.token,
    context: getParts(),
  };

  setTimeout(() => {
    target.contentWindow.postMessage(message, '*', [CHANNEL.port2]);
  }, 750);
}

export default function init(el) {
  if (!document.querySelector('header')) document.body.classList.add('no-shell');
  const iframe = document.createElement('iframe');
  iframe.setAttribute('allow', 'clipboard-write *');
  iframe.addEventListener('load', handleLoad);
  iframe.src = getUrl();
  el.append(iframe);
}
