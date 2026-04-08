import { loadStyle } from '../../utils/utils.js';
import './nx-canvas-header/nx-canvas-header.js';

const style = await loadStyle(import.meta.url);

const CHAT_PANEL_FRAGMENT = 'https://da.live/fragments/exp-workspace/chat';
const TOOL_PANEL_FRAGMENT = 'https://da.live/fragments/exp-workspace/tool';

async function toggleCanvasPanel(position) {
  const existing = document.querySelector(`aside.panel[data-position="${position}"]`);
  const {
    hidePanel,
    unhidePanel,
    openPanelWithFragment,
  } = await import('../../utils/panel.js');

  if (existing) {
    if (existing.hidden) unhidePanel(existing);
    else hidePanel(existing);
    return;
  }

  const beforeMain = position === 'before';
  await openPanelWithFragment({
    width: '400px',
    beforeMain,
    fragment: beforeMain ? CHAT_PANEL_FRAGMENT : TOOL_PANEL_FRAGMENT,
  });
}

export default async function decorate(block) {
  if (!document.adoptedStyleSheets.includes(style)) {
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, style];
  }
  const header = document.createElement('nx-canvas-header');
  header.addEventListener('nx-canvas-toggle-panel', (e) => {
    toggleCanvasPanel(e.detail.position);
  });
  block.before(header);
}
