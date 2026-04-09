import { loadStyle } from '../../utils/utils.js';
import {
  DEFAULT_PANEL_WIDTH_CSS,
  hidePanel,
  unhidePanel,
  openPanelWithFragment,
} from '../../utils/panel.js';
import './nx-canvas-header/nx-canvas-header.js';

const style = await loadStyle(import.meta.url);

const FRAGMENTS = {
  before: 'https://da.live/fragments/exp-workspace/chat',
  after: 'https://da.live/fragments/exp-workspace/tool',
};

async function addPanelHeader(aside) {
  const { default: createPanelHeader } = await import('./nx-panel-header/nx-panel-header.js');
  aside.querySelector('.panel-body').prepend(await createPanelHeader({
    position: aside.dataset.position,
    onClose: () => hidePanel(aside),
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
    width: DEFAULT_PANEL_WIDTH_CSS,
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
  header.addEventListener('nx-canvas-open-panel', (e) => {
    openCanvasPanel(e.detail.position);
  });
  block.before(header);

  document.addEventListener('nx-panels-restored', () => {
    document.querySelectorAll('aside.panel').forEach((aside) => {
      if (FRAGMENTS[aside.dataset.position] === aside.dataset.fragment) {
        addPanelHeader(aside);
      }
    });
  });
}
