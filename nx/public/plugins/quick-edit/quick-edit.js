import { setupContentEditableListeners, setupImageDropListeners, updateImageSrc, handleImageError } from './src/images.js';
import { setEditorState } from './src/prose.js';
import { setCursors } from './src/cursors.js';
import { pollConnection, setupActions } from './src/utils.js';
import { MESSAGE_TYPES } from '../../../utils/message-types.js';
import { restoreBlockIndices } from './src/dom-index.js';
import {
  setupNodeSelection,
  setSelectedNode,
  getSelectedNode,
} from './src/selection.js';

import { loadStyle } from '../../../scripts/nexter.js';

const nx = `${new URL(import.meta.url).origin}/nx`;
await loadStyle(`${nx}/public/plugins/quick-edit/quick-edit.css`);

const QUICK_EDIT_ID = 'quick-edit-iframe';

/**
 * When set, the preview page is using exp-workspace as controller;
 * do not create the portal iframe.
 */
let parentControllerPort = null;

async function setBody(body, ctx) {
  const doc = new DOMParser().parseFromString(body, 'text/html');
  document.body.innerHTML = doc.body.innerHTML;
  await ctx.loadPage();
  restoreBlockIndices(doc, document);
  setupNodeSelection(ctx);
  setSelectedNode(getSelectedNode());
  setupContentEditableListeners(ctx);
  if (!ctx.readOnly) {
    setupImageDropListeners(ctx, document.body.querySelector('main'));
  }
  if (!parentControllerPort) {
    setupActions(ctx);
  }
}

function handleReady(e, ctx) {
  ctx.initialized = true;
}

function onMessage(e, ctx) {
  const { type, payload = {} } = e.data ?? {};

  if (type === MESSAGE_TYPES.READY) {
    handleReady(e, ctx);
  } else if (type === MESSAGE_TYPES.SET_BODY) {
    setBody(payload.body, ctx);
  } else if (type === MESSAGE_TYPES.SET_EDITOR_STATE) {
    const { editorState, cursorOffset } = payload;
    setEditorState(cursorOffset, editorState, ctx);
  } else if (type === MESSAGE_TYPES.SET_CURSORS) {
    setCursors(payload.cursors, ctx);
  } else if (type === MESSAGE_TYPES.UPDATE_IMAGE_SRC
    || type === MESSAGE_TYPES.IMAGE_ERROR) {
    if (payload.error) {
      handleImageError(payload.error);
    } else {
      const { newSrc, originalSrc } = payload;
      updateImageSrc(originalSrc, newSrc);
    }
  } else if (type === MESSAGE_TYPES.SET_SELECTED_NODE) {
    setSelectedNode(payload.node, document, { scrollIntoView: payload.scrollIntoView });
  }
}

// Disables link clicks. When the page is embedded, it must not navigate away.
function blockLinkNavigation() {
  document.addEventListener('click', (e) => {
    if (e.target.closest('a')) e.preventDefault();
  }, true);
}

function setupParentController(loadPage) {
  const listener = (e) => {
    const isInit = e.data?.type === MESSAGE_TYPES.INIT;
    if (e.source !== window.parent || !isInit || !e.ports?.length) return;

    const port = e.ports[0];
    parentControllerPort = port;
    blockLinkNavigation();

    const config = e.data?.payload?.config ?? e.data?.init;

    const ctx = {
      initialized: true,
      loadPage,
      port,
      readOnly: config?.canWrite !== true,
    };
    port.onmessage = (ev) => onMessage(ev, ctx);
    port.postMessage({ type: MESSAGE_TYPES.READY });

    window.removeEventListener('message', listener);
  };
  window.addEventListener('message', listener);
}

function checkDomain() {
  const currentUrl = new URL(window.location.href);
  if (currentUrl.origin.endsWith('.aem.page')) {
    const newOrigin = currentUrl.origin.replace('.aem.page', '.preview.da.live');
    const params = new URLSearchParams(currentUrl.search);
    if (!params.has('quick-edit')) params.set('quick-edit', 'on');
    const search = params.toString() ? `?${params.toString()}` : '';
    const newHref = `${newOrigin}${currentUrl.pathname}${search}${currentUrl.hash}`;
    window.location.replace(newHref);
  }
}

function handleLoad(target, config, location, ctx) {
  const CHANNEL = new MessageChannel();
  const { port1, port2 } = CHANNEL;
  ctx.port = port1;

  target.contentWindow.postMessage({
    type: MESSAGE_TYPES.INIT, payload: { config, location },
  }, '*', [port2]);
  ctx.port.onmessage = (e) => onMessage(e, ctx);
}

function getQuickEditSrc() {
  const { search } = window.location;
  const ref = new URLSearchParams(search).get('quick-edit');
  if (!ref || ref === 'on') return 'https://da.live/plugins/quick-edit';
  return `https://main--da-live--adobe.aem.live/plugins/quick-edit?nx=${ref}`;
}

function setupIframeController({ detail: payload }, loadPage) {
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

export default async function loadQuickEdit(payload, loadPage) {
  if (document.getElementById(QUICK_EDIT_ID)) return;
  if (parentControllerPort != null) return;

  const params = new URLSearchParams(window.location.search);
  if (params.get('controller') === 'parent') {
    setupParentController(loadPage);
  } else {
    setupIframeController(payload, loadPage);
  }
}
