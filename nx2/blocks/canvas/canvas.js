import { loadStyle, hashChange } from '../../utils/utils.js';
import { getPanelStore, openPanel } from '../../utils/panel.js';
import './nx-canvas-header/nx-canvas-header.js';
import './nx-editor-doc/nx-editor-doc.js';
import './nx-editor-wysiwyg/nx-editor-wysiwyg.js';

const style = await loadStyle(import.meta.url);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, style];

function buildCanvasDocPath(state) {
  const { org, site, path } = state || {};
  if (!org || !site || !path) return null;
  return `${org}/${site}/${path}`;
}

const CANVAS_EDITOR_VIEW_KEY = 'nx-canvas-editor-view';

function normalizeCanvasEditorView(view) {
  return view === 'content' ? 'content' : 'layout';
}

function notifyCanvasEditorActive(mountRoot, view) {
  const v = normalizeCanvasEditorView(view);
  mountRoot.dispatchEvent(new CustomEvent('nx-canvas-editor-active', {
    bubbles: false,
    detail: { view: v },
  }));
}

function readPersistedCanvasEditorView() {
  try {
    return normalizeCanvasEditorView(sessionStorage.getItem(CANVAS_EDITOR_VIEW_KEY));
  } catch {
    return 'layout';
  }
}

function persistCanvasEditorView(view) {
  try {
    sessionStorage.setItem(CANVAS_EDITOR_VIEW_KEY, normalizeCanvasEditorView(view));
  } catch {
    /* ignore if browser disallows session storage */
  }
}

function canvasEditorMountRoot(block) {
  return block.querySelector('.default-content') || block;
}

function canvasHeaderApplyTarget(block) {
  return block.querySelector('.nx-canvas-editor-mount')
    || block.querySelector('.default-content')
    || block;
}

function removeCanvasEditors(mountRoot) {
  mountRoot.querySelector('nx-editor-doc')?.remove();
  mountRoot.querySelector('nx-editor-wysiwyg')?.remove();
}

function ensureNxEditorDoc(mountRoot) {
  let el = mountRoot.querySelector('nx-editor-doc');
  if (!el) {
    el = document.createElement('nx-editor-doc');
    mountRoot.append(el);
  }
  return el;
}

function ensureNxEditorWysiwyg(mountRoot) {
  let frame = mountRoot.querySelector('nx-editor-wysiwyg');
  if (!frame) {
    frame = document.createElement('nx-editor-wysiwyg');
    mountRoot.append(frame);
  }
  return frame;
}

function editorCtxFromHashState(state, fullPath) {
  return { org: state.org, repo: state.site, path: fullPath };
}

function syncCanvasEditorsToHash({ mountRoot, header, state }) {
  header.undoAvailable = false;
  header.redoAvailable = false;
  const fullPath = buildCanvasDocPath(state);
  if (!fullPath) {
    removeCanvasEditors(mountRoot);
    return;
  }
  const ctx = editorCtxFromHashState(state, fullPath);
  ensureNxEditorDoc(mountRoot).ctx = ctx;
  ensureNxEditorWysiwyg(mountRoot).ctx = ctx;
  notifyCanvasEditorActive(mountRoot, header.editorView);
}

const CANVAS_PANELS = {
  before: {
    width: '400px',
    getContent: async () => {
      await import('../chat/chat.js');
      return document.createElement('nx-chat');
    },
  },
  after: {
    width: '400px',
    getContent: async () => {
      await import('../tool-panel/tool-panel.js');
      const toolPanel = document.createElement('nx-tool-panel');
      toolPanel.views = [];
      return toolPanel;
    },
  },
};

async function openCanvasPanel(position) {
  const config = CANVAS_PANELS[position];
  if (!config) return;
  const store = getPanelStore();
  const width = store[position]?.width ?? config.width;
  await openPanel({ position, width, getContent: config.getContent });
}

function installCanvasHeader(block) {
  const header = document.createElement('nx-canvas-header');
  header.editorView = readPersistedCanvasEditorView();
  header.addEventListener('nx-canvas-open-panel', (e) => {
    openCanvasPanel(e.detail.position);
  });
  header.addEventListener('nx-canvas-editor-view', (e) => {
    const view = normalizeCanvasEditorView(e.detail?.view);
    persistCanvasEditorView(view);
    notifyCanvasEditorActive(canvasHeaderApplyTarget(block), view);
  });
  header.addEventListener('nx-canvas-undo', () => {
    canvasEditorMountRoot(block).querySelector('nx-editor-doc')?.undo();
  });
  header.addEventListener('nx-canvas-redo', () => {
    canvasEditorMountRoot(block).querySelector('nx-editor-doc')?.redo();
  });
  block.before(header);
  return header;
}

export default async function decorate(block) {
  const header = installCanvasHeader(block);

  const mountRoot = canvasEditorMountRoot(block);
  mountRoot.classList.add('nx-canvas-editor-mount');

  mountRoot.addEventListener('nx-editor-undo-state', (e) => {
    header.undoAvailable = e.detail?.canUndo ?? false;
    header.redoAvailable = e.detail?.canRedo ?? false;
  });

  hashChange.subscribe((state) => {
    syncCanvasEditorsToHash({ mountRoot, header, state });
  });

  // Restore panels opened by canvas (no fragment URL). Fragment-based entries are legacy
  // data handled by restorePanels() in nx.js.
  const store = getPanelStore();
  if (store.before && !store.before.fragment) openCanvasPanel('before');
  if (store.after && !store.after.fragment) openCanvasPanel('after');
}
