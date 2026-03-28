import { getConfig } from '../scripts/nx.js';

const { codeBase, iconSize } = getConfig();

export default function loadIcons(icons, size = iconSize) {
  for (const icon of icons) {
    const tmp = icon.classList[1].substring(5);
    const name = tmp.split('-')
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join('');
    const id = name.toLowerCase();
    const svg = `<svg viewBox="0 0 ${size} ${size}">
        <use href="${codeBase}/img/icons/S2_Icon_${name}_20_N.svg#${id}"></use>
    </svg>`;
    icon.innerHTML = svg;
  }
}

export const loadHrefSvg = async (href) => {
  const resp = await fetch(href);
  if (!resp.ok) return null;
  const text = await resp.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'image/svg+xml');
  return doc.querySelector('svg');
};
