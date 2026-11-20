import { loadStyle } from '../../utils/utils.js';

const style = await loadStyle(import.meta.url);

const DEFAULT_TINT = '--s2-gray-75';

export const TINTS = {
  pink: '--s2-pink-100',
  purple: '--s2-purple-100',
  violet: '--s2-purple-100',
  indigo: '--s2-indigo-100',
  blue: '--s2-blue-100',
  seafoam: '--s2-seafoam-100',
  orange: '--s2-orange-100',
  gray: DEFAULT_TINT,
};

export function getTint(classList) {
  const option = [...classList].map((c) => c.toLowerCase()).find((c) => Object.hasOwn(TINTS, c));
  return option ? TINTS[option] : DEFAULT_TINT;
}

export default function init(el) {
  if (!document.adoptedStyleSheets.includes(style)) {
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, style];
  }
  el.style.setProperty('--teaser-bg', `var(${getTint(el.classList)})`);

  const cells = [...el.querySelectorAll(':scope > div > div')];
  const media = cells.find((cell) => cell.querySelector('picture'));
  const content = cells.find((cell) => cell !== media && cell.querySelector('h1, h2, h3, h4, h5, h6'))
    ?? cells.find((cell) => cell !== media && cell.textContent.trim());

  content?.classList.add('teaser-content');
  if (media) {
    media.classList.add('teaser-media');
  } else {
    el.classList.add('no-media');
    cells
      .filter((cell) => cell !== content && !cell.textContent.trim() && !cell.querySelector('img, picture'))
      .forEach((c) => c.remove());
  }

  const cta = [...(content?.querySelectorAll('p') ?? [])].reverse().find((p) => {
    const a = p.querySelector('a');
    const text = p.textContent.trim();
    return !!a && text !== '' && text === a.textContent.trim();
  });
  if (cta) {
    cta.classList.add('teaser-cta');
    cta.querySelector('a').classList.add('teaser-cta-link');
  }
}
