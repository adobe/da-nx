import { checkPermissions, signIn, handlePreview, getImageCookie } from './src/utils.js';
import createProse from './src/prose.js';
import {
  updateDocument, updateCursors, updateState, handleUndoRedo, getEditor, handleCursorMove,
} from './src/render.js';
import { handleImageReplace } from './src/images.js';
import { MESSAGE_TYPES } from '../../utils/message-types.js';

function onMessage(e, ctx) {
  // Prefer nested `payload` fields, falling back to the deprecated flat top-level
  // ones — da-live currently sends both (see blocks/canvas/editor-utils/editor-utils.js
  // and blocks/canvas/ew-editor-wysiwyg/utils/image.js).
  const data = e.data?.payload ? { ...e.data, ...e.data.payload } : e.data;

  if (data.type === MESSAGE_TYPES.CURSOR_MOVE) {
    handleCursorMove(data, ctx);
  } else if (data.type === MESSAGE_TYPES.RELOAD) {
    updateDocument(ctx);
  } else if (data.type === MESSAGE_TYPES.IMAGE_REPLACE) {
    handleImageReplace(data, ctx);
  } else if (data.type === MESSAGE_TYPES.GET_EDITOR) {
    getEditor(data, ctx);
  } else if (data.type === MESSAGE_TYPES.NODE_UPDATE) {
    updateState(data, ctx);
  } else if (data.type === MESSAGE_TYPES.HISTORY) {
    handleUndoRedo(data, ctx);
  } else if (data.type === MESSAGE_TYPES.PREVIEW) {
    handlePreview(ctx);
  }
}

async function initProse(owner, repo, path, el, ctx) {
  const sourceUrl = `https://admin.da.live/source/${owner}/${repo}/${
    path.endsWith('/') ? `${path.replace(/^\//, '')}index.html` : `${path.replace(/^\//, '')}.html`
  }`;

  const resp = await checkPermissions(sourceUrl);
  if (!resp.ok) return;

  const { permissions } = resp;

  const { proseEl, wsProvider, view } = createProse({
    path: sourceUrl,
    permissions,
    rerenderPage: () => updateDocument(ctx),
    updateCursors: () => updateCursors(ctx),
    getEditor: (data) => getEditor(data, ctx),
  });

  el.append(proseEl);

  ctx.view = view;
  ctx.wsProvider = wsProvider;
}

export default async function decorate(el) {
  el.innerHTML = 'Waiting for connection...';

  const ctx = {
    owner: null,
    repo: null,
    path: null,
    port: null,
    suppressRerender: false,
  };

  await signIn();

  async function initPort(e) {
    // @deprecated `init` presence check — prefer `type === MESSAGE_TYPES.INIT` (da-live
    // sends both).
    const isInit = e.data?.type === MESSAGE_TYPES.INIT || e.data?.[MESSAGE_TYPES.INIT] != null;
    if (isInit) {
      const [port] = e.ports;

      el.innerHTML = '';

      const mountPoint = e.data.init.mountpoint;
      const path = e.data.location.pathname;

      if (!mountPoint) {
        return;
      }

      // Parse the mountpoint URL to extract owner and repo
      const url = new URL(mountPoint);
      const pathSegments = url.pathname.split('/').filter(Boolean);
      const owner = pathSegments[0];
      const repo = pathSegments[1];

      if (!owner || !repo) {
        return;
      }

      ctx.owner = owner;
      ctx.repo = repo;
      ctx.path = path;
      ctx.port = port;

      await getImageCookie(owner, repo);

      await initProse(owner, repo, path, el, ctx);

      // Going forward, all messages will be sent via the port
      port.onmessage = (event) => onMessage(event, ctx);

      // Tell the other side we are ready
      // @deprecated flat `ready` — prefer `type: MESSAGE_TYPES.READY` (added alongside for
      // callers that already migrated their ack check).
      port.postMessage({ [MESSAGE_TYPES.READY]: true, type: MESSAGE_TYPES.READY });
    }
  }
  // set up message channel
  window.addEventListener('message', initPort);
}
