import { loadIms, handleSignIn } from "../../utils/ims.js";
import { daFetch } from "../../utils/daFetch.js";
import { DA_ORIGIN } from "../../public/utils/constants.js";
import { default as prose2aem } from "https://main--da-live--adobe.aem.live/blocks/shared/prose2aem.js?ref=local";
import { TextSelection } from "https://main--da-live--adobe.aem.live/deps/da-y-wrapper/dist/index.js";

let port;
let currentOwner;
let currentRepo;
let currentPath;

let prose;
let proseEl;
let wsProvider;

// Flag to suppress rerenderPage during internal updates
let suppressRerender = false;

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

async function getToken() {
  const ims = await loadIms(true);
  if (ims.anonymous) return null;
  const { token } = ims.accessToken;
  return token;
}

// TODO move to a utils
export function getInstrumentedHTML(view) {
  // Clone the editor first so we don't modify the real DOM
  const editorClone = view.dom.cloneNode(true);

  // Add data-cursor attribute to all h1 elements with their starting position
  const originalElements = view.dom.querySelectorAll(EDITABLE_SELECTORS);
  const clonedElements = editorClone.querySelectorAll(EDITABLE_SELECTORS);

  originalElements.forEach((originalElement, index) => {
    if (clonedElements[index]) {
      try {
        // Get the ProseMirror position at the start of this editable element
        const editableElementStartPos = view.posAtDOM(originalElement, 0);
        clonedElements[index].setAttribute('data-cursor', editableElementStartPos);
      } catch (e) {
        // If we can't find the position, skip this element
        // eslint-disable-next-line no-console
        console.warn('Could not find position for element:', e);
      }
    }
  });

  editorClone.querySelectorAll('table').forEach((table) => {
    const div = document.createElement('div');
    div.className = 'tableWrapper';
    table.insertAdjacentElement('afterend', div);
    div.append(table);
  });

  const remoteCursors = editorClone.querySelectorAll('.ProseMirror-yjs-cursor');

  remoteCursors.forEach((remoteCursor) => {
    // Find the highest-level ancestor with data-cursor attribute
    let highestEditable = null;
    let current = remoteCursor.parentElement;
    
    while (current) {
      if (current.hasAttribute('data-cursor')) {
        highestEditable = current;
      }
      current = current.parentElement;
    }
    
    if (highestEditable) {
      highestEditable.setAttribute('data-cursor-remote', remoteCursor.innerText);
      highestEditable.setAttribute('data-cursor-remote-color', remoteCursor.style['border-color']);
    }
  });

  // Convert to an HTML string using prose2aem
  return prose2aem(editorClone, true);
}

async function checkPermissions(sourceUrl) {
  const token = await getToken();
  const resp = await fetch(sourceUrl, {
    method: "HEAD",
    headers: { Authorization: `Bearer ${token}` },
  });

  // If child actions header is present, use it.
  // This is a hint as to what can be done with the children.
  if (resp.headers?.get("x-da-child-actions")) {
    resp.permissions = resp.headers
      .get("x-da-child-actions")
      .split("=")
      .pop()
      .split(",");
    return resp;
  }

  // Use the self actions hint if child actions are not present.
  if (resp.headers?.get("x-da-actions")) {
    resp.permissions = resp.headers
      ?.get("x-da-actions")
      ?.split("=")
      .pop()
      .split(",");
    return resp;
  }

  // Support legacy admin.role.all
  resp.permissions = ["read", "write"];
  return resp;
}

function handleCursorMove({ cursorOffset, textCursorOffset }) {
  if (!window.view || !wsProvider) return;

  if (cursorOffset == null || textCursorOffset == null) {
    // Clear the cursor from awareness when no valid cursor position is provided
    window.view.hasFocus = () => false;
    wsProvider.awareness.setLocalStateField('cursor', null);
    return;
  }

  const { state } = window.view;
  const position = cursorOffset + textCursorOffset;

  try {
    // Ensure the position is valid within the document
    if (position < 0 || position > state.doc.content.size) {
      console.warn('Invalid cursor position:', position);
      return;
    }

    // TODO: this is a hack. The cursor plugin expects focus. We should write our own version of the cursor plugin long term.
    window.view.hasFocus = () => true;

    // Create a transaction to update the selection
    const tr = state.tr;

    // Set the selection to the calculated position
    tr.setSelection(TextSelection.create(state.doc, position));

    // Dispatch the transaction to update the editor state
    suppressRerender = true;
    window.view.dispatch(tr);
    suppressRerender = false;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Error moving cursor:", error);
  }
}

