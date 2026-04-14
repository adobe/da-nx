/**
 * Full-page Skills Lab at `/apps/skills` (same shell as browse: chat + catalog).
 * Hash: `#/{org}/{site}/skills-lab` (same as browse Skills Lab route).
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

  requestAnimationFrame(() => bindBrowseBlockViewportFit(block));
}
