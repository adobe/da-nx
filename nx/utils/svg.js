import { getConfig } from '../scripts/nexter.js';

const { nxBase } = getConfig();
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

  // Store the promise in the cache immediately
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

export async function link2svg(a) {
  const { textContent, href } = a;
  if (!(textContent.includes('.svg') || href.includes('.svg'))) return a;
  try {
    // Mine for URL and alt text
    const splitText = textContent.split('|');
    const textUrl = new URL(splitText.shift().trim());
    const altText = splitText.join('|').trim();

    let src = textUrl.hostname.includes('.hlx.') ? textUrl.pathname : textUrl;
    src = src.startsWith('/nx') ? src.replace('/nx', `${nxBase}`) : src;
    const svg = await getSvg({ paths: [src] });
    const icon = document.createElement('span');
    icon.className = 'nx-link-icon';
    icon.append(svg[0]);

    a.textContent = '';
    a.classList.add('nx-link');
    a.insertAdjacentElement('afterbegin', icon);
    a.insertAdjacentHTML('beforeend', `<span class="nx-link-text">${altText}</span>`);

    return a;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('Failed to create SVG.', e.message);
    return a;
  }
}

export default getSvg;
