import { checkPermissions, signIn, handlePreview, checkLockdownImages } from './src/utils.js';
import createProse from './src/prose.js';
import {
  updateDocument, updateCursors, updateState, handleUndoRedo, getEditor, handleCursorMove,
} from './src/render.js';
import { handleImageReplace } from './src/images.js';

function onMessage(e, ctx) {
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
    if (e.data?.init) {
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
      ctx.lockdownImages = await checkLockdownImages(owner, repo);

      await initProse(owner, repo, path, el, ctx);

      // Going forward, all messages will be sent via the port
      port.onmessage = (event) => onMessage(event, ctx);

      // Tell the other side we are ready
      port.postMessage({ type: 'ready', ready: true, lockdownImages: ctx.lockdownImages });
    }
  }
  // set up message channel
  window.addEventListener('message', initPort);
}
