import { loadIms } from '../../utils/ims.js';

const DA_ADMIN_ENVS = {
  local: 'http://localhost:8787',
  stage: 'https://stage-admin.da.live',
  prod: 'https://admin.da.live',
};

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

function getDaEnv(key) {
  const { href } = window.location;
  const query = new URL(href).searchParams.get(key);
  if (query && query === 'reset') {
    localStorage.removeItem(key);
  } else if (query) {
    localStorage.setItem(key, query);
  }
  return DA_ADMIN_ENVS[localStorage.getItem(key) || 'prod'];
}

function getUrl() {
  const { org, repo, ref, path } = getParts();
  if (ref === 'local') return `http://localhost:3000/${path}.html`;
  return `https://${ref}--${repo}--${org}.hlx.live/${path}.html`;
}

function handleLoad({ target }) {
  CHANNEL.port1.onmessage = (e) => { console.log(e.data); };

  const message = {
    ready: true,
    token: IMS_DETAILS.accessToken.token,
    project: getParts(),
    daAdmin: getDaEnv('da-admin'),
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
