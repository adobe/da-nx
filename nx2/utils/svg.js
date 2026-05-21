import { getConfig } from '../scripts/nx.js';

const { codeBase, iconSize } = getConfig();

export const ICONS_BASE = new URL('../img/icons/', import.meta.url).href;

export const loadHrefSvg = (() => {
  const cache = {};

  return (href) => {
    cache[href] ??= (async () => {
      const resp = await fetch(href);
      if (!resp.ok) return null;
      const text = await resp.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'image/svg+xml');
      return doc.querySelector('svg');
    })();
    return cache[href];
  };
})();

export default function loadIcons({ paths, icons, size = iconSize }) {
  if (paths) return Promise.all(paths.map((path) => loadHrefSvg(path)));

  for (const icon of icons) {
    const tmp = icon.classList[1].substring(5);
    const name = tmp.split('-')
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join('');
    const id = name.toLowerCase();
    // For icons loaded as a <use href>, they must have domain and protocol match
    const svg = `<svg viewBox="0 0 ${size} ${size}">
        <use href="${codeBase}/img/icons/S2_Icon_${name}_20_N.svg#${id}"></use>
    </svg>`;
    icon.innerHTML = svg;
  }

  return icons;
}
