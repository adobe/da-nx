import { getConfig } from '../nx.js';

const { codeBase, iconSize } = getConfig();

export default function loadIcons(icons, size = iconSize) {
  for (const icon of icons) {
    const name = icon.classList[1].substring(5);
    const svg = `<svg viewBox="0 0 ${size} ${size}">
        <use href="${codeBase}/img/icons/${name}.svg#${name}"></use>
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
