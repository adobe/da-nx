import { html, nothing } from 'da-lit';
import { getConfig } from '../../../../nx2/scripts/nx.js';

const { codeBase } = getConfig();

const FILES = {
  addCircle: 's2-icon-addcircle-20-n',
  alert: 's2-icon-alerttriangle-20-n',
  arrowUp: 's2-icon-arrowupsend-20-n',
  copy: 's2-icon-copy-20-n',
  delete: 's2-icon-delete-20-n',
  edit: 's2-icon-edit-20-n',
  filter: 's2-icon-filter-20-n',
  info: 's2-icon-infocircle-20-n',
  openIn: 's2-icon-openin-20-n',
};

// S2 icon from the site's icon set, as in nx2's chat and pills; `label` makes it a labelled image.
export function icon({ name, className, label }) {
  return html`
    <svg class=${className ?? nothing} viewBox="0 0 20 20" width="18" height="18"
      role=${label ? 'img' : nothing} aria-label=${label ?? nothing}
      aria-hidden=${label ? nothing : 'true'}><use href="${codeBase}/img/icons/${FILES[name]}.svg#icon"></use></svg>`;
}
