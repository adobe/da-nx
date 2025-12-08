import { loadIms } from "../../utils/ims.js";
import { default as prose2aem } from "https://main--da-live--adobe.aem.live/blocks/shared/prose2aem.js?ref=local";

let port;

let prose;
let proseEl;
let wsProvider;

const EDITABLES = [
  { selector: 'h1', nodeName: 'H1' },
  { selector: 'h2', nodeName: 'H2' },
  { selector: 'h3', nodeName: 'H3' },
  { selector: 'h4', nodeName: 'H4' },
  { selector: 'h5', nodeName: 'H5' },
  { selector: 'h6', nodeName: 'H6' },
  { selector: 'p', nodeName: 'P' },
];
const EDITABLE_SELECTORS = EDITABLES.map((edit) => edit.selector).join(', ');

async function getToken() {
  const ims = await loadIms();
  if (ims.anonymous) return null;
  const { token } = ims.accessToken;
  return token;
}

function addEditorInstrumentation(editor) {
  const editableElements = editor.querySelectorAll(EDITABLE_SELECTORS);
  editableElements.forEach((editableElement) => {
    editableElement.setAttribute('contenteditable', 'true');
  });
}

// TODO move to a utils
export function getHtmlWithCursor(view) {
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
        // If we can't find the position, skip this h1
        // eslint-disable-next-line no-console
        console.warn('Could not find position for element:', e);
      }
    }
  });

  addEditorInstrumentation(editorClone);

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

function handleContentUpdate({ newText, cursorOffset }) {
  if (!window.view) return;

  const { state } = window.view;
  const { tr } = state;

  try {
    // Find the node at the cursor offset
    const $pos = state.doc.resolve(cursorOffset);
    const node = $pos.parent;

    // Check if this is a heading node
    if (node.type.name === "heading" || node.type.name === "paragraph") {
      // Calculate the start and end positions of the node content
      const start = cursorOffset;
      const end = start + node.content.size;

      // Replace the content with the new text
      tr.insertText(newText, start, end);

      // Dispatch the transaction
      window.view.dispatch(tr);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Error updating content:", error);
  }
}

function onMessage(e) {
  console.log("message", e);
  if (e.data.type === "content-update") {
    handleContentUpdate(e.data);
  }
}

function createPreview(daContent) {
  // TODO we probably want an official API to hook into updates vs hijacking setBody
  const daPreview = document.createElement("da-preview");
  daContent.shadowRoot.appendChild(daPreview);
  daPreview.setBody = () => {
    console.log(window.view);
    console.log("setBody");
    daPreview.body = getHtmlWithCursor(window.view);
    port.postMessage({ set: "body", body: daPreview.body });
  };
  return daPreview;
}

async function initProse(owner, repo, path) {
  prose = await import(
    "https://main--da-live--adobe.aem.live/blocks/edit/prose/index.js?ref=local"
  );

  const sourceUrl = `https://admin.da.live/source/${owner}/${repo}/${
    path === "/" ? "index.html" : `${path.replace(/^\//, "")}.html`
  }`;

  const resp = await checkPermissions(sourceUrl);
  if (!resp.ok) return;

  const permissions = resp.permissions;

  const daTitle = document.createElement("da-title");
  const daContent = document.createElement("da-content");

  const details = {
    editor: "edit",
    owner,
    repo,
    path,
    sourceUrl,
    permissions,
  };

  daTitle.permissions = permissions;
  daContent.permissions = permissions;

  daTitle.details = details;
  daContent.details = details;

  document.body.append(daTitle);
  document.body.append(daContent);

  ({ proseEl, wsProvider } = prose.default({ path: sourceUrl, permissions }));

  daContent.proseEl = proseEl;
  daContent.wsProvider = wsProvider;

  daTitle.proseEl = proseEl;
  daTitle.wsProvider = wsProvider;

  createPreview(daContent);
}

export default async function decorate(el) {
  el.innerHTML = "Waiting for connection...";

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
          initProse(owner, repo, path);
        }
      }
    }
  }
  // set up message channel
  window.addEventListener("message", initPort);
}
