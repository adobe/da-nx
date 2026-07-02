import { loadStyle, hashChange } from '../../../nx2/utils/utils.js';
import { openPanel, getPanelStore } from '../../../nx2/utils/panel.js';
import { getEWFlags } from '../../../nx2/utils/ewFlags.js';
import { getConfig } from '../../../nx2/scripts/nx.js';
import decorateEditor from './editor.js';

// Workspace layout is light-DOM (it sizes the block container and the docked
// chat panel), so it adopts on the document rather than an element shadow.
const style = await loadStyle(import.meta.url);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, style];

const { codeBase } = getConfig();
const CHAT_TOGGLE_ICON = `${codeBase}/img/icons/s2-icon-splitleft-20-n.svg#icon`;

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

// Remember the chat's open/closed state per browser session, so a refresh
// keeps the user's choice.
const CHAT_SESSION_KEY = 'nx-chat-open';

function isChatOpen() {
  try {
    return !!sessionStorage.getItem(CHAT_SESSION_KEY);
  } catch {
    return false;
  }
}

function setChatOpen(open) {
  try {
    if (open) sessionStorage.setItem(CHAT_SESSION_KEY, '1');
    else sessionStorage.removeItem(CHAT_SESSION_KEY);
  } catch { /* ignore */ }
}

async function openChatPanel() {
  const store = getPanelStore();
  const width = store.before?.width ?? '400px';
  const aside = await openPanel({
    position: 'before',
    width,
    getContent: async () => {
      await import('../../../nx2/blocks/chat/chat.js');
      return document.createElement('nx-chat');
    },
  });
  if (aside) {
    setChatOpen(true);
    aside.addEventListener('nx-panel-close', () => setChatOpen(false), { once: true });
  }
  return aside;
}

// A floating toggle at the top-left of the canvas opens the chat panel. The
// anchor is a zero-height element in the main flow (so its left edge is the
// canvas edge, not the viewport — clearing the left rail); the button is
// absolutely positioned within it. It sits before the block (outside its scroll
// region) so it stays put, and hides itself while the chat is open — see form.css.
function installChatToggle(block) {
  const anchor = document.createElement('div');
  anchor.className = 'form-chat-toggle-anchor';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'form-chat-toggle';
  btn.setAttribute('aria-label', 'Toggle chat');
  btn.innerHTML = `<svg aria-hidden="true" viewBox="0 0 20 20"><use href="${CHAT_TOGGLE_ICON}"></use></svg>`;
  btn.addEventListener('click', () => openChatPanel());
  anchor.append(btn);
  block.before(anchor);
  return btn;
}

// The chat workspace (toggle + docked chat) is gated on the `ew.enabled`
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

  installChatToggle(block);
  if (isChatOpen()) await openChatPanel();
}

// Block entry: EW surfaces the form via an `nx-form` content block, which NX
// loads as `nx/blocks/form/form.js`. This wrapper sets up the canvas-style
// workspace (app-frame grid, and — when EW is enabled — a floating chat toggle
// + docked chat) around the form editor (editor.js). The form and chat both
// read the `#/org/site/path` hash, so they stay in sync.
export default async function decorate(block) {
  ensureAppFrame();
  ensureNavPath();

  decorateEditor(block);

  await setupChat(block);
}
