import { html, nothing } from 'da-lit';
import { getConfig } from '../../scripts/nx.js';

const { codeBase } = getConfig();

// Form icons, loaded from the content repository sprites via <use href>.
const FILES = {
  add: 's2-icon-add-20-n',
  alert: 's2-icon-alerttriangle-20-n',
  chevronUp: 's2-icon-chevronup-20-n',
  chevronDown: 's2-icon-chevrondown-20-n',
  doubleLeft: 's2-icon-chevrondoubleleft-20-n',
  doubleRight: 's2-icon-chevrondoubleright-20-n',
  reorder: 's2-icon-switchvertical-20-n',
  remove: 's2-icon-delete-20-n',
  settingsEdit: 's2-icon-settingsedit-20-n',
  confirm: 's2-icon-checkmarkcircle-20-n',
  cancel: 's2-icon-closecircle-20-n',
};

export function icon(name, className) {
  const file = FILES[name];
  if (!file) return nothing;
  return html`<svg class=${className || nothing} viewBox="0 0 20 20" aria-hidden="true"><use href="${codeBase}/img/icons/${file}.svg#icon"></use></svg>`;
}
