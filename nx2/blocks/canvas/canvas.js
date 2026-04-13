import { loadStyle, hashChange } from '../../utils/utils.js';
import { hidePanel, unhidePanel, openPanelWithFragment } from '../../utils/panel.js';
import './nx-canvas-header/nx-canvas-header.js';

const style = await loadStyle(import.meta.url);

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

function applyCanvasEditorView(mountRoot, view) {
  const v = normalizeCanvasEditorView(view);
  const doc = mountRoot.querySelector('nx-editor-doc');
  const frame = mountRoot.querySelector('nx-editor-wysiwyg');
  if (doc) doc.hidden = v !== 'content';
  if (frame) frame.hidden = v !== 'layout';
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

export default async function decorate(block) {
  if (!document.adoptedStyleSheets.includes(style)) {
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, style];
  }

  const header = document.createElement('nx-canvas-header');
  try {
    header.editorView = normalizeCanvasEditorView(sessionStorage.getItem(CANVAS_EDITOR_VIEW_KEY));
  } catch {
    header.editorView = 'layout';
  }
  header.addEventListener('nx-canvas-open-panel', (e) => {
    openCanvasPanel(e.detail.position);
  });
  header.addEventListener('nx-canvas-editor-view', (e) => {
    const view = normalizeCanvasEditorView(e.detail?.view);
    try {
      sessionStorage.setItem(CANVAS_EDITOR_VIEW_KEY, view);
    } catch {
      /* ignore quota / private mode */
    }
    const root = block.querySelector('.nx-canvas-editor-mount') || block.querySelector('.default-content') || block;
    applyCanvasEditorView(root, view);
  });
  block.before(header);

  const mountRoot = block.querySelector('.default-content') || block;
  mountRoot.classList.add('nx-canvas-editor-mount');

  mountRoot.addEventListener('nx-wysiwyg-port-ready', (e) => {
    const editor = mountRoot.querySelector('nx-editor-doc');
    const port = e.detail?.port;
    if (editor && port) {
      editor.quickEditPort = port;
    }
  });

  let docEditorModule = null;
  let wysiwygFrameModule = null;
  hashChange.subscribe((state) => {
    const fullPath = buildCanvasDocPath(state);
    if (!fullPath) {
      mountRoot.querySelector('nx-editor-doc')?.remove();
      mountRoot.querySelector('nx-editor-wysiwyg')?.remove();
      return;
    }
    docEditorModule ??= import('./nx-editor-doc/nx-editor-doc.js');
    wysiwygFrameModule ??= import('./nx-editor-wysiwyg/nx-editor-wysiwyg.js');
    Promise.all([docEditorModule, wysiwygFrameModule]).then(() => {
      let el = mountRoot.querySelector('nx-editor-doc');
      if (!el) {
        el = document.createElement('nx-editor-doc');
        mountRoot.append(el);
      }
      el.org = state.org;
      el.repo = state.site;
      el.path = fullPath;

      let frame = mountRoot.querySelector('nx-editor-wysiwyg');
      if (!frame) {
        frame = document.createElement('nx-editor-wysiwyg');
        mountRoot.append(frame);
      }
      frame.org = state.org;
      frame.repo = state.site;
      frame.path = fullPath;

      const view = normalizeCanvasEditorView(header.editorView);
      applyCanvasEditorView(mountRoot, view);
    });
  });

  document.addEventListener('nx-panels-restored', () => {
    document.querySelectorAll('aside.panel').forEach((aside) => {
      if (FRAGMENTS[aside.dataset.position] === aside.dataset.fragment) {
        addPanelHeader(aside);
      }
    });
  });
}
