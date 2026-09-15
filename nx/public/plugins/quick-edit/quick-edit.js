import { setupContentEditableListeners, setupImageDropListeners, updateImageSrc, handleImageError } from './src/images.js';
import { setEditorState } from './src/prose.js';
import { setCursors } from './src/cursors.js';
import { pollConnection, setupActions } from './src/utils.js';
import { MESSAGE_TYPES } from '../../../utils/message-types.js';
import { restoreBlockIndices } from './src/dom-index.js';
import {
  captureScrollAnchor,
  restoreScrollAnchor,
  persistScrollAnchor,
  consumeScrollAnchor,
} from './src/scroll-anchor.js';
import {
  getQuickEditPortalSrc,
  getQuickEditPreviewSrc,
  getStandaloneConfig,
  isStandaloneShell,
  relayControllerMessage,
} from './src/standalone.js';
import {
  setCommentMarkers,
  applyCommentMarkers,
  setupCommentShortcut,
  scrollToProseIndex,
} from './src/comments/index.js';
import {
  setupNodeSelection,
  setSelectedNode,
  getSelectedNode,
} from './src/selection.js';

import { loadStyle } from '../../../scripts/nexter.js';

const nx = `${new URL(import.meta.url).origin}/nx`;
await loadStyle(`${nx}/public/plugins/quick-edit/quick-edit.css`);

const QUICK_EDIT_ID = 'quick-edit-iframe';
const QUICK_EDIT_PREVIEW_ID = 'quick-edit-preview-iframe';

/**
 * When set, the preview page is using exp-workspace as controller;
 * do not create the portal iframe.
 */
let parentControllerPort = null;

async function setBody(body, ctx) {
  const anchor = consumeScrollAnchor() ?? captureScrollAnchor();
  const doc = new DOMParser().parseFromString(body, 'text/html');
  if (ctx.reloadMode === 'decorateMain') {
    // TODO script.js snippet to trigger this optimized version:
    // ;(() => {
    //   const params = new URLSearchParams(window.location.search);
    //   if (!params.has('quick-edit')) return;

    //   document.body.classList.add('quick-edit');

    //   const payload = (() => {
    //     try {
    //       const q = params.get('quick-edit');
    //       return q && q !== 'on' ? JSON.parse(decodeURIComponent(q)) : {};
    //     } catch { return {}; }
    //   })();

    //   import('https://da.live/nx/public/plugins/quick-edit/quick-edit.js')
    //     .then(({ default: loadQuickEdit }) =>
    //        loadQuickEdit({ ...payload, reloadMode: 'decorateMain', }, (body) => {
    //       const main = body.querySelector('main');
    //       decorateMain(main);
    //       loadSections(main);
    //     }))
    //     .catch((e) => { console.error('[quick-edit] failed to load plugin', e); });
    // })();
    const staleMain = document.body.querySelector('main');
    staleMain.innerHTML = doc.body.querySelector('main').innerHTML;
    // TODO optionally this supports *.preview.da.live/*?quick-edit=on&controller=parent
    // to repond with an empty main like
    // ...
    // <body>
    // <header></header>
    // <main><div></div></main>
    // <footer></footer>
    // </body>
    // ...
  } else {
    document.body.innerHTML = doc.body.innerHTML;
  }
  await ctx.loadPage(document);
  restoreBlockIndices(doc, document);
  applyCommentMarkers(ctx);
  setupNodeSelection(ctx);
  setSelectedNode(getSelectedNode());
  setupContentEditableListeners(ctx);
  if (!ctx.readOnly) {
    setupImageDropListeners(ctx, document.body.querySelector('main'));
  }
  if (!parentControllerPort) {
    setupActions(ctx);
  }
  restoreScrollAnchor(anchor);
}

function handleReady(e, ctx) {
  ctx.initialized = true;
}

const METADATA_RELOAD_DELAY = 3000;
let metadataReloadDebounce = null;

// Reload only after metadata changes settle; each change resets the timer.
function reloadPreview() {
  clearTimeout(metadataReloadDebounce);
  metadataReloadDebounce = setTimeout(() => {
    persistScrollAnchor();
    window.location.reload();
  }, METADATA_RELOAD_DELAY);
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
  } else if (type === MESSAGE_TYPES.IMAGE_REPLACE) {
    if (payload.error) {
      handleImageError(payload.error);
    } else {
      const { newSrc, originalSrc } = payload;
      updateImageSrc(originalSrc, newSrc);
    }
  } else if (type === MESSAGE_TYPES.SET_COMMENT_MARKERS) {
    setCommentMarkers(payload, ctx);
  } else if (type === MESSAGE_TYPES.SCROLL_TO_POS) {
    scrollToProseIndex(payload.proseIndex);
  } else if (type === MESSAGE_TYPES.SET_SELECTED_NODE) {
    setSelectedNode(payload.node, document, { scrollIntoView: payload.scrollIntoView });
  } else if (type === MESSAGE_TYPES.METADATA_CHANGE) {
    // Metadata affects head/scripts, so a full reload is needed to re-decorate the page.
    reloadPreview();
  }
}

