import { setupContentEditableListeners, setupImageDropListeners, updateImageSrc, handleImageError } from './src/images.js';
import { setEditorState } from './src/prose.js';
import { setCursors } from './src/cursors.js';
import { pollConnection, setupActions } from './src/utils.js';

import { loadStyle } from '../../../scripts/nexter.js';

const nx = `${new URL(import.meta.url).origin}/nx`;
await loadStyle(`${nx}/public/plugins/quick-edit/quick-edit.css`);

const QUICK_EDIT_ID = 'quick-edit-iframe';

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
  ctx.lockdownImages = e.data.lockdownImages;
  if (ctx.lockdownImages) {
    const currentUrl = new URL(window.location.href);
    if (currentUrl.origin.endsWith('.aem.page')) {
      const newOrigin = currentUrl.origin.replace('.aem.page', '.preview.da.live');
      const newHref = `${newOrigin}${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
      window.location.replace(newHref);
    }
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
