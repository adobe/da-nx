import { loadStyle, hashChange } from '../../../nx2/utils/utils.js';
import { openPanel } from '../../../nx2/utils/panel.js';
import { getEWFlags } from '../../../nx2/utils/ewFlags.js';
import './header.js';
import decorateEditor from './editor.js';

// Workspace layout is light-DOM (it sizes the block container and the docked
// chat panel), so it adopts on the document rather than an element shadow.
const style = await loadStyle(import.meta.url);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, style];

// Engage the app-frame panel grid even when the page didn't declare it.
function ensureAppFrame() {
  let meta = document.head.querySelector('meta[name="template"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'template';
    document.head.append(meta);
  }
  meta.content = 'app-frame';
}

const WORKSPACE_NAV_PATH = '/fragments/exp-workspace/nav';

// Use the workspace nav (breadcrumb + actions), like canvas. Read by nav.js,
// which loads after this block decorates. Page nav-path wins.
function ensureNavPath() {
  if (document.head.querySelector('meta[name="nav-path"]')) return;
  const meta = document.createElement('meta');
  meta.name = 'nav-path';
  meta.content = WORKSPACE_NAV_PATH;
  document.head.append(meta);
}

function openChatPanel() {
  return openPanel({
    position: 'before',
    width: '400px',
    getContent: async () => {
      await import('../../../nx2/blocks/chat/chat.js');
      return document.createElement('nx-chat');
    },
  });
}

// Header sits before the block (outside its scroll region), so it stays put.
function installHeader(block) {
  const header = document.createElement('nx-form-header');
  header.addEventListener('form-toggle-chat', () => openChatPanel());
  block.before(header);
  return header;
}

// The chat workspace (header toggle + docked chat) is gated on the `ew.enabled`
// flag for the current site. Read once from the hash on load — the form
// workspace is scoped to a single org/site.
async function setupChat(block) {
  let state;
  const unsubscribe = hashChange.subscribe((s) => { state = s; });
  unsubscribe();

  const { org, site } = state ?? {};
  if (!org || !site) return;

  const flags = await getEWFlags({ org, site });
  if (flags['ew.enabled'] !== 'true') return;

  installHeader(block);
  await openChatPanel();
}

// Block entry: EW surfaces the form via an `nx-form` content block, which NX
// loads as `nx/blocks/form/form.js`. This wrapper sets up the canvas-style
// workspace (app-frame grid, and — when EW is enabled — the header + docked
// chat) around the form editor (editor.js). The form and chat both read the
// `#/org/site/path` hash, so they stay in sync.
export default async function decorate(block) {
  ensureAppFrame();
  ensureNavPath();

  decorateEditor(block);

  await setupChat(block);
}
