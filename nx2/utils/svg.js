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

const iconCache = new Map();

async function fetchIcon(path) {
  // Check if we already have a request in flight or completed
  if (iconCache.has(path)) {
    const cachedSvg = await iconCache.get(path);
    // Clone the node because an element can only exist in one place in the DOM
    return cachedSvg ? cachedSvg.cloneNode(true) : null;
  }

  const fetchPromise = (async () => {
    try {
      const resp = await fetch(path);
      if (!resp.ok) return null;

      const text = await resp.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'image/svg+xml');
      return doc.querySelector('svg');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Failed to fetch icon: ${path}`, err);
      return null;
    }
  })();

  iconCache.set(path, fetchPromise);

  const svg = await fetchPromise;
  return svg ? svg.cloneNode(true) : null;
}

export async function getSvg({ parent, paths }) {
  const svgs = await Promise.all(paths.map((path) => fetchIcon(path)));

  if (parent) {
    svgs.forEach((svg) => {
      if (svg) parent.append(svg);
    });
  }

  return svgs;
}

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
