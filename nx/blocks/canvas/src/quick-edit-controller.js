/**
 * Quick-edit controller: portal-side protocol and instrumented HTML.
 * Used when exp-workspace doc editor drives the WYSIWYG preview iframe.
 * Mirrors da-nx blocks/quick-edit-portal render, prose2aem, images, and handlePreview.
 */
/* eslint-disable import/no-unresolved */
import { TextSelection, yUndo, yRedo } from 'da-y-wrapper';
import { DA_ORIGIN } from 'https://da.live/blocks/shared/constants.js';
import prose2aem from 'https://da.live/blocks/shared/prose2aem.js';
/* eslint-enable import/no-unresolved */

const EDITABLES = [
  { selector: 'h1', nodeName: 'H1' },
  { selector: 'h2', nodeName: 'H2' },
  { selector: 'h3', nodeName: 'H3' },
  { selector: 'h4', nodeName: 'H4' },
  { selector: 'h5', nodeName: 'H5' },
  { selector: 'h6', nodeName: 'H6' },
  { selector: 'p', nodeName: 'P' },
  { selector: 'ol', nodeName: 'OL' },
  { selector: 'ul', nodeName: 'UL' },
];
const EDITABLE_SELECTORS = EDITABLES.map((edit) => edit.selector).join(', ');

export function getInstrumentedHTML(view) {
  const editorClone = view.dom.cloneNode(true);

  const originalElements = view.dom.querySelectorAll(EDITABLE_SELECTORS);
  const clonedElements = editorClone.querySelectorAll(EDITABLE_SELECTORS);

  originalElements.forEach((originalElement, index) => {
    if (clonedElements[index]) {
      try {
        const editableElementStartPos = view.posAtDOM(originalElement, 0);
        clonedElements[index].setAttribute('data-prose-index', editableElementStartPos);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Could not find position for element:', e);
      }
    }
  });

  // Block instrumentation (same as da-nx qe-advanced): wrap blocks (e.g. tables), add a
  // sentinel with data-prose-index, then after serialization move it to wrapper as data-block-index
  const originalTables = view.dom.querySelectorAll('table');
  const clonedTables = editorClone.querySelectorAll('table');
  clonedTables.forEach((table, index) => {
    const div = document.createElement('div');
    div.className = 'tableWrapper';
    table.insertAdjacentElement('afterend', div);
    div.append(table);
    const blockMarker = document.createElement('div');
    blockMarker.className = 'block-marker';
    try {
      const position = view.posAtDOM(originalTables[index], 0);
      blockMarker.setAttribute('data-prose-index', position);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Could not find position for table block:', e);
    }
    div.insertAdjacentElement('beforebegin', blockMarker);
  });

  const remoteCursors = editorClone.querySelectorAll('.ProseMirror-yjs-cursor');

  remoteCursors.forEach((remoteCursor) => {
    let highestEditable = null;
    let current = remoteCursor.parentElement;

    while (current) {
      if (current.hasAttribute('data-prose-index')) {
        highestEditable = current;
      }
      current = current.parentElement;
    }

    if (highestEditable) {
      highestEditable.setAttribute('data-cursor-remote', remoteCursor.innerText);
      highestEditable.setAttribute('data-cursor-remote-color', remoteCursor.style['border-color']);
    }
  });

  // Serialize clone to HTML, then move block-marker index onto wrapper as data-block-index
  // (same pattern as da-nx qe-advanced: getInstrumentedHTML in prose2aem.js).
  let htmlString = prose2aem(editorClone, true, false, true);
  htmlString = htmlString.replace(
    /<div class="block-marker" data-prose-index="(\d+)"><\/div>\s*<div([^>]*?)>/gi,
    (match, proseIndex, divAttributes) => `<div${divAttributes} data-block-index="${proseIndex}">`,
  );
  return htmlString;
}

export function updateDocument(ctx) {
  if (ctx.suppressRerender) return;
  const body = getInstrumentedHTML(ctx.view);
  ctx.port.postMessage({ type: 'set-body', body });
}

export function updateCursors(ctx) {
  const body = getInstrumentedHTML(ctx.view);
  ctx.port.postMessage({ type: 'set-cursors', body });
}

export function updateState(data, ctx) {
  const { view } = ctx;
  const node = view.state.schema.nodeFromJSON(data.node);
  const pos = view.state.doc.resolve(data.cursorOffset);
  const docPos = view.state.selection.from;

  const nodeStart = pos.before(pos.depth);
  const nodeEnd = pos.after(pos.depth);

  const { tr } = view.state;
  tr.replaceWith(nodeStart, nodeEnd, node);
  tr.setSelection(TextSelection.create(tr.doc, docPos));

  ctx.suppressRerender = true;
  view.dispatch(tr);
  ctx.suppressRerender = false;
}