/**
 * Update image src in the ProseMirror document
 * @param {string} originalSrc - The original image source to find
 * @param {string} newSrc - The new image source to set
 */
function updateImageInDocument(originalSrc, newSrc) {
  if (!window.view) return false;

  const { state } = window.view;
  const { tr } = state;
  let updated = false;

  // Traverse the document to find image nodes
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'image') {
      const currentSrc = node.attrs.src;

      // Check if this is the image we're looking for
      // Compare by exact match or by pathname
      let isMatch = currentSrc === originalSrc;

      if (!isMatch) {
        try {
          const currentUrl = new URL(currentSrc, window.location.href);
          const originalUrl = new URL(originalSrc, window.location.href);
          isMatch = currentUrl.pathname === originalUrl.pathname;
        } catch {
          // If URL parsing fails, try simple includes check
          isMatch = currentSrc.includes(originalSrc) || originalSrc.includes(currentSrc);
        }
      }

      if (isMatch) {
        // Update the image node with new src
        const newAttrs = { ...node.attrs, src: newSrc };
        tr.setNodeMarkup(pos, null, newAttrs);
        updated = true;
      }
    }
  });

  if (updated) {
    window.view.dispatch(tr);
  }

  return updated;
}

/**
 * Convert a base64 data URL to a Blob
 * @param {string} dataUrl - The base64 data URL
 * @returns {Blob} The converted Blob
 */
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

/**
 * Get the page name from the current path (without extension)
 * @returns {string} The page name
 */
