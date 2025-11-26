/**
 * Shell module for handling iframe-based content loading and communication
 * @module shell
 */

import { loadIms } from '../../utils/ims.js';

const IMS_DETAILS = await loadIms();
const CHANNEL = new MessageChannel();

await import('../../public/sl/components.js');

const TRUSTED_ORGS = ['adobe'];
const TRUSTED_APPS = [
  'https://main--storefront-tools--adobe-commerce.aem.live/tools/site-creator/site-creator.html'
];
 
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

function createIframe(el) {
  if (!document.querySelector('header')) document.body.classList.add('no-shell');
  const iframe = document.createElement('iframe');
  iframe.setAttribute('allow', 'clipboard-write *');
  iframe.addEventListener('load', handleLoad);
  iframe.src = getUrl();
  el.append(iframe);
}

function isAppTrusted(org, repo, ref) {
  const url = getUrl();
  if (TRUSTED_ORGS.includes(org)) return true;
  if (TRUSTED_APPS.some(trustedApp => url.startsWith(trustedApp))) return true;
  
  const trustedApps = JSON.parse(localStorage.getItem('trustedApps') || '{}');
  const appKey = `${org}/${repo}/${ref}`;
  return trustedApps[appKey] === true;
}

function trustApp(org, repo, ref) {
  const trustedApps = JSON.parse(localStorage.getItem('trustedApps') || '{}');
  const appKey = `${org}/${repo}/${ref}`;
  trustedApps[appKey] = true;
  localStorage.setItem('trustedApps', JSON.stringify(trustedApps));
}

function showDisclaimer(el) {
  const { org, repo, ref, path } = getParts();
  const appName = path.split('/').pop();
  const devWarning = ref !== 'main' 
    ? `<p><b>Note:</b> You are accessing a development version of the app on branch <b>${ref}</b>.` 
    : '';
  const disclaimer = document.createElement('div');
  disclaimer.classList.add('disclaimer');
  disclaimer.innerHTML = `
    <sl-dialog>
      <div class="nx-dialog">
        <h2>Warning</h2>
        <div>
        </div>
        <p>You are about to access an app named <b>${appName}</b> hosted by <b>${org}/${repo}</b>.<br>
        Make sure you trust the host <b>${org}/${repo}</b>. Their app may take any action on your behalf, including <b>deleting content</b> you have access to.</p>
        ${devWarning}
        <p><b>Are you sure you want to continue?</b></p>
        <div class="nx-button-group">
          <sl-button class="negative outline" name="continue">Continue</sl-button>
          <sl-button name="cancel">Cancel</sl-button>
        </div>
      </div>
    </sl-dialog>
  `;
  document.body.appendChild(disclaimer);
  disclaimer.querySelector('sl-button[name="continue"]').addEventListener('click', () => {
    trustApp(org, repo, ref);
    createIframe(el);
    disclaimer.remove();
  });
  disclaimer.querySelector('sl-button[name="cancel"]').addEventListener('click', () => {
    disclaimer.remove();
    window.location = '/';
  });
  disclaimer.querySelector('sl-dialog').showModal();
  setTimeout(() => {
    disclaimer.querySelector('sl-button[name="cancel"]').focus();
  }, 400);
}

/**
 * Initializes the shell by showing a disclaimer, and if approved, creating an iframe
 * @param {HTMLElement} el - The container element for the iframe
 */
export default function init(el) {
  const { org, repo, ref } = getParts();
  const url = getUrl();

  if (isAppTrusted(org, repo, ref)) {
    createIframe(el);
  } else {
    showDisclaimer(el);
  }
}
