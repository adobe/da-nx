import { checkPermissions, signIn, handlePreview, getImageCookie } from './src/utils.js';
import createProse from './src/prose.js';
import {
  updateDocument, updateCursors, updateState, handleUndoRedo, getEditor, handleCursorMove,
} from './src/render.js';
import { handleImageReplace } from './src/images.js';
import { MESSAGE_TYPES } from '../../utils/message-types.js';

function onMessage(e, ctx) {
  const { type, payload = {} } = e.data ?? {};

  if (type === MESSAGE_TYPES.CURSOR_MOVE) {
    handleCursorMove(payload, ctx);
  } else if (type === MESSAGE_TYPES.RELOAD) {
    updateDocument(ctx);
  } else if (type === MESSAGE_TYPES.IMAGE_REPLACE) {
    handleImageReplace(payload, ctx);
  } else if (type === MESSAGE_TYPES.GET_EDITOR) {
    getEditor(payload, ctx);
  } else if (type === MESSAGE_TYPES.NODE_UPDATE) {
    updateState(payload, ctx);
  } else if (type === MESSAGE_TYPES.HISTORY) {
    handleUndoRedo(payload, ctx);
  } else if (type === MESSAGE_TYPES.PREVIEW) {
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
    const isInit = e.data?.type === MESSAGE_TYPES.INIT;
    if (isInit) {
      const [port] = e.ports;

      el.innerHTML = '';

      const { config, location } = e.data.payload ?? {};
      const mountPoint = config?.mountpoint;
      const path = location?.pathname;

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
      port.postMessage({ type: MESSAGE_TYPES.READY });
    }
  }
  // set up message channel
  window.addEventListener('message', initPort);
}
