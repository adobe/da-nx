/**
 * Shell module for handling iframe-based content loading and communication
 * @module shell
 */

import { loadIms } from '../../utils/ims.js';

const IMS_DETAILS = await loadIms();
const CHANNEL = new MessageChannel();

/**
 * Parses the current URL to extract view, organization, repository, reference, path, search, and hash information
 * @returns {Object} Object containing parsed URL components
 * @property {string} view - The view type (defaults to 'fullscreen')
 * @property {string} org - Organization name from URL
 * @property {string} repo - Repository name from URL
 * @property {string} ref - Reference/branch name (defaults to 'main')
 * @property {string} path - Path components joined with '/'
 * @property {string} search - Original search query string
 * @property {string} hash - Original hash fragment from the URL
 */
function getParts() {
  // Get path parts
  const view = 'fullscreen';
  const { pathname, search, hash } = window.location;
  const pathSplit = pathname.split('/');
  pathSplit.splice(0, 2);
  const [org, repo, ...path] = pathSplit;
  const ref = new URLSearchParams(search).get('ref') || 'main';
  return {
    view,
    org,
    repo,
    ref,
    path: path.join('/'),
    search,
    hash,
  };
}

/**
 * Constructs the appropriate URL based on the reference type, forwarding parent
 * search params to the iframe
 * @returns {string} The constructed URL for the iframe
 */
function getUrl() {
  const { org, repo, ref, path, search, hash } = getParts();
  if (ref === 'local') return `http://localhost:3000/${path}.html${search}${hash}`;
  return `https://${ref}--${repo}--${org}.aem.live/${path}.html${search}${hash}`;
}

/**
 * Handles iframe load event and sets up message channel communication
 * @param {Object} event - Load event object
 * @param {HTMLIFrameElement} event.target - The loaded iframe element
 */
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

/**
 * Initializes the shell by creating, configuring, and appending an iframe
 * @param {HTMLElement} el - The container element for the iframe
 */
export default function init(el) {
  if (!document.querySelector('header')) document.body.classList.add('no-shell');
  const iframe = document.createElement('iframe');
  iframe.setAttribute('allow', 'clipboard-write *');
  iframe.addEventListener('load', handleLoad);
  iframe.src = getUrl();
  el.append(iframe);
}
