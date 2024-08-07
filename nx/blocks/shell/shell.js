import { loadIms } from '../../utils/ims.js';

const IMS_DETAILS = await loadIms();
const CHANNEL = new MessageChannel();

function getParts() {
  // Get path parts
  const { pathname } = window.location;
  const pathSplit = pathname.split('/');
  pathSplit.splice(0, 2);
  const [org, repo, ref, ...path] = pathSplit;
  return { org, repo, ref, path: path.join('/') };
}

function getUrl() {
  const { org, repo, ref, path } = getParts();
  if (ref === 'local') return `http://localhost:3000/${path}.html`;
  return `https://${ref}--${repo}--${org}.hlx.live/${path}.html`;
}

function handleLoad({ target }) {
  setTimeout(() => {
    const message = { ready: true, token: IMS_DETAILS.accessToken.token, project: getParts() };
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
