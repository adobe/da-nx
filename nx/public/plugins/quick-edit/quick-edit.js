import { setupContentEditableListeners, setupImageDropListeners, updateImageSrc, handleImageError } from './src/images.js';
import { setEditorState } from './src/prose.js';
import { setCursors } from './src/cursors.js';
import { pollConnection, setupActions, getFirstSheet } from './src/utils.js';
import { handleBlockLibraryResponse } from './src/advanced/quick-edit-library.js';

import { loadStyle } from "../../../scripts/nexter.js";

const nx = `${new URL(import.meta.url).origin}/nx`;
await loadStyle(`${nx}/public/plugins/quick-edit/quick-edit.css`);

const QUICK_EDIT_ID = 'quick-edit-iframe';

async function setBody(body, ctx) {
  const doc = new DOMParser().parseFromString(body, 'text/html');
  document.body.innerHTML = doc.body.innerHTML;
  await ctx.loadPage();
  setupContentEditableListeners(ctx);
  // Pass document.body since we no longer have a <main> wrapper
  setupImageDropListeners(ctx, document.body);
  setupActions(ctx);

  const quickEditType = getFirstSheet(ctx.config).find((item) => item.key === 'quick-edit')?.value;
  if (quickEditType === 'advanced') {
    const { default: setupAdvancedMode } = await import('./src/advanced/setup.js');
    setupAdvancedMode(ctx);
  }
}

function scrollToPosition(position) {
  // Find the element with data-prose-index closest to this position
  // We look for both exact match and the closest one before this position
  const elements = document.querySelectorAll('[data-prose-index]');
  let targetElement = null;
  let closestDiff = Infinity;

  elements.forEach((el) => {
    const elPosition = parseInt(el.getAttribute('data-prose-index'), 10);
    const diff = Math.abs(position - elPosition);
    
    // Prefer elements at or before the cursor position
    if (elPosition <= position && diff < closestDiff) {
      closestDiff = diff;
      targetElement = el;
    }
  });

  // Also check for block-level elements with data-block-index
  const blockElements = document.querySelectorAll('[data-block-index]');
  blockElements.forEach((el) => {
    const elPosition = parseInt(el.getAttribute('data-block-index'), 10);
    const diff = Math.abs(position - elPosition);
    
    if (elPosition <= position && diff < closestDiff) {
      closestDiff = diff;
      targetElement = el;
    }
  });

  if (targetElement) {
    // Calculate header height dynamically and set scroll-margin
    const header = document.querySelector('header');
    const headerHeight = header ? header.offsetHeight : 0;
    const additionalPadding = 20;

    // Set scroll-margin-top dynamically
    targetElement.style.scrollMarginTop = `${headerHeight + additionalPadding}px`;

    // Scroll the element into view
    targetElement.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
  }
}

function setupSideBySideMode(ctx) {
  const quickEditType = getFirstSheet(ctx.config).find((item) => item.key === 'quick-edit')?.value;
  console.log('quickEditType', quickEditType);
  console.log('ctx.config', ctx.config);
  
  if (quickEditType === 'side-by-side') {
    const iframe = document.getElementById(QUICK_EDIT_ID);
    if (iframe) {
      iframe.style.visibility = 'visible';
      document.documentElement.classList.add('qe-side-by-side-mode');
      // Tell the portal to enable side-by-side mode and load editor styles
      ctx.port.postMessage({ type: 'enable-side-by-side' });
    }
  }
}

function onMessage(e, ctx) {
  if (e.data.type === 'ready') {
    ctx.initialized = true;
    ctx.config = e.data.config;
    setupSideBySideMode(ctx);
  } else if (e.data.type === 'set-body') {
    setBody(e.data.body, ctx);
  } else if (e.data.type === 'set-editor-state') {
    const { editorState, cursorOffset } = e.data;
    setEditorState(cursorOffset, editorState, ctx);
  } else if (e.data.type === 'set-cursors') {
    setCursors(e.data.body, ctx);
  } else if (e.data.type === 'scroll-to-position') {
    scrollToPosition(e.data.position);
  } else if (e.data.type === 'update-image-src') {
    const { newSrc, originalSrc } = e.data;
    updateImageSrc(originalSrc, newSrc);
  } else if (e.data.type === 'image-error') {
    handleImageError(e.data.error);
  } else if (e.data.type === 'block-library-response') {
    handleBlockLibraryResponse(e.data);
  }
} 

function handleLoad(target, config, location, ctx) {
  const CHANNEL = new MessageChannel();
  const { port1, port2 } = CHANNEL;
  ctx.port = port1;

  target.contentWindow.postMessage({ init: config, location }, "*", [port2]);
  ctx.port.onmessage = (e) => onMessage(e, ctx);
}

function getQuickEditSrc() {
  const { search } = window.location;
  const ref = new URLSearchParams(search).get('quick-edit');
  if (!ref) return 'https://da.live/plugins/quick-edit';
  return `https://main--da-live--adobe.aem.live/plugins/quick-edit?nx=${ref}`;
}

export default async function loadQuickEdit({ detail: payload }, loadPage) {
  if (document.getElementById(QUICK_EDIT_ID)) return;

  const ctx = {
    initialized: false,
    loadPage,
  };

  const iframe = document.createElement("iframe");
  iframe.id = QUICK_EDIT_ID;
  iframe.src = getQuickEditSrc();
  iframe.allow = "local-network-access *; clipboard-write *";

  pollConnection(ctx, () => {
    handleLoad(iframe, payload.config, payload.location, ctx);
  });
  document.documentElement.append(iframe);
  iframe.style.visibility = 'hidden';
}
