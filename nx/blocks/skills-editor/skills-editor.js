/**
 * Full-page Skills Editor at `/apps/skills` (same shell as browse: chat + catalog).
 * Hash: `#/{org}/{site}` — org and site are the only required segments.
 */
/* eslint-disable import/no-unresolved -- bundled / fragment-resolved at runtime */
import '../../deps/swc/dist/index.js';
import '../canvas/src/bootstrap-nx.js';
/* eslint-enable import/no-unresolved */
import { bindBrowseBlockViewportFit } from '../browse/browse.js';

export default function decorate(block) {
  block.innerHTML = `
    <sp-theme system="spectrum-two" scale="medium" color="light">
      <da-browse-view apps-skills></da-browse-view>
    </sp-theme>
  `;
  block.style.display = 'flex';
  block.style.flexDirection = 'column';
  block.style.minHeight = '0';

  const theme = block.querySelector('sp-theme');
  if (theme) {
    theme.style.display = 'flex';
    theme.style.flexDirection = 'column';
    theme.style.flex = '1';
    theme.style.minHeight = '0';
    theme.style.height = '100%';
    theme.style.overflow = 'hidden';
  }

  const browse = block.querySelector('da-browse-view');
  if (browse) {
    browse.style.flex = '1';
    browse.style.minHeight = '0';
    browse.style.minWidth = '0';
    browse.style.width = '100%';
    browse.style.overflow = 'hidden';
  }

  requestAnimationFrame(() => bindBrowseBlockViewportFit(block));
}
