import { getConfig } from '../scripts/nx.js';

const { codeBase } = getConfig();

export default function loadIcons(icons) {
  for (const icon of icons) {
    const name = icon.classList[1].substring(5);
    const svg = `<svg>
        <use href="${codeBase}/img/icons/s2-icon-${name}-20-n.svg#icon"></use>
    </svg>`;
    icon.innerHTML = svg;
  }
}

export async function picture2svg(picture) {
  const img = picture.querySelector('[src*=".svg"]');
  const { src } = img;
  // Prevent a duplicate download of the image
  picture.replaceChildren();
  const resp = await fetch(src);
  const text = await resp.text();
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  picture.replaceWith(svg);
}

export const loadHrefSvg = async (href) => {
  const resp = await fetch(href);
  if (!resp.ok) return null;
  const text = await resp.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'image/svg+xml');
  return doc.querySelector('svg');
};
