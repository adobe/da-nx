import { loadStyle } from '../../../utils/utils.js';
import { loadHrefSvg, ICONS_BASE } from '../../../utils/svg.js';

const style = await loadStyle(import.meta.url);

export default async function createPanelHeader({ position, onClose }) {
  if (!document.adoptedStyleSheets.includes(style)) {
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, style];
  }
  const side = position === 'before' ? 'Left' : 'Right';
  const svg = await loadHrefSvg(`${ICONS_BASE}S2_Icon_Split${side}_20_N.svg`);

  const bar = document.createElement('div');
  bar.className = 'panel-header';

  const start = document.createElement('div');
  start.className = 'panel-header-custom';

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'panel-header-toggle';
  toggleBtn.setAttribute('aria-label', `Toggle ${position} panel`);
  if (svg) toggleBtn.append(svg);
  toggleBtn.addEventListener('click', onClose);

  bar.append(start, toggleBtn);
  return bar;
}