// Disables link clicks. When the page is embedded, it must not navigate away.
function blockLinkNavigation() {
  document.addEventListener('click', (e) => {
    if (e.target.closest('a')) e.preventDefault();
  }, true);
}

function setupParentController(payload, loadPage) {
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
      reloadMode: payload.reloadMode,
    };
    port.onmessage = (ev) => onMessage(ev, ctx);
    port.postMessage({ type: MESSAGE_TYPES.READY });
    setupCommentShortcut(ctx);

    window.removeEventListener('message', listener);
  };
  window.addEventListener('message', listener);
}

function handleLoad(target, config, location, ctx, handler = onMessage) {
  const CHANNEL = new MessageChannel();
  const { port1, port2 } = CHANNEL;
  ctx.port?.close();
  ctx.port = port1;

  target.contentWindow.postMessage({
    type: MESSAGE_TYPES.INIT, payload: { config, location },
  }, '*', [port2]);
  port1.onmessage = (e) => {
    if (ctx.port === port1) handler(e, ctx);
  };
}

function setupIframeController(payload, loadPage) {
  const ctx = {
    initialized: false,
    loadPage,
    reloadMode: payload.reloadMode,
  };

  const iframe = document.createElement('iframe');
  iframe.id = QUICK_EDIT_ID;
  iframe.src = getQuickEditPortalSrc(window.location.href);
  iframe.allow = 'local-network-access *; clipboard-write *';

  pollConnection(ctx, () => {
    handleLoad(iframe, payload.config, payload.location, ctx);
  });
  document.documentElement.append(iframe);
  iframe.style.visibility = 'hidden';
}

function createPreviewIframe() {
  const iframe = document.createElement('iframe');
  iframe.id = QUICK_EDIT_PREVIEW_ID;
  iframe.src = getQuickEditPreviewSrc(window.location.href);
  iframe.allow = 'local-network-access *; clipboard-write *';
  Object.assign(iframe.style, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    border: '0',
    zIndex: '9998',
  });
  document.documentElement.append(iframe);
  return iframe;
}

function setupStandaloneEditor(portal, payload) {
  const preview = createPreviewIframe();
  const config = getStandaloneConfig(payload.config);
  const shellCtx = {
    actionsReady: false,
  };
  const portalCtx = {
    initialized: false,
    queue: [],
  };
  const previewCtx = {
    initialized: false,
    queue: [],
  };

  const handleControllerMessage = (source, target) => (e) => {
    relayControllerMessage({ data: e.data, source, target });
    if (portalCtx.initialized && previewCtx.initialized && !shellCtx.actionsReady) {
      shellCtx.actionsReady = true;
      setupActions(portalCtx);
    }
  };

  pollConnection(portalCtx, () => {
    handleLoad(
      portal,
      config,
      payload.location,
      portalCtx,
      handleControllerMessage(portalCtx, previewCtx),
    );
  });
  pollConnection(previewCtx, () => {
    handleLoad(
      preview,
      config,
      payload.location,
      previewCtx,
      handleControllerMessage(previewCtx, portalCtx),
    );
  });
}

function setupStandaloneShell(payload) {
  const ctx = {
    initialized: false,
    editorStarted: false,
  };

  const portal = document.createElement('iframe');
  portal.id = QUICK_EDIT_ID;
  portal.src = getQuickEditPortalSrc(window.location.href, { bootstrap: true });
  portal.allow = 'local-network-access *; clipboard-write *';
  portal.style.visibility = 'hidden';
  document.documentElement.append(portal);

  pollConnection(ctx, () => {
    handleLoad(portal, payload.config, payload.location, ctx, (e, bootstrapCtx) => {
      if (e.data?.type !== MESSAGE_TYPES.READY) return;
      bootstrapCtx.initialized = true;
      if (bootstrapCtx.editorStarted) return;
      bootstrapCtx.editorStarted = true;
      bootstrapCtx.port?.close();
      setupStandaloneEditor(portal, payload);
    });
  });
}

export default async function loadQuickEdit(payload, loadPage) {
  if (document.getElementById(QUICK_EDIT_ID)) return;
  if (parentControllerPort != null) return;

  const detail = payload?.detail ?? payload ?? {};
  const params = new URLSearchParams(window.location.search);
  if (params.get('controller') === 'parent') {
    setupParentController(detail, loadPage);
  } else if (isStandaloneShell(window.location.href)) {
    setupStandaloneShell(detail);
  } else {
    setupIframeController(detail, loadPage);
  }
}
