/**
 * Full-page Skills Lab at `/apps/skills`.
 * Hash: `#/{org}/{site}/…` — first two segments set org/site for `da-skills-lab-view`.
 */
/* eslint-disable import/no-unresolved -- bundled / fragment-resolved at runtime */
import '../../deps/swc/dist/index.js';
import '../canvas/src/bootstrap-nx.js';
/* eslint-enable import/no-unresolved */
import '../browse/da-skills-lab-view.js';

function readOrgSiteFromHash() {
  const parts = (window.location.hash || '#').slice(2).split('/');
  return { org: parts[0] || '', site: parts[1] || '' };
}

export default function decorate(block) {
  block.innerHTML = `
    <sp-theme system="spectrum-two" scale="medium" color="light">
      <da-skills-lab-view></da-skills-lab-view>
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

  const view = block.querySelector('da-skills-lab-view');
  const syncFromHash = () => {
    if (!view) return;
    const { org, site } = readOrgSiteFromHash();
    view.org = org;
    view.site = site;
  };

  syncFromHash();
  window.addEventListener('hashchange', syncFromHash);
}
