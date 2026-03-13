import { setupContentEditableListeners, setupImageDropListeners, updateImageSrc, handleImageError } from './src/images.js';
import { setEditorState } from './src/prose.js';
import { setCursors } from './src/cursors.js';
import { pollConnection, setupActions } from './src/utils.js';

import { loadStyle } from '../../../scripts/nexter.js';

const nx = `${new URL(import.meta.url).origin}/nx`;
await loadStyle(`${nx}/public/plugins/quick-edit/quick-edit.css`);

const QUICK_EDIT_ID = 'quick-edit-iframe';

/** When set, the preview page is using exp-workspace as controller; do not create the portal iframe. */
let parentControllerPort = null;

function setupParentControllerListener() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('controller') !== 'parent') return;

  const listener = (e) => {
    if (e.source !== window.parent || e.data?.init == null || !e.ports?.length) return;

    const port = e.ports[0];
    parentControllerPort = port;

    const loadPage = typeof window.__quickEditLoadPage === 'function' ? window.__quickEditLoadPage : () => {};
    const ctx = {
      initialized: true,
      loadPage,
      port,
    };
    port.onmessage = (ev) => onMessage(ev, ctx);
    port.postMessage({ ready: true });

    window.removeEventListener('message', listener);
  };
  window.addEventListener('message', listener);
}
setupParentControllerListener();

async function setBody(body, ctx) {
  const doc = new DOMParser().parseFromString(body, 'text/html');
  document.body.innerHTML = doc.body.innerHTML;
  await ctx.loadPage();
  setupContentEditableListeners(ctx);
  setupImageDropListeners(ctx, document.body.querySelector('main'));
  setupActions(ctx);
}

function handleReady(e, ctx) {
  ctx.initialized = true;
}

function checkDomain() {
  const currentUrl = new URL(window.location.href);
  if (currentUrl.origin.endsWith('.aem.page')) {
    const newOrigin = currentUrl.origin.replace('.aem.page', '.preview.da.live');
    const newHref = `${newOrigin}${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
    window.location.replace(newHref);
  }
}

function onMessage(e, ctx) {
  if (e.data.type === 'ready') {
    handleReady(e, ctx);
  } else if (e.data.type === 'set-body') {
    setBody(e.data.body, ctx);
  } else if (e.data.type === 'set-editor-state') {
    const { editorState, cursorOffset } = e.data;
    setEditorState(cursorOffset, editorState, ctx);
  } else if (e.data.type === 'set-cursors') {
    setCursors(e.data.body, ctx);
  } else if (e.data.type === 'update-image-src') {
    const { newSrc, originalSrc } = e.data;
    updateImageSrc(originalSrc, newSrc);
  } else if (e.data.type === 'image-error') {
    handleImageError(e.data.error);
  }
}

function handleLoad(target, config, location, ctx) {
  const CHANNEL = new MessageChannel();
  const { port1, port2 } = CHANNEL;
  ctx.port = port1;

  target.contentWindow.postMessage({ init: config, location }, '*', [port2]);
  ctx.port.onmessage = (e) => onMessage(e, ctx);
}

function getQuickEditSrc() {
  const { search } = window.location;
  const ref = new URLSearchParams(search).get('quick-edit');
  if (!ref || ref === 'on') return 'https://da.live/plugins/quick-edit';
  return `https://main--da-live--adobe.aem.live/plugins/quick-edit?nx=${ref}`;
}

export default async function loadQuickEdit({ detail: payload }, loadPage) {
  if (document.getElementById(QUICK_EDIT_ID)) return;
  if (parentControllerPort != null) return;

  const params = new URLSearchParams(window.location.search);
  if (params.get('controller') === 'parent') return;

  checkDomain();

  const ctx = {
    initialized: false,
    loadPage,
  };

  const iframe = document.createElement('iframe');
  iframe.id = QUICK_EDIT_ID;
  iframe.src = getQuickEditSrc();
  iframe.allow = 'local-network-access *; clipboard-write *';

  pollConnection(ctx, () => {
    handleLoad(iframe, payload.config, payload.location, ctx);
  });
  document.documentElement.append(iframe);
  iframe.style.visibility = 'hidden';
}