function getPageName() {
  if (currentPath.endsWith('/')) return `${currentPath.replace(/^\//, '')}index`;
  // Remove leading slash and .html extension if present
  return currentPath.replace(/^\//, '').replace(/\.html$/, '');
}

/**
 * Handle image replacement from quick-edit
 * @param {Object} data - The image data from quick-edit
 */
async function handleImageReplace({ imageData, fileName, originalSrc }) {
  // Suppress rerender for the entire duration of image replacement
  suppressRerender = true;

  try {
    // eslint-disable-next-line no-console
    console.log('handleImageReplace', fileName, originalSrc);
    // Convert base64 to Blob
    const blob = dataUrlToBlob(imageData);

    // Get the page name for the media folder
    const pageName = getPageName();
    const parentPath = currentPath === '/' ? '' : currentPath.replace(/\/[^/]+$/, '');

    // Construct the upload URL: /source/{owner}/{repo}{parent}/.{pageName}/{fileName}
    const uploadPath = `${parentPath}/.${pageName}/${fileName}`;
    const uploadUrl = `${DA_ORIGIN}/source/${currentOwner}/${currentRepo}${uploadPath}`;

    // Upload the image
    const formData = new FormData();
    formData.append('data', blob, fileName);
    const opts = { method: 'PUT', body: formData };
    const resp = await daFetch(uploadUrl, opts);

    if (!resp.ok) {
      port.postMessage({
        set: 'image-error',
        error: `Upload failed with status ${resp.status}`,
        originalSrc,
      });
      return;
    }

    // Construct the new image URL (AEM delivery URL)
    const newSrc = `https://content.da.live/${currentOwner}/${currentRepo}${uploadPath}`;

    // Update the ProseMirror document with the new image src
    updateImageInDocument(originalSrc, newSrc);

    // Send back the new URL to update the quick-edit view
    port.postMessage({
      set: 'image',
      newSrc,
      originalSrc,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error replacing image:', error);
    port.postMessage({
      set: 'image-error',
      error: error.message,
      originalSrc,
    });
  } finally {
    // Reset the suppress flag after a delay to catch any async callbacks
    setTimeout(() => {
      suppressRerender = false;
    }, 500);
  }
}

function getEditor(data) {
  if (suppressRerender) { return; }
  const { cursorOffset } = data;

  const pos = window.view.state.doc.resolve(cursorOffset);
  const before = pos.before(pos.depth);
  const beforePos = window.view.state.doc.resolve(before);
  const nodeAtBefore = beforePos.nodeAfter;
  port.postMessage({ set: 'editor', editor: nodeAtBefore.toJSON(), cursorOffset: before + 1 });
}

function updateState(data) {
  const node = window.view.state.schema.nodeFromJSON(data.node);
  const pos = window.view.state.doc.resolve(data.cursorOffset);
  const docPos = window.view.state.selection.from;
  
  // Calculate the range that covers the entire node
  const nodeStart = pos.before(pos.depth);
  const nodeEnd = pos.after(pos.depth);

  // Replace the entire node
  const tr = window.view.state.tr;
  tr.replaceWith(nodeStart, nodeEnd, node);
  
  // fix the selection
  tr.setSelection(TextSelection.create(tr.doc, docPos));

  suppressRerender = true;
  window.view.dispatch(tr);
  suppressRerender = false;
}

function onMessage(e) {
  if (e.data.type === 'cursor-move') {
    handleCursorMove(e.data);
  } else if (e.data.type === 'reload') {
    updateDocument();
  } else if (e.data.type === 'image-replace') {
    handleImageReplace(e.data);
  } else if (e.data.type === 'get-editor') {
    getEditor(e.data);
  } else if (e.data.type === 'node-update') {
    updateState(e.data);
  }
}

function updateDocument() {
  // Skip rerender if suppressed (e.g., during image updates)
  if (suppressRerender) return;
  const body = getInstrumentedHTML(window.view);
  port.postMessage({ set: "body", body });
}

function updateCursors() {
  const body = getInstrumentedHTML(window.view);
  port.postMessage({ set: 'cursors', body });
}

async function initProse(owner, repo, path, el) {
  prose = await import(
    "./prose.js"
  );

  const sourceUrl = `https://admin.da.live/source/${owner}/${repo}/${
    path.endsWith('/') ? `${path.replace(/^\//, '')}index.html` : `${path.replace(/^\//, '')}.html`
  }`;

  const resp = await checkPermissions(sourceUrl);
  if (!resp.ok) return;

  const permissions = resp.permissions;

  ({ proseEl, wsProvider } = prose.default({ 
    path: sourceUrl, 
    permissions, 
    rerenderPage: () => updateDocument(), 
    updateCursors: () => updateCursors(),
    getEditor: (data) => getEditor(data),
  }));

  el.append(proseEl);
}

async function signIn() {
  const token = await getToken();
  if (!token) {
    handleSignIn();
    await new Promise(() => {
      const signInListener = (e) => {
        try {
          const url = new URL(e.data);
          if (url.hash.includes('from_ims')) {
            window.location.reload();
          }
        } catch (e) {}
      }
      window.addEventListener('message', signInListener);
    });
  }
}

export default async function decorate(el) {
  el.innerHTML = "Waiting for connection...";

  await signIn();

  function initPort(e) {
    console.log("initPort", e);
    if (e.data?.init) {
      [port] = e.ports;

      // Tell the other side we are ready
      port.postMessage({ ready: true });

      el.innerHTML = "";

      // Going forward, all messages will be sent via the port
      port.onmessage = onMessage;

      const mountPoint = e.data.init.mountpoint;
      const path = e.data.location.pathname;

      // Parse the mountpoint URL to extract owner and repo
      if (mountPoint) {
        const url = new URL(mountPoint);
        const pathSegments = url.pathname.split("/").filter(Boolean);
        const owner = pathSegments[0];
        const repo = pathSegments[1];

        if (owner && repo) {
          // Store for use in image upload
          currentOwner = owner;
          currentRepo = repo;
          currentPath = path;

          initProse(owner, repo, path, el);
        }
      }
    }
  }
  // set up message channel
  window.addEventListener("message", initPort);
}