export function getEditor(data, ctx) {
  if (ctx.suppressRerender) return;
  const { view } = ctx;
  const { cursorOffset } = data;

  const pos = view.state.doc.resolve(cursorOffset);
  const before = pos.before(pos.depth);
  const beforePos = view.state.doc.resolve(before);
  const nodeAtBefore = beforePos.nodeAfter;
  ctx.port.postMessage({ type: 'set-editor-state', editorState: nodeAtBefore.toJSON(), cursorOffset: before + 1 });
}

export function handleCursorMove({ cursorOffset, textCursorOffset }, ctx) {
  const { view, wsProvider } = ctx;
  if (!view || !wsProvider) return;

  if (cursorOffset == null || textCursorOffset == null) {
    view.hasFocus = () => false;
    wsProvider.awareness.setLocalStateField('cursor', null);
    return;
  }

  const { state } = view;
  const position = cursorOffset + textCursorOffset;

  try {
    if (position < 0 || position > state.doc.content.size) {
      // eslint-disable-next-line no-console
      console.warn('Invalid cursor position:', position);
      return;
    }

    view.hasFocus = () => true;

    const { tr } = state;
    tr.setSelection(TextSelection.create(state.doc, position));

    ctx.suppressRerender = true;
    view.dispatch(tr);
    ctx.suppressRerender = false;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error moving cursor:', error);
  }
}

export function handleUndoRedo(data, ctx) {
  const { action } = data;
  const view = ctx?.view ?? window.view;
  if (!view) return;
  if (action === 'undo') {
    yUndo(view.state);
  } else if (action === 'redo') {
    yRedo(view.state);
  }
}

function updateImageInDocument(view, originalSrc, newSrc) {
  if (!view) return false;

  const { state } = view;
  const { tr } = state;
  let updated = false;

  state.doc.descendants((node, pos) => {
    if (node.type.name === 'image') {
      const currentSrc = node.attrs.src;
      let isMatch = currentSrc === originalSrc;

      if (!isMatch) {
        try {
          const currentUrl = new URL(currentSrc, window.location.href);
          const originalUrl = new URL(originalSrc, window.location.href);
          isMatch = currentUrl.pathname === originalUrl.pathname;
        } catch {
          isMatch = currentSrc.includes(originalSrc) || originalSrc.includes(currentSrc);
        }
      }

      if (isMatch) {
        const newAttrs = { ...node.attrs, src: newSrc };
        tr.setNodeMarkup(pos, null, newAttrs);
        updated = true;
      }
    }
  });

  if (updated) {
    view.dispatch(tr);
  }

  return updated;
}

