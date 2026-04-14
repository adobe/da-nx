import { loadStyle, hashChange } from '../../utils/utils.js';
import { hidePanel, unhidePanel, openPanelWithFragment } from '../../utils/panel.js';
import './nx-canvas-header/nx-canvas-header.js';
import './nx-editor-doc/nx-editor-doc.js';
import './nx-editor-wysiwyg/nx-editor-wysiwyg.js';

const style = await loadStyle(import.meta.url);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, style];

function isHtmlPath(path) {
  return typeof path === 'string' && path.toLowerCase().trim().endsWith('.html');
}

function buildCanvasDocPath(state) {
  const { org, site, path } = state || {};
  if (!org || !site || !path || !isHtmlPath(path)) return null;
  return `${org}/${site}/${path}`;
}

const FRAGMENTS = {
  before: 'https://da.live/fragments/exp-workspace/chat',
  after: 'https://da.live/fragments/exp-workspace/tool',
};

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

async function addPanelHeader(aside) {
  const { default: createPanelHeader } = await import('./nx-panel-header/nx-panel-header.js');
  const header = await createPanelHeader({
    position: aside.dataset.position,
    onClose: () => hidePanel(aside),
  });
  const panelBody = aside.querySelector('.panel-body');
  panelBody.prepend(header);

  // to enable adding actions to the header
  panelBody.dispatchEvent(new CustomEvent('nx-panel-slot', {
    detail: { slot: header.querySelector('.panel-header-custom') },
  }));
}

async function openCanvasPanel(position) {
  // Case 1: Panel is visible
  const existing = document.querySelector(`aside.panel[data-position="${position}"]`);
  if (existing && !existing.hidden) return;

  // Case 2: Panel is hidden
  if (existing?.hidden) {
    unhidePanel(existing);
    return;
  }

  // Case 3: Panel does not exist yet
  const aside = await openPanelWithFragment({
    width: '400px',
    beforeMain: position === 'before',
    fragment: FRAGMENTS[position],
  });

  // Add header to panel after crating
  addPanelHeader(aside);
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
  block.before(header);
  return header;
}

export default async function decorate(block) {
  const header = installCanvasHeader(block);

  const mountRoot = canvasEditorMountRoot(block);
  mountRoot.classList.add('nx-canvas-editor-mount');

  hashChange.subscribe((state) => {
    syncCanvasEditorsToHash({ mountRoot, header, state });
  });

  document.addEventListener('nx-panels-restored', () => {
    document.querySelectorAll('aside.panel').forEach((aside) => {
      if (FRAGMENTS[aside.dataset.position] === aside.dataset.fragment) {
        addPanelHeader(aside);
      }
    });
  });
}
