import { loadHrefSvg } from '../../utils/svg.js';

// Form icons, fetched once from .svg files and returned (cloned) by icon().
const FILES = {
  add: 'S2_Icon_Add_20_N',
  alert: 'S2_Icon_AlertTriangle_20_N',
  chevronUp: 'S2_Icon_ChevronUp_20_N',
  chevronDown: 'S2_Icon_ChevronDown_20_N',
  doubleLeft: 'S2_Icon_ChevronDoubleLeft_20_N',
  doubleRight: 'S2_Icon_ChevronDoubleRight_20_N',
  reorder: 'S2_Icon_SwitchVertical_20_N',
  remove: 'S2_Icon_Delete_20_N',
  settingsEdit: 'S2_Icon_SettingsEdit_20_N',
  confirm: 'S2_Icon_CheckmarkCircle_20_N',
  cancel: 'S2_Icon_CloseCircle_20_N',
};

const iconUrl = (file) => new URL(`../../img/icons/${file}.svg`, import.meta.url).href;

// Drop the intrinsic size (CSS sizes it) and route fills through currentColor.
function themeable(svg) {
  if (!svg) return null;
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.querySelectorAll('[fill]:not([fill="none"])')
    .forEach((el) => el.setAttribute('fill', 'currentColor'));
  return svg;
}

const cache = Object.fromEntries(
  await Promise.all(Object.entries(FILES).map(async ([name, file]) => {
    const svg = await loadHrefSvg(iconUrl(file));
    return [name, themeable(svg ? svg.cloneNode(true) : null)];
  })),
);

export function icon(name, className) {
  const svg = cache[name];
  if (!svg) return null;
  const clone = svg.cloneNode(true);
  if (className) clone.setAttribute('class', className);
  return clone;
}
