import { setupContentEditableListeners, setupImageDropListeners, updateImageSrc, handleImageError } from './src/images.js';
import { setEditorState } from './src/prose.js';
import { setCursors } from './src/cursors.js';
import { pollConnection, setupActions } from './src/utils.js';
import { MESSAGE_TYPES } from '../../../utils/message-types.js';
import { restoreBlockIndices } from './src/dom-index.js';
import {
  setCommentMarkers,
  applyCommentMarkers,
  setupCommentShortcut,
} from './src/comments.js';
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
  applyCommentMarkers(ctx);
  setupNodeSelection(ctx);
  setSelectedNode(getSelectedNode());
  setupContentEditableListeners(ctx);
  setupImageDropListeners(ctx, document.body.querySelector('main'));
  if (!parentControllerPort) {
    setupActions(ctx);
  }
}

function handleReady(e, ctx) {
  ctx.initialized = true;
}

function onMessage(e, ctx) {
  // Prefer nested `payload` fields, falling back to the deprecated flat top-level
  // ones — da-live currently sends both (see blocks/canvas/editor-utils/editor-utils.js
  // and blocks/canvas/ew-editor-wysiwyg/utils/image.js).
  const data = e.data?.payload ? { ...e.data, ...e.data.payload } : e.data;

  if (data.type === MESSAGE_TYPES.READY) {
    handleReady(e, ctx);
  } else if (data.type === MESSAGE_TYPES.SET_BODY) {
    setBody(data.body, ctx);
  } else if (data.type === MESSAGE_TYPES.SET_EDITOR_STATE) {
    const { editorState, cursorOffset } = data;
    setEditorState(cursorOffset, editorState, ctx);
  } else if (data.type === MESSAGE_TYPES.SET_CURSORS) {
    setCursors(data.cursors, ctx);
  } else if (data.type === MESSAGE_TYPES.UPDATE_IMAGE_SRC
    || data.type === MESSAGE_TYPES.IMAGE_ERROR) {
    // Both are replies to the same image-replace request; `error` is only ever present
    // (a truthy message) on the failure case, so its presence is the outcome signal —
    // no separate flag needed. Once the two legacy type names are retired, this becomes
    // a single `type === IMAGE_REPLACE` check with the same `if (data.error)` branch.
    if (data.error) {
      handleImageError(data.error);
    } else {
      const { newSrc, originalSrc } = data;
      updateImageSrc(originalSrc, newSrc);
    }
  } else if (data.type === MESSAGE_TYPES.SET_COMMENT_MARKERS) {
    setCommentMarkers(data, ctx);
  } else if (data.type === MESSAGE_TYPES.SET_SELECTED_NODE) {
    setSelectedNode(data.node, document, { scrollIntoView: data.scrollIntoView });
  }
}

function setupParentController(loadPage) {
  const listener = (e) => {
    // @deprecated `init` presence check — prefer `type === MESSAGE_TYPES.INIT` (da-live
    // sends both).
    const isInit = e.data?.type === MESSAGE_TYPES.INIT || e.data?.[MESSAGE_TYPES.INIT] != null;
    if (e.source !== window.parent || !isInit || !e.ports?.length) return;

    const port = e.ports[0];
    parentControllerPort = port;

    const ctx = {
      initialized: true,
      loadPage,
      port,
    };
    port.onmessage = (ev) => onMessage(ev, ctx);
    // @deprecated flat `ready` — prefer `type: MESSAGE_TYPES.READY` (added alongside for
    // callers that already migrated their ack check).
    port.postMessage({ [MESSAGE_TYPES.READY]: true, type: MESSAGE_TYPES.READY });
    setupCommentShortcut(ctx);

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

  // @deprecated flat `init`/`location` — prefer `type`/`payload` (added alongside for
  // callers that already migrated their INIT check).
  target.contentWindow.postMessage({
    [MESSAGE_TYPES.INIT]: config, location, type: MESSAGE_TYPES.INIT, payload: { config, location },
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