function dataUrlToBlob(dataUrl) {
  const [header, base64Data] = dataUrl.split(',');
  const mimeMatch = header.match(/:(.*?);/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const byteString = atob(base64Data);
  const arrayBuffer = new ArrayBuffer(byteString.length);
  const uint8Array = new Uint8Array(arrayBuffer);
  for (let i = 0; i < byteString.length; i += 1) {
    uint8Array[i] = byteString.charCodeAt(i);
  }
  return new Blob([uint8Array], { type: mimeType });
}

function getPageName(currentPath) {
  if (currentPath.endsWith('/')) return `${currentPath.replace(/^\//, '')}index`;
  return currentPath.replace(/^\//, '').replace(/\.html$/, '');
}

export async function handleImageReplace({ imageData, fileName, originalSrc }, ctx) {
  ctx.suppressRerender = true;

  try {
    // eslint-disable-next-line no-console
    console.log('handleImageReplace', fileName, originalSrc);

    const blob = dataUrlToBlob(imageData);

    const pageName = getPageName(ctx.path);
    const parentPath = ctx.path === '/' ? '' : ctx.path.replace(/\/[^/]+$/, '');

    // Same upload path and URL as da-nx quick-edit-portal/src/images.js
    const uploadPath = `${parentPath}/.${pageName}/${fileName}`;
    const uploadUrl = `${DA_ORIGIN}/source/${ctx.owner}/${ctx.repo}${uploadPath}`;

    const tokenPromise = typeof ctx.getToken === 'function' ? ctx.getToken() : null;
    const token = tokenPromise != null && typeof tokenPromise?.then === 'function'
      ? await tokenPromise
      : tokenPromise;
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const formData = new FormData();
    formData.append('data', blob, fileName);

    const resp = await fetch(uploadUrl, {
      method: 'PUT',
      body: formData,
      headers,
    });

    if (!resp.ok) {
      ctx.port.postMessage({
        type: 'image-error',
        error: `Upload failed with status ${resp.status}`,
        originalSrc,
      });
      return;
    }

    // Same as da-nx: AEM delivery URL for the uploaded image
    const newSrc = `https://content.da.live/${ctx.owner}/${ctx.repo}${uploadPath}`;

    updateImageInDocument(ctx.view, originalSrc, newSrc);

    ctx.port.postMessage({
      type: 'update-image-src',
      newSrc,
      originalSrc,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error replacing image:', error);
    ctx.port.postMessage({
      type: 'image-error',
      error: error.message,
      originalSrc,
    });
  } finally {
    setTimeout(() => {
      ctx.suppressRerender = false;
    }, 500);
  }
}

export async function handlePreview(ctx) {
  const path = ctx.path.endsWith('/') ? `${ctx.path}index` : `${ctx.path}`;
  const url = `https://admin.hlx.page/preview/${ctx.owner}/${ctx.repo}/main${path}`;
  const token = typeof ctx.getToken === 'function' ? await Promise.resolve(ctx.getToken()) : null;
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const resp = await fetch(url, { method: 'POST', headers });

  if (!resp.ok) {
    ctx.port.postMessage({ type: 'preview', ok: false, error: `Failed to preview: ${resp.statusText}` });
  } else {
    ctx.port.postMessage({ type: 'preview', ok: true });
  }
}

/**
 * Block name from a ProseMirror table (first row, first cell text). Matches prose2aem block naming.
 * @param {import('prosemirror-model').Node} tableNode
 * @returns {string}
 */
function getTableBlockName(tableNode) {
  const firstRow = tableNode.firstChild;
  if (!firstRow) return '';
  const firstCell = firstRow.firstChild;
  if (!firstCell) return '';
  const raw = firstCell.textContent?.trim() ?? '';
  const match = raw.match(/^([a-zA-Z0-9_\s-]+)(?:\s*\([^)]*\))?$/);
  return match ? match[1].trim().toLowerCase() : raw.toLowerCase();
}

/**
 * Collect start positions of all block nodes (tables) in document order, excluding the root
 * "metadata" block (it is stripped by prose2aem in live preview so it has no corresponding
 * block in the outline HTML).
 * @param {import('prosemirror-view').EditorView} view
 * @returns {number[]}
 */
export function getBlockPositions(view) {
  if (!view?.state?.doc) return [];
  const positions = [];
  const { doc } = view.state;
  doc.descendants((node, pos) => {
    if (node.type.name === 'table') {
      const blockName = getTableBlockName(node);
      if (blockName === 'metadata') return;
      positions.push(pos);
    }
  });
  return positions;
}

/**
 * Move the block (table) at fromIndex to before the block at toIndex.
 * Indices are the position before each table (from getBlockPositions), so the table is nodeAfter.
 * @param {{ fromIndex: number, toIndex: number }} data - ProseMirror positions
 * @param {{ view: import('prosemirror-view').EditorView }} ctx
 */
export function moveBlockAt(data, ctx) {
  const { fromIndex, toIndex } = data;
  const { view } = ctx || {};
  if (!view?.state) return;

  const { tr, doc } = view.state;

  try {
    const $fromPos = doc.resolve(fromIndex);
    const tableNode = $fromPos.nodeAfter;
    if (!tableNode?.type || tableNode.type.name !== 'table') return;

    const fromStart = $fromPos.pos;
    const fromEnd = fromStart + tableNode.nodeSize;

    const $toPos = doc.resolve(toIndex);
    if ($toPos.nodeAfter?.type?.name !== 'table') return;
    const toStart = $toPos.pos;

    tr.delete(fromStart, fromEnd);
    const insertPos = toStart > fromStart ? toStart - tableNode.nodeSize : toStart;
    tr.insert(insertPos, tableNode);

    view.dispatch(tr.scrollIntoView());
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[quick-edit-controller] moveBlockAt failed', e?.message);
  }
}

export function handleSelectionChange({ anchor, head }, ctx) {
  const { view } = ctx;
  if (!view) return;
  const { state } = view;
  try {
    const a = Math.max(0, Math.min(anchor, state.doc.content.size));
    const h = Math.max(0, Math.min(head, state.doc.content.size));
    const { tr } = state;
    tr.setSelection(TextSelection.create(state.doc, a, h));
    ctx.suppressRerender = true;
    view.dispatch(tr);
    ctx.suppressRerender = false;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[quick-edit-controller] handleSelectionChange failed', e?.message);
  }
}

/**
 * Create the onmessage handler for the controller port.
 * @param {MessageEvent} e
 * @param {object} ctx - { view, wsProvider, port, suppressRerender, owner, repo, path, getToken }
 */
export function createControllerOnMessage(ctx) {
  return function onMessage(e) {
    if (e.data.type === 'cursor-move') {
      handleCursorMove(e.data, ctx);
    } else if (e.data.type === 'reload') {
      updateDocument(ctx);
    } else if (e.data.type === 'image-replace') {
      handleImageReplace(e.data, ctx);
    } else if (e.data.type === 'get-editor') {
      getEditor(e.data, ctx);
    } else if (e.data.type === 'node-update') {
      updateState(e.data, ctx);
    } else if (e.data.type === 'history') {
      handleUndoRedo(e.data, ctx);
    } else if (e.data.type === 'preview') {
      handlePreview(ctx);
    } else if (e.data.type === 'move-block') {
      moveBlockAt(e.data, ctx);
    } else if (e.data.type === 'quick-edit-add-to-chat') {
      ctx.onAddToChat?.(e.data.payload);
    } else if (e.data.type === 'selection-change') {
      handleSelectionChange(e.data, ctx);
    }
  };
}
